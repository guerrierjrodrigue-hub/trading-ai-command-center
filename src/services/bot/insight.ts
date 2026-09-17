import type { MarketDataProvider } from "@/services/market/types";
import { scanMarket } from "@/services/scanner/scanner";
import { atr, isUptrend, lastValid } from "@/services/market/indicators";
import { round } from "@/lib/utils";
import { selectBest } from "./strategies/select";
import { detectRegime, regimePolicy } from "./regime";
import { tradeScore } from "./tradeScore";
import { RISK_PROFILES, ALLOW_SHORT, HIGHER_TF, type RiskProfileName } from "./auto";
import type { Side, StrategyName } from "./strategies/types";

/**
 * Live, per-asset explanation of what the autonomous bot sees and WHY it is (or
 * isn't) entering — computed with the SAME logic the bot uses (regime + unified
 * Trade Score), so "prêt/attente" here always matches what the bot actually
 * does. Read-only; it never trades.
 */
export interface BotInsightRow {
  symbol: string;
  price: number;
  trend: string; // UP / DOWN / NEUTRAL (from the scanner)
  regime: string; // detected market-regime label
  side: Side | null; // direction of the best setup found (null if none)
  strategy: string | null; // best book strategy for this asset (null if none)
  quality: number; // unified Trade Score (0..100)
  threshold: number; // the Trade Score threshold to enter
  held: boolean; // already an open bot position?
  willEnter: boolean; // would the bot actually open here right now?
  reason: string; // plain-French explanation
}

export async function botInsight(
  provider: MarketDataProvider,
  profileName: string,
  heldSymbols: ReadonlySet<string> = new Set(),
  excluded: ReadonlySet<string> = new Set(),
): Promise<BotInsightRow[]> {
  const profile = RISK_PROFILES[profileName as RiskProfileName] ?? RISK_PROFILES.BALANCED;
  const scans = await scanMarket(provider, { assetClasses: ["CRYPTO", "FOREX"] });
  const rows: BotInsightRow[] = [];

  for (const s of scans) {
    const held = heldSymbols.has(s.symbol);
    const base = { symbol: s.symbol, price: s.price, trend: s.trend, threshold: profile.minTradeScore, held };

    const candles = await provider.getCandles(s.symbol, profile.timeframe, 200).catch(() => []);
    const regimeInfo = candles.length >= 60 ? detectRegime(candles) : null;
    const regimeLabel = regimeInfo?.label ?? "—";

    if (held) {
      rows.push({ ...base, regime: regimeLabel, side: null, strategy: null, quality: 0, willEnter: false, reason: "Déjà en position — le robot la gère (stop / objectif / stop suiveur)." });
      continue;
    }
    if (!regimeInfo) {
      rows.push({ ...base, regime: regimeLabel, side: null, strategy: null, quality: 0, willEnter: false, reason: "Pas assez de données historiques pour décider." });
      continue;
    }

    const policy = regimePolicy(regimeInfo.regime);
    if (policy.blockEntries) {
      rows.push({ ...base, regime: regimeLabel, side: null, strategy: null, quality: 0, willEnter: false, reason: `${regimeInfo.label} — le robot n'ouvre rien (protection).` });
      continue;
    }

    const excludedSet = new Set(excluded) as Set<StrategyName>;
    const best = selectBest(candles, profile.entryScore, excludedSet, ALLOW_SHORT && policy.allowShort, policy.allowLong);
    // Same two signal sources as the planner: a book strategy, or the scanner's
    // live trend/momentum, so this panel matches what the bot actually does.
    let sigSide: Side;
    let sigStrategy: string;
    let sigQuality: number;
    let bookStop: number | undefined;
    let bookTp: number | undefined;
    if (best) {
      sigSide = best.side;
      sigStrategy = best.name;
      sigQuality = best.quality;
      bookStop = best.stop;
      bookTp = best.takeProfit;
    } else if (s.direction !== "NEUTRAL" && !(s.direction === "LONG" && !policy.allowLong) && !(s.direction === "SHORT" && !(ALLOW_SHORT && policy.allowShort))) {
      const side = s.direction as Side;
      // Momentum strength in the trade's OWN direction — the planner requires it
      // to clear the profile's entryScore BEFORE scoring, so mirror that here or
      // the panel would show "prête" for a candidate the bot actually skips.
      const strength = side === "LONG" ? s.score : 100 - s.score;
      if (strength < profile.entryScore) {
        rows.push({ ...base, regime: regimeLabel, side, strategy: "MOMENTUM", quality: strength, willEnter: false, reason: `momentum ${side === "LONG" ? "achat" : "vente"} trop faible (${strength} < ${profile.entryScore}).` });
        continue;
      }
      sigSide = side;
      sigStrategy = "MOMENTUM";
      sigQuality = strength;
    } else {
      rows.push({ ...base, regime: regimeLabel, side: null, strategy: null, quality: 0, willEnter: false, reason: "Aucun signal (ni config du livre, ni tendance claire)." });
      continue;
    }

    // Recreate the candidate geometry exactly like the planner, to score it.
    const entry = s.price;
    let stop: number;
    let tp: number;
    if (sigSide === "LONG") {
      if (bookStop != null && bookTp != null && bookStop < entry && entry < bookTp) {
        stop = bookStop;
        tp = bookTp;
      } else {
        const a = lastValid(atr(candles, 14)) ?? (entry * profile.fallbackStopPct) / 100;
        stop = entry - profile.atrMult * a;
        tp = entry + profile.rr * (entry - stop);
      }
    } else {
      if (bookStop != null && bookTp != null && bookTp < entry && entry < bookStop) {
        stop = bookStop;
        tp = bookTp;
      } else {
        const a = lastValid(atr(candles, 14)) ?? (entry * profile.fallbackStopPct) / 100;
        stop = entry + profile.atrMult * a;
        tp = entry - profile.rr * (stop - entry);
      }
    }

    const htf = HIGHER_TF[profile.timeframe];
    let htfAgree = true;
    if (htf) {
      const htfCandles = await provider.getCandles(s.symbol, htf, 200).catch(() => []);
      if (htfCandles.length >= 60) {
        const up = isUptrend(htfCandles.map((c) => c.close));
        htfAgree = sigSide === "LONG" ? up : !up;
      }
    }
    const rr = Math.abs(tp - entry) / Math.max(Math.abs(entry - stop), 1e-9);
    const regimeAligned =
      (sigSide === "LONG" && regimeInfo.direction === "UP") ||
      (sigSide === "SHORT" && regimeInfo.direction === "DOWN");
    const ts = tradeScore({ candles, side: sigSide, rr: round(rr, 2), strategyQuality: sigQuality, htfAgree, regimeAligned });
    const willEnter = ts.score >= profile.minTradeScore;
    const sideLabel = sigSide === "LONG" ? "achat" : "vente à découvert";
    const reason = willEnter
      ? `${sigStrategy} (${sideLabel}) · score ${ts.score} ≥ seuil ${profile.minTradeScore} — prête (sous réserve des limites de risque).`
      : `${sigStrategy} (${sideLabel}) · score ${ts.score} < seuil ${profile.minTradeScore}${!regimeAligned ? " (à contre-tendance)" : ""} — pas assez solide.`;

    rows.push({ ...base, regime: regimeLabel, side: sigSide, strategy: sigStrategy, quality: ts.score, willEnter, reason });
  }

  return rows;
}
