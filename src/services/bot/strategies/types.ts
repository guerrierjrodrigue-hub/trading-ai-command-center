import type { Candle } from "@/services/market/types";

/** Every strategy the bot understands (manual + book strategies). */
export type StrategyName =
  | "EMA_CROSS"
  | "RSI"
  | "MACD"
  | "BREAKOUT"
  | "TREND_FOLLOWING"
  | "FIB_CONFLUENCE"
  | "BIG_BOUNCE"
  | "BREAK_HOOK_GO"
  | "DIVERGENCE";

/**
 * Uniform result every strategy returns. `quality` (0..100) lets the autonomous
 * selector compare strategies and pick the best setup for each asset.
 * `stop`/`takeProfit`, when present, are the strategy's own levels (from the
 * book) and take precedence over the bot's fixed % / ATR stops.
 */
export interface StrategyEval {
  name: StrategyName;
  long: boolean; // a qualifying setup fired (see StrategySignal.side for its direction)
  quality: number; // 0..100 confidence in the setup (0 when long=false)
  reason: string;
  stop?: number;
  takeProfit?: number;
}

/** Trade direction. */
export type Side = "LONG" | "SHORT";

/**
 * A selected setup with its direction. The book strategies are written
 * long-only; a SHORT signal is the SAME setup detected on the mirrored price
 * series (see selectBest / evaluateAllShort), so long and short are perfectly
 * symmetric.
 */
export interface StrategySignal extends StrategyEval {
  side: Side;
}

export function isClose(a: number, b: number, tolPct: number): boolean {
  if (b === 0) return false;
  return Math.abs(a - b) / b <= tolPct;
}

/** Nearest "psychological" round level for a price at its own scale. */
export function psychLevel(price: number): number {
  if (price <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(price)));
  const step = mag / 2;
  return Math.round(price / step) * step;
}

/** True if the last candle closed up (a basic bullish confirmation). */
export function lastBullish(candles: Candle[]): boolean {
  const c = candles[candles.length - 1];
  return !!c && c.close > c.open;
}

export function clampQuality(q: number): number {
  return Math.max(0, Math.min(100, Math.round(q)));
}
