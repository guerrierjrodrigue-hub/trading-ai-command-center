import { round } from "@/lib/utils";
import type { Candle } from "@/services/market/types";
import type { Side, StrategyEval, StrategySignal } from "./types";
import { evaluate as fib } from "./fibonacci";
import { evaluate as bigBounce } from "./bigBounce";
import { evaluate as breakHookGo } from "./breakHookGo";
import { evaluate as divergence } from "./divergence";

/** The book strategies the autonomous bot chooses among. */
export const BOOK_STRATEGIES = [fib, bigBounce, breakHookGo, divergence] as const;

/** Evaluates every book strategy on an asset (LONG setups). */
export function evaluateAll(candles: Candle[]): StrategyEval[] {
  return BOOK_STRATEGIES.map((fn) => fn(candles));
}

/**
 * Reflection reference: mirror the price series around the mid of its range so
 * the mirrored series stays positive and in the same band. A SHORT setup on the
 * real series is, mathematically, the book's LONG setup on this mirror:
 *   - EMA is affine-linear  -> ema(ref - x) = ref - ema(x)  (uptrend <-> downtrend)
 *   - RSI flips             -> rsi becomes 100 - rsi         (bullish div <-> bearish div)
 *   - MACD histogram flips sign; highs<->lows; a bullish close becomes bearish.
 * So we reuse the exact book logic and map the resulting stop/TP back.
 */
function reflectRef(candles: Candle[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  return lo + hi;
}

function reflect(candles: Candle[], ref: number): Candle[] {
  return candles.map((c) => ({
    time: c.time,
    open: ref - c.open,
    high: ref - c.low, // a high becomes a low under reflection
    low: ref - c.high,
    close: ref - c.close,
    volume: c.volume,
  }));
}

/**
 * Evaluates the book's LONG setups on the MIRRORED series -> SHORT setups on the
 * real one. The mirrored stop/TP (stop < price' < TP) map back to real levels
 * with stop > price > TP, i.e. proper short geometry.
 */
export function evaluateAllShort(candles: Candle[]): StrategyEval[] {
  if (candles.length < 60) {
    return evaluateAll(candles).map((e) => ({ name: e.name, long: false, quality: 0, reason: e.reason }));
  }
  const ref = reflectRef(candles);
  const mirrored = reflect(candles, ref);
  return BOOK_STRATEGIES.map((fn) => {
    const e = fn(mirrored);
    if (!e.long) return { name: e.name, long: false, quality: 0, reason: e.reason };
    return {
      name: e.name,
      long: true,
      quality: e.quality,
      reason: `Miroir baissier — ${e.reason}`,
      stop: e.stop != null ? round(ref - e.stop, 6) : undefined,
      takeProfit: e.takeProfit != null ? round(ref - e.takeProfit, 6) : undefined,
    };
  });
}

/**
 * Picks the single best setup across all book strategies for this asset,
 * requiring `minQuality`. With `allowShort`, SHORT setups (mirror of the book's
 * long setups) compete on equal footing and the highest-quality wins — so the
 * autonomous bot can profit whether the market rises OR falls. `excluded`
 * strategies (negative expectancy, from the feedback loop) are skipped.
 * Returns null when nothing qualifies.
 */
export function selectBest(
  candles: Candle[],
  minQuality = 55,
  excluded?: ReadonlySet<string>,
  allowShort = false,
  allowLong = true,
): StrategySignal | null {
  const ok = (e: StrategyEval) => e.long && e.quality >= minQuality && !excluded?.has(e.name);
  const longs: StrategySignal[] = allowLong
    ? evaluateAll(candles)
        .filter(ok)
        .map((e) => ({ ...e, side: "LONG" as Side }))
    : [];
  const shorts: StrategySignal[] = allowShort
    ? evaluateAllShort(candles)
        .filter(ok)
        .map((e) => ({ ...e, side: "SHORT" as Side }))
    : [];
  const all = [...longs, ...shorts];
  if (!all.length) return null;
  all.sort((a, b) => b.quality - a.quality);
  return all[0];
}
