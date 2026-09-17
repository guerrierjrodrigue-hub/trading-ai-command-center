import { round } from "@/lib/utils";
import { atr, isUptrend, lastValid } from "@/services/market/indicators";
import { scanMarket, scoreOpportunity } from "@/services/scanner/scanner";
import { selectBest } from "./strategies/select";
import { detectRegime, regimeExcluded, regimePolicy, type Regime } from "./regime";
import { tradeScore } from "./tradeScore";
import type { Side, StrategyName } from "./strategies/types";
import type { MarketDataProvider } from "@/services/market/types";
import type { Timeframe } from "@/lib/validation";

/** Higher timeframe used to confirm the trend before entering (multi-TF filter). */
export const HIGHER_TF: Partial<Record<Timeframe, Timeframe>> = {
  "1m": "15m", "5m": "1h", "15m": "1h", "30m": "4h", "1h": "4h", "4h": "1D", "1D": "1W",
};

export type RiskProfileName = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

export interface RiskProfile {
  label: string;
  riskPerTradePct: number;
  maxOpenPositions: number;
  maxExposurePct: number;
  entryScore: number; // min AI Opportunity Score to enter
  exitScore: number; // close if score falls below this
  atrMult: number; // stop distance = atrMult × ATR
  rr: number; // reward:risk for take-profit
  timeframe: Timeframe;
  avoidHighRisk: boolean; // skip HIGH-volatility assets
  fallbackStopPct: number; // if ATR unavailable
  maxDrawdownPct: number; // circuit-breaker: halt the bot past this peak-to-now drawdown
  trailPct: number; // trailing-stop distance (fraction), tighter = locks profit sooner
  minTradeScore: number; // min unified Trade Score (0..100) required to enter
  maxWeeklyLossPct: number; // halt new entries past this 7-day realized loss
  maxPerAssetExposurePct: number; // cap exposure to a single asset (% of equity)
  maxConsecutiveLosses: number; // pause new entries after this losing streak (anti-revenge)
}

/** Circuit-breaker default used in MANUAL mode (AUTO uses the profile's value). */
export const DEFAULT_MAX_DRAWDOWN_PCT = 20;

/** Trailing-stop distance used in MANUAL mode (AUTO uses the profile's value). */
export const DEFAULT_TRAIL_PCT = 0.06;

/** Risk-hardening defaults used in MANUAL mode (AUTO uses the profile's values). */
export const DEFAULT_MIN_TRADE_SCORE = 70;
export const DEFAULT_MAX_WEEKLY_LOSS_PCT = 8;
export const DEFAULT_MAX_PER_ASSET_EXPOSURE_PCT = 25;
export const DEFAULT_MAX_CONSECUTIVE_LOSSES = 4;

/**
 * Presets. The bot derives EVERYTHING from the chosen profile in AUTO mode:
 * which assets (scanner), when to enter/exit (score + trend), stop distance
 * (ATR-based), sizing, position count and exposure.
 */
export const RISK_PROFILES: Record<RiskProfileName, RiskProfile> = {
  CONSERVATIVE: {
    label: "Prudent",
    riskPerTradePct: 0.5,
    maxOpenPositions: 2,
    maxExposurePct: 25,
    entryScore: 68,
    exitScore: 48,
    atrMult: 2.5,
    rr: 2.5,
    timeframe: "1D",
    avoidHighRisk: true,
    fallbackStopPct: 4,
    maxDrawdownPct: 10,
    trailPct: 0.04,
    minTradeScore: 78,
    maxWeeklyLossPct: 6,
    maxPerAssetExposurePct: 15,
    maxConsecutiveLosses: 3,
  },
  BALANCED: {
    label: "Équilibré",
    riskPerTradePct: 1,
    maxOpenPositions: 4,
    maxExposurePct: 50,
    entryScore: 60,
    exitScore: 45,
    atrMult: 2,
    rr: 2,
    timeframe: "1D",
    avoidHighRisk: false,
    fallbackStopPct: 5,
    maxDrawdownPct: 18,
    trailPct: 0.06,
    minTradeScore: 70,
    maxWeeklyLossPct: 8,
    maxPerAssetExposurePct: 25,
    maxConsecutiveLosses: 4,
  },
  AGGRESSIVE: {
    label: "Agressif",
    riskPerTradePct: 2,
    maxOpenPositions: 6,
    maxExposurePct: 80,
    entryScore: 55,
    exitScore: 42,
    atrMult: 1.5,
    rr: 1.8,
    timeframe: "4h",
    avoidHighRisk: false,
    fallbackStopPct: 7,
    maxDrawdownPct: 28,
    trailPct: 0.09,
    minTradeScore: 62,
    maxWeeklyLossPct: 12,
    maxPerAssetExposurePct: 35,
    maxConsecutiveLosses: 5,
  },
};

export interface AutoCloseDecision {
  id: string;
  reason: string;
}
export interface AutoOpenCandidate {
  symbol: string;
  entry: number;
  stop: number;
  tp: number;
  side: Side; // LONG (buy) or SHORT (sell to open)
  reason: string;
  strategy: string; // which strategy produced this candidate
  regime: Regime; // market regime detected for this asset
  score: number; // unified Trade Score (0..100)
  htfAgree: boolean; // higher-timeframe trend agrees with the direction
}

interface HeldPosition {
  id: string;
  side: Side;
  asset: { symbol: string };
}

/**
 * Whether the autonomous bot may open SHORT positions (profit when price falls)
 * in addition to LONG. Both directions use the same book strategies (short = the
 * setup on the mirrored series) and the same risk management. PAPER only.
 */
export const ALLOW_SHORT = true;

/**
 * Decides, from the scanner + volatility, which held positions to exit on
 * signal and which new assets to enter — all shaped by the risk profile.
 */
export async function autoPlan(
  provider: MarketDataProvider,
  profile: RiskProfile,
  held: HeldPosition[],
  excluded?: ReadonlySet<string>,
): Promise<{ closes: AutoCloseDecision[]; candidates: AutoOpenCandidate[]; skipped: { symbol: string; reason: string }[] }> {
  const closes: AutoCloseDecision[] = [];
  const skipped: { symbol: string; reason: string }[] = [];
  const heldSymbols = new Set(held.map((p) => p.asset.symbol));

  // Signal-based exits for held positions — mirrored by direction. A LONG exits
  // when the bullish case weakens (low score or downtrend); a SHORT exits when
  // the bullish case STRENGTHENS against it (high score or uptrend).
  for (const pos of held) {
    const [candles, quote] = await Promise.all([
      provider.getCandles(pos.asset.symbol, profile.timeframe, 200).catch(() => []),
      provider.getQuote(pos.asset.symbol).catch(() => null),
    ]);
    if (!candles.length || !quote) continue;
    const scan = scoreOpportunity(candles, quote);
    if (pos.side === "LONG") {
      if (scan.score < profile.exitScore || scan.trend === "DOWN") {
        closes.push({ id: pos.id, reason: `score IA ${scan.score} < ${profile.exitScore} ou tendance baissière` });
      }
    } else {
      if (scan.score > 100 - profile.exitScore || scan.trend === "UP") {
        closes.push({ id: pos.id, reason: `signal haussier contre la vente à découvert (score ${scan.score}, tendance ${scan.trend})` });
      }
    }
  }

  // Entry candidates: the scanner supplies the universe (ordered by score); for
  // EACH asset the bot then asks "which book strategy fires best here?" via the
  // strategy selector. Only assets with a qualifying named strategy are entered,
  // and that strategy's own SL/TP (from the book) are used. This is how the
  // autonomous bot CHOOSES its strategy per asset.
  //
  // UNIVERSE: crypto (CoinGecko, free/24-7) + forex & gold (OANDA practice,
  // free, generous limits). Stocks/ETF are excluded because the free Twelve Data
  // plan (800 calls/day) can't sustain a scanner running every few minutes.
  // Forex/gold markets close on weekends; the covers()/skip guard treats a
  // closed market as "unavailable" so no position is opened on a stale price.
  const results = await scanMarket(provider, { assetClasses: ["CRYPTO", "FOREX"] }); // sorted by score desc
  const candidates: AutoOpenCandidate[] = [];
  for (const r of results.slice(0, 25)) {
    if (profile.avoidHighRisk && r.risk === "HIGH") continue;
    if (heldSymbols.has(r.symbol)) continue;

    const candles = await provider.getCandles(r.symbol, profile.timeframe, 200).catch(() => []);
    if (candles.length < 60) continue;

    // STRATEGY MANAGER: classify the market regime and only allow the
    // strategies + directions that suit it (and skip entirely in extreme vol).
    const regimeInfo = detectRegime(candles);
    const policy = regimePolicy(regimeInfo.regime);
    if (policy.blockEntries) {
      skipped.push({ symbol: r.symbol, reason: `${regimeInfo.label} — pas de nouvelle position` });
      continue;
    }
    const regExcluded = new Set<StrategyName>(regimeExcluded(regimeInfo.regime));
    for (const s of excluded ?? []) regExcluded.add(s as StrategyName);

    // SIGNAL — the bot reacts to the live market from TWO sources:
    //  1) a book strategy (Fib/Bounce/BHG/Divergence) when a clean setup fires;
    //  2) otherwise the scanner's live trend/momentum (direction + strength),
    //     so the bot still acts on real market moves instead of waiting for the
    //     rare book patterns. Either way the trade is risk-managed and must clear
    //     the unified Trade Score below.
    const best = selectBest(
      candles,
      profile.entryScore,
      regExcluded,
      ALLOW_SHORT && policy.allowShort,
      policy.allowLong,
    );
    let sigSide: Side;
    let sigStrategy: string;
    let sigQuality: number;
    let sigReason: string;
    let bookStop: number | undefined;
    let bookTp: number | undefined;
    if (best) {
      sigSide = best.side;
      sigStrategy = best.name;
      sigQuality = best.quality;
      sigReason = best.reason;
      bookStop = best.stop;
      bookTp = best.takeProfit;
    } else {
      // Live trend/momentum from the scanner.
      if (r.direction === "NEUTRAL") {
        skipped.push({ symbol: r.symbol, reason: "aucun signal (marché sans direction claire)" });
        continue;
      }
      const side = r.direction as Side;
      if (side === "LONG" && !policy.allowLong) continue;
      if (side === "SHORT" && !(ALLOW_SHORT && policy.allowShort)) continue;
      // Strength of the signal in the trade's OWN direction (0..100).
      const strength = side === "LONG" ? r.score : 100 - r.score;
      if (strength < profile.entryScore) {
        skipped.push({ symbol: r.symbol, reason: `momentum ${side === "LONG" ? "achat" : "vente"} trop faible (${strength} < ${profile.entryScore})` });
        continue;
      }
      sigSide = side;
      sigStrategy = "MOMENTUM";
      sigQuality = strength;
      sigReason = `momentum en direct (${r.setup})`;
    }

    const entry = r.price;
    // Use the strategy's own levels when consistent with the live price (LONG:
    // stop < entry < TP; SHORT: TP < entry < stop); otherwise derive an ATR-based
    // stop as a safe fallback, mirrored by direction.
    let stop: number;
    let tp: number;
    if (sigSide === "LONG") {
      if (bookStop != null && bookTp != null && bookStop < entry && entry < bookTp) {
        stop = round(bookStop, 6);
        tp = round(bookTp, 6);
      } else {
        const a = lastValid(atr(candles, 14)) ?? (entry * profile.fallbackStopPct) / 100;
        stop = round(entry - profile.atrMult * a, 6);
        if (stop <= 0 || stop >= entry) continue;
        tp = round(entry + profile.rr * (entry - stop), 6);
      }
    } else {
      if (bookStop != null && bookTp != null && bookTp < entry && entry < bookStop) {
        stop = round(bookStop, 6);
        tp = round(bookTp, 6);
      } else {
        const a = lastValid(atr(candles, 14)) ?? (entry * profile.fallbackStopPct) / 100;
        stop = round(entry + profile.atrMult * a, 6);
        tp = round(entry - profile.rr * (stop - entry), 6);
        if (tp <= 0 || tp >= entry) continue;
      }
    }
    // Higher-timeframe agreement (part of the score, and a hard filter later).
    const htf = HIGHER_TF[profile.timeframe];
    let htfAgree = true;
    if (htf) {
      const htfCandles = await provider.getCandles(r.symbol, htf, 200).catch(() => []);
      if (htfCandles.length >= 60) {
        const up = isUptrend(htfCandles.map((c) => c.close));
        htfAgree = sigSide === "LONG" ? up : !up;
      }
    }

    // UNIFIED TRADE SCORE: no single factor decides — the total must clear the
    // profile's threshold. This filters out mediocre setups.
    const rr = Math.abs(tp - entry) / Math.max(Math.abs(entry - stop), 1e-9);
    const regimeAligned =
      (sigSide === "LONG" && regimeInfo.direction === "UP") ||
      (sigSide === "SHORT" && regimeInfo.direction === "DOWN");
    const ts = tradeScore({ candles, side: sigSide, rr, strategyQuality: sigQuality, htfAgree, regimeAligned });
    if (ts.score < profile.minTradeScore) {
      skipped.push({ symbol: r.symbol, reason: `${sigStrategy} ${sigSide === "LONG" ? "achat" : "vente"} score ${ts.score} < seuil ${profile.minTradeScore} (régime ${regimeInfo.label})` });
      continue;
    }

    candidates.push({
      symbol: r.symbol,
      entry,
      stop,
      tp,
      side: sigSide,
      reason: `[${sigStrategy}] ${sigReason} · signal ${sigQuality}/100 · score ${ts.score}/100 · régime ${regimeInfo.label}`,
      strategy: sigStrategy,
      regime: regimeInfo.regime,
      score: ts.score,
      htfAgree,
    });
  }

  return { closes, candidates, skipped };
}
