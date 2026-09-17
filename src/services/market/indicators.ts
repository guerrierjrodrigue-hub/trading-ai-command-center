import type { Candle } from "./types";

/** Simple Moving Average. Warmup positions are NaN. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential Moving Average, seeded with the SMA of the first `period`. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. Warmup positions are NaN. */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i])
      ? NaN
      : emaFast[i] - emaSlow[i],
  );
  // Signal = EMA of the (defined part of the) MACD line.
  const firstIdx = macdLine.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstIdx >= 0) {
    const slice = macdLine.slice(firstIdx);
    const sig = ema(slice, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
  }
  const histogram = macdLine.map((v, i) =>
    Number.isNaN(v) || Number.isNaN(signal[i]) ? NaN : v - signal[i],
  );
  return { macd: macdLine, signal, histogram };
}

/** Average True Range. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose),
      ),
    );
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Last non-NaN value of a series (or null). */
export function lastValid(series: number[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (!Number.isNaN(series[i])) return series[i];
  }
  return null;
}

export type Trend = "UP" | "DOWN" | "SIDEWAYS";

/** Simple trend read from fast vs slow EMA + slope. */
export function detectTrend(closes: number[]): Trend {
  if (closes.length < 60) return "SIDEWAYS";
  const fast = lastValid(ema(closes, 20));
  const slow = lastValid(ema(closes, 50));
  if (fast === null || slow === null) return "SIDEWAYS";
  const spread = (fast - slow) / slow;
  if (spread > 0.005) return "UP";
  if (spread < -0.005) return "DOWN";
  return "SIDEWAYS";
}

/** Medium-term uptrend gate (institutional 50/100 MAs). Used as a higher-timeframe filter. */
export function isUptrend(closes: number[]): boolean {
  const e50 = lastValid(ema(closes, 50));
  const e100 = lastValid(ema(closes, 100));
  if (e50 !== null && e100 !== null) return e50 > e100;
  const e20 = lastValid(ema(closes, 20));
  const e50b = lastValid(ema(closes, 50));
  return e20 !== null && e50b !== null ? e20 > e50b : false;
}

/** Naive support/resistance from recent swing low/high. */
export function supportResistance(
  candles: Candle[],
  lookback = 60,
): { support: number; resistance: number } {
  const slice = candles.slice(-lookback);
  const support = Math.min(...slice.map((c) => c.low));
  const resistance = Math.max(...slice.map((c) => c.high));
  return { support, resistance };
}
