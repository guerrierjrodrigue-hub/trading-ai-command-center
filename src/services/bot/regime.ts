import { atr, ema, lastValid } from "@/services/market/indicators";
import { round } from "@/lib/utils";
import type { Candle } from "@/services/market/types";
import type { StrategyName } from "./strategies/types";

/**
 * Market-regime detection + a Strategy Manager. A strategy that shines in a
 * trend can be catastrophic in a range, so the bot first classifies the market,
 * then only allows the strategies (and directions) that suit that regime — and
 * refuses to open anything at all when volatility is extreme (risk-off).
 *
 * Uses EMA20/EMA50 (computable from ~90 daily candles, unlike EMA100) for
 * direction and ATR% for volatility.
 */
export type Regime = "TRENDING_BULL" | "TRENDING_BEAR" | "RANGE" | "HIGH_VOL" | "LOW_VOL";

export interface RegimeInfo {
  regime: Regime;
  direction: "UP" | "DOWN" | "NEUTRAL";
  volatility: "HIGH" | "NORMAL" | "LOW";
  atrPct: number; // ATR as a % of price
  label: string; // short French label
}

/** ATR% (daily) above this = extreme volatility -> risk-off. */
const HIGH_VOL_ATR_PCT = 6;
/** ATR% below this = very calm market. */
const LOW_VOL_ATR_PCT = 1.5;
/** EMA20/EMA50 separation (% of price) above this = a real directional trend. */
const TREND_SEP_PCT = 0.8;

const LABELS: Record<Regime, string> = {
  TRENDING_BULL: "Tendance haussière",
  TRENDING_BEAR: "Tendance baissière",
  RANGE: "Range (sans tendance)",
  HIGH_VOL: "Volatilité extrême",
  LOW_VOL: "Faible volatilité",
};

export function detectRegime(candles: Candle[]): RegimeInfo {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? 0;
  const e20 = lastValid(ema(closes, 20));
  const e50 = lastValid(ema(closes, 50));
  const a = lastValid(atr(candles, 14));
  const atrPct = a != null && price > 0 ? (a / price) * 100 : 0;

  const volatility: RegimeInfo["volatility"] =
    atrPct >= HIGH_VOL_ATR_PCT ? "HIGH" : atrPct > 0 && atrPct <= LOW_VOL_ATR_PCT ? "LOW" : "NORMAL";

  let direction: RegimeInfo["direction"] = "NEUTRAL";
  if (e20 != null && e50 != null && price > 0) {
    const sepPct = (Math.abs(e20 - e50) / price) * 100;
    if (sepPct >= TREND_SEP_PCT) direction = e20 > e50 ? "UP" : "DOWN";
  }

  // Extreme volatility dominates (risk-off); then direction; then range/low-vol.
  let regime: Regime;
  if (volatility === "HIGH") regime = "HIGH_VOL";
  else if (direction === "UP") regime = "TRENDING_BULL";
  else if (direction === "DOWN") regime = "TRENDING_BEAR";
  else regime = volatility === "LOW" ? "LOW_VOL" : "RANGE";

  return { regime, direction, volatility, atrPct: round(atrPct, 2), label: LABELS[regime] };
}

export interface RegimePolicy {
  blockEntries: boolean; // true = don't open anything (risk-off)
  allowLong: boolean;
  allowShort: boolean;
  allowedStrategies: readonly StrategyName[]; // book strategies permitted here
  note: string;
}

const ALL_BOOK: readonly StrategyName[] = ["FIB_CONFLUENCE", "BIG_BOUNCE", "BREAK_HOOK_GO", "DIVERGENCE", "V2H4_GOLD"];

/**
 * The Strategy Manager. Philosophy (revised): the regime INFORMS the decision —
 * it feeds the unified Trade Score (a trade aligned with the regime earns the
 * "trend aligned" points, a counter-trend one does not) — rather than vetoing
 * whole directions or strategies outright. A hard veto silently killed every
 * qualifying setup in a sustained trend (e.g. bullish reversals that fire when a
 * downtrend gets oversold), which looked like the bot was broken.
 *
 * The one hard rule kept is genuine protection: in EXTREME volatility the bot
 * opens nothing. Everywhere else both directions and all book strategies are
 * allowed, and the Trade Score threshold decides — so a counter-trend trade must
 * be exceptional on structure/momentum/R:R to make up for the alignment points
 * it loses.
 */
export function regimePolicy(regime: Regime): RegimePolicy {
  if (regime === "HIGH_VOL") {
    return { blockEntries: true, allowLong: false, allowShort: false, allowedStrategies: [], note: "Volatilité extrême — aucune nouvelle position (protection)." };
  }
  const notes: Record<Exclude<Regime, "HIGH_VOL">, string> = {
    TRENDING_BULL: "Tendance haussière — les achats alignés sont favorisés par le score.",
    TRENDING_BEAR: "Tendance baissière — les ventes à découvert alignées sont favorisées par le score.",
    RANGE: "Range — les deux sens sont permis, le score arbitre.",
    LOW_VOL: "Faible volatilité — toutes les stratégies, le score arbitre.",
  };
  return { blockEntries: false, allowLong: true, allowShort: true, allowedStrategies: ALL_BOOK, note: notes[regime] };
}

/** Strategies to EXCLUDE in this regime (kept for API compatibility; none now). */
export function regimeExcluded(regime: Regime): Set<StrategyName> {
  const allowed = new Set(regimePolicy(regime).allowedStrategies);
  return new Set(ALL_BOOK.filter((s) => !allowed.has(s)));
}
