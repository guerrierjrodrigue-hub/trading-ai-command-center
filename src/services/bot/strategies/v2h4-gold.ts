import { round } from "@/lib/utils";
import { atr, lastValid } from "@/services/market/indicators";
import type { Candle, MarketDataProvider } from "@/services/market/types";
import { clampQuality, type Side, type StrategyEval } from "./types";

/**
 * V2-H4 Or (book): a classic Donchian-55 breakout traded on H4 gold (XAU/USD),
 * built from M15 candles the caller fetches (this module does no I/O of its
 * own — see fetchAndEvaluateGold for the one place that talks to the market
 * data provider). Long-only shape like every book strategy; evaluateAllShort()
 * (select.ts) mirrors it for SHORT.
 *
 *   - Aggregate M15 -> H4.
 *   - Channel = 55 H4 bars strictly BEFORE the latest closed bar (shift 1) —
 *     the current bar's own range never contaminates its own breakout test.
 *   - Close breaks above the channel high  -> LONG.
 *   - Close breaks below the channel low   -> SHORT.
 *   - SL = 1.5 x ATR(14, H4); TP = 3R (3x the SL distance).
 */

const H4_SECONDS = 4 * 60 * 60;
const M15_SECONDS = 15 * 60;
/** Source candles coarser than this can't sensibly aggregate into H4 buckets. */
const MAX_SOURCE_SPACING_SECONDS = 30 * 60;

export const DONCHIAN_PERIOD = 55;
export const ATR_PERIOD = 14;
export const SL_ATR_MULT = 1.5;
export const TP_R_MULT = 3;
export const DEFAULT_RISK_PCT = 1;

/** The exact tradeable parameters of this strategy — see strategyFingerprint(). */
export const V2H4_CONFIG = {
  instrument: "XAU/USD",
  donchianPeriod: DONCHIAN_PERIOD,
  atrPeriod: ATR_PERIOD,
  stopAtrMultiple: SL_ATR_MULT,
  takeProfitR: TP_R_MULT,
} as const;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 fingerprint of V2H4_CONFIG's canonical (key-sorted) JSON. Lets the
 * dashboard show, right next to the strategy name, a short hash proving the
 * live parameters match whatever was backtested — any change to the config
 * changes this value. Uses the standard Web Crypto API (available in Node
 * and in the browser), so it's safe to call from a client component too.
 */
export async function strategyFingerprint(): Promise<string> {
  const sortedKeys = Object.keys(V2H4_CONFIG).sort();
  const canonical: Record<string, unknown> = {};
  for (const key of sortedKeys) canonical[key] = (V2H4_CONFIG as Record<string, unknown>)[key];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical)));
  return toHex(digest);
}
/** M15 bars fetched for the dedicated OANDA integration — comfortably covers
 * more than DONCHIAN_PERIOD+1 (56) closed H4 bars, with margin for ATR warmup
 * and weekend/holiday gaps: 1200 M15 / 16 per H4 bar ~= 75 H4 bars. */
export const DEFAULT_M15_FETCH_LIMIT = 1200;

/** Aggregates M15 candles into 4h (H4) candles, bucketed on fixed UTC boundaries. */
export function buildH4(m15: Candle[]): Candle[] {
  if (!m15.length) return [];
  const sorted = [...m15].sort((a, b) => a.time - b.time);
  const buckets = new Map<number, Candle[]>();
  for (const c of sorted) {
    const start = Math.floor(c.time / H4_SECONDS) * H4_SECONDS;
    const group = buckets.get(start);
    if (group) group.push(c);
    else buckets.set(start, [c]);
  }
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((start) => {
      const group = buckets.get(start)!; // time-sorted (built from `sorted`)
      let high = -Infinity;
      let low = Infinity;
      let volume = 0;
      for (const c of group) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
        volume += c.volume;
      }
      return {
        time: start,
        open: group[0].open,
        high,
        low,
        close: group[group.length - 1].close,
        volume,
      };
    });
}

export interface DonchianSignal {
  side: Side | null;
  entry: number; // the current (latest closed) bar's close
  channelHigh: number;
  channelLow: number;
  reason: string;
}

/**
 * Donchian-55 breakout, SHIFTED by 1: the channel spans the `period` bars
 * strictly before the last one, so the last bar's own high/low never counts
 * toward its own breakout test.
 */
export function donchianSignal(h4: Candle[], period = DONCHIAN_PERIOD): DonchianSignal | null {
  if (h4.length < period + 1) return null;
  const current = h4[h4.length - 1];
  const channelBars = h4.slice(h4.length - 1 - period, h4.length - 1);
  const channelHigh = Math.max(...channelBars.map((c) => c.high));
  const channelLow = Math.min(...channelBars.map((c) => c.low));

  let side: Side | null = null;
  if (current.close > channelHigh) side = "LONG";
  else if (current.close < channelLow) side = "SHORT";

  const reason = side
    ? `Cassure Donchian ${period} H4 ${side === "LONG" ? "haussière" : "baissière"} — close ${current.close.toFixed(2)} vs canal [${channelLow.toFixed(2)}, ${channelHigh.toFixed(2)}] (55 barres précédentes)`
    : `Pas de cassure — close ${current.close.toFixed(2)} dans le canal [${channelLow.toFixed(2)}, ${channelHigh.toFixed(2)}]`;
  return { side, entry: current.close, channelHigh, channelLow, reason };
}

export interface ClosedSignal extends DonchianSignal {
  h4: Candle[]; // closed H4 bars used, oldest -> newest
  atrValue: number | null;
}

/**
 * Aggregates M15 -> H4, keeps only H4 bars fully CLOSED as of `now` (drops the
 * still-forming bucket so there is never any look-ahead), then runs the
 * shifted Donchian-55 breakout on the latest closed bar. Returns null when
 * there isn't yet enough closed H4 history.
 */
export function latestClosedSignal(
  m15: Candle[],
  now: Date,
  period = DONCHIAN_PERIOD,
): ClosedSignal | null {
  const h4 = buildH4(m15);
  const nowSec = Math.floor(now.getTime() / 1000);
  const closed = h4.filter((c) => c.time + H4_SECONDS <= nowSec);
  if (closed.length < period + 1) return null;

  const signal = donchianSignal(closed, period);
  if (!signal) return null;
  const atrValue = lastValid(atr(closed, ATR_PERIOD));
  return { ...signal, h4: closed, atrValue };
}

export interface Levels {
  stop: number;
  takeProfit: number;
}

/** SL = 1.5xATR from entry; TP = 3R (3x the SL distance) — mirrored by side. */
export function levels(entry: number, atrValue: number, side: Side): Levels {
  const slDist = SL_ATR_MULT * atrValue;
  const tpDist = TP_R_MULT * slDist;
  return side === "LONG"
    ? { stop: round(entry - slDist, 6), takeProfit: round(entry + tpDist, 6) }
    : { stop: round(entry + slDist, 6), takeProfit: round(entry - tpDist, 6) };
}

/**
 * Whole-unit position size for a `riskPct`-risk stop, floored down (OANDA
 * position sizes are whole units) — 0 when the account is too small to risk
 * even one unit's worth of stop distance.
 */
export function calculateUnits(
  capital: number,
  stopDistance: number,
  riskPct = DEFAULT_RISK_PCT,
): number {
  if (capital <= 0 || stopDistance <= 0 || riskPct <= 0) return 0;
  const riskAmount = capital * (riskPct / 100);
  return Math.floor(riskAmount / stopDistance);
}

/** Median spacing between consecutive candles, in seconds (robust to a gap or two). */
function medianSpacingSeconds(candles: Candle[]): number {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].time - sorted[i - 1].time);
  if (!gaps.length) return Infinity;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/**
 * Book-strategy wrapper: `candles` must be M15 bars (any symbol — gold in
 * practice). Aggregates to H4, evaluates the shifted Donchian-55 breakout on
 * the latest CLOSED H4 bar and — on a LONG signal — computes SL (1.5xATR) /
 * TP (3R) via levels() and a suggested size via calculateUnits() (1% risk of
 * `capital`). Long-only, like every book strategy: a native SHORT breakout is
 * intentionally NOT reported here — select.ts's evaluateAllShort() finds it by
 * re-running this same function on the mirrored price series.
 */
export function evaluate(candles: Candle[], now: Date = new Date(), capital = 10_000): StrategyEval {
  const out = (long: boolean, quality: number, reason: string, stop?: number, takeProfit?: number): StrategyEval => ({
    name: "V2H4_GOLD",
    long,
    quality: long ? clampQuality(quality) : 0,
    reason,
    stop,
    takeProfit,
  });

  if (medianSpacingSeconds(candles) > MAX_SOURCE_SPACING_SECONDS) {
    return out(false, 0, "timeframe incompatible (V2-H4 Or attend des bougies M15)");
  }

  const signal = latestClosedSignal(candles, now);
  if (!signal) return out(false, 0, "historique H4 insuffisant (moins de 56 bougies H4 closes)");
  if (signal.side !== "LONG" || signal.atrValue == null) return out(false, 0, signal.reason);

  const { stop, takeProfit } = levels(signal.entry, signal.atrValue, "LONG");
  const units = calculateUnits(capital, signal.entry - stop);
  return out(
    true,
    68,
    `${signal.reason} · SL 1.5×ATR(${ATR_PERIOD}) · TP 3R · taille suggérée ${units} unité(s) (risque ${DEFAULT_RISK_PCT}% de ${capital}$)`,
    stop,
    takeProfit,
  );
}

/**
 * The one place this strategy talks to the market: fetches enough M15
 * XAU/USD bars from the given provider (OANDA in production, routed the same
 * way as every other symbol — this never bypasses or reimplements the
 * provider) and evaluates the book signal on them. Provided for a dedicated
 * gold-H4 integration; the generic bot runner keeps working unmodified via
 * `evaluate()` registered in select.ts's BOOK_STRATEGIES.
 */
export async function fetchAndEvaluateGold(
  provider: MarketDataProvider,
  capital = 10_000,
  now: Date = new Date(),
  symbol = "XAU/USD",
  m15Limit = DEFAULT_M15_FETCH_LIMIT,
): Promise<StrategyEval> {
  const m15 = await provider.getCandles(symbol, "15m", m15Limit);
  return evaluate(m15, now, capital);
}
