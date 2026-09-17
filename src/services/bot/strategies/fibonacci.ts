import { ema, lastValid, macd, rsi } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";
import { clampQuality, type StrategyEval } from "./types";

/**
 * Fibonacci + confluence strategy, faithful to the user's trading book
 * ("Apex Paragon — Atlas Edition"). Long-only, matches the bot's design.
 *
 * The method, step by step (from the book):
 *  1. Trade WITH the trend — Fibonacci doesn't tell direction, you must know it.
 *  2. Find the last IMPULSIVE up-leg (swing low -> swing high) and measure it.
 *  3. Wait for a CORRECTIVE pullback into the retracement zone:
 *       38.2% (BHG), 50% (hybride), 61.8% (Big Bounce), 78.6% (mega BB).
 *  4. Require CONFLUENCE with structure: moving average (50/100/200),
 *     support, or a psychological round level.
 *  5. Check CONVERGENCE (RSI/MACD not diverging bearishly) = green light.
 *  6. Stop-loss at 88.6% (shallow entries) or 113% (deep entries) retracement.
 *  7. Take-profit at the 127.2% extension (partial-profit friendly).
 */

export interface FibSignal {
  long: boolean;
  reason: string;
  stop?: number;
  takeProfit?: number;
  confluences?: string[];
}

const FIB = { entryMin: 0.382, entryMax: 0.786, deep: 0.618, sl886: 0.886, sl113: 1.13, ext: 1.272 };

function near(a: number, b: number, tolPct: number): boolean {
  if (b === 0) return false;
  return Math.abs(a - b) / b <= tolPct;
}

/** Nearest "psychological" round level for a price at its own scale. */
function psychLevel(price: number): number {
  if (price <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(price)));
  const step = mag / 2; // e.g. price ~100 -> step 50; ~1.2 -> step 0.05
  return Math.round(price / step) * step;
}

export function analyzeFib(candles: Candle[]): FibSignal {
  if (candles.length < 60) return { long: false, reason: "données insuffisantes pour Fibonacci" };
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];

  // Moving averages (also reused for confluence below). The book uses the
  // institutional 50/100/200 MAs.
  const e50 = lastValid(ema(closes, 50));
  const e100 = lastValid(ema(closes, 100));
  const e200 = lastValid(ema(closes, 200));

  // 1) Medium-term uptrend required — Fibonacci only applies WITH the trend.
  //    EMA50 > EMA100 (institutional MAs), not short EMAs a pullback would flip.
  const uptrend = e50 !== null && e100 !== null ? e50 > e100 : price > (e50 ?? price);
  if (!uptrend) {
    return { long: false, reason: "tendance non haussière (MA50 ≤ MA100) — Fibonacci ne s'applique qu'avec la tendance" };
  }

  // 2) Last impulsive up-leg over a recent window.
  const lookback = Math.min(60, candles.length);
  const window = candles.slice(-lookback);
  let iHigh = 0;
  for (let i = 1; i < window.length; i++) if (window[i].high > window[iHigh].high) iHigh = i;
  const swingHigh = window[iHigh].high;
  let swingLow = window[0].low;
  for (let i = 0; i <= iHigh; i++) swingLow = Math.min(swingLow, window[i].low);
  const leg = swingHigh - swingLow;
  if (leg <= 0 || leg / swingLow < 0.02) {
    return { long: false, reason: "pas de jambe impulsive claire (< 2%)" };
  }

  // 3) Corrective pullback into the retracement zone.
  const r = (swingHigh - price) / leg; // 0 at the high, 1 back at the swing low
  if (r < FIB.entryMin || r > FIB.entryMax) {
    return { long: false, reason: `retracement ${(r * 100).toFixed(0)}% hors zone Fib 38,2–78,6%` };
  }

  // 4) Confluence with structure (moving averages, psychological level, key Fib).
  const confluences: string[] = [];
  if (e50 !== null && near(price, e50, 0.008)) confluences.push("MA50");
  if (e100 !== null && near(price, e100, 0.008)) confluences.push("MA100");
  if (e200 !== null && near(price, e200, 0.008)) confluences.push("MA200");
  const psy = psychLevel(price);
  if (near(price, psy, 0.004)) confluences.push(`niveau psycho ${psy}`);
  // The Fib entry level itself is structural confluence when it lands on 50/61.8/78.6.
  const onKeyLevel = [0.5, 0.618, 0.786].some((lvl) => Math.abs(r - lvl) <= 0.03);
  if (onKeyLevel) confluences.push(`niveau Fib clé ${(r * 100).toFixed(1)}%`);
  if (confluences.length === 0) {
    return { long: false, reason: `retracement ${(r * 100).toFixed(0)}% mais aucune confluence de structure` };
  }

  // 5) Convergence check (RSI/MACD not turning down) = green light.
  const rsiSeries = rsi(closes, 14);
  const rNow = lastValid(rsiSeries);
  const rPrev = rsiSeries.length >= 4 ? rsiSeries[rsiSeries.length - 4] : rNow;
  const hist = macd(closes).histogram;
  const hNow = lastValid(hist);
  const hPrev = hist.length >= 3 ? hist[hist.length - 3] : hNow;
  const momentumTurningUp =
    (rNow !== null && rNow >= 40 && rPrev !== null && rNow >= rPrev - 2) ||
    (hNow !== null && hPrev !== null && hNow >= hPrev);
  if (!momentumTurningUp) {
    return { long: false, reason: `divergence/momentum baissier au retracement ${(r * 100).toFixed(0)}% — feu rouge` };
  }

  // 6) Stop-loss: shallow entries -> 88.6%, deep entries -> 113%.
  const slFrac = r <= FIB.deep + 0.001 ? FIB.sl886 : FIB.sl113;
  const stop = swingHigh - slFrac * leg;
  // 7) Take-profit: 127.2% extension of the leg (from the swing low).
  const takeProfit = swingLow + FIB.ext * leg;

  if (!(stop < price && price < takeProfit)) {
    return { long: false, reason: "géométrie Fib invalide (SL/TP incohérents avec le prix)" };
  }

  const entryType = r < 0.5 ? "BHG 38,2%" : r <= FIB.deep + 0.001 ? "hybride 50%/BB 61,8%" : "Big Bounce 61,8–78,6%";
  return {
    long: true,
    reason: `Retracement Fib ${(r * 100).toFixed(0)}% (${entryType}) · confluence ${confluences.join(" + ")} · SL ${slFrac === FIB.sl886 ? "88,6%" : "113%"} · TP ext 127,2%`,
    stop,
    takeProfit,
    confluences,
  };
}

/** Uniform strategy interface for the autonomous selector. */
export function evaluate(candles: Candle[]): StrategyEval {
  const f = analyzeFib(candles);
  // Quality: base 55 + 12 per confluence (more structure agreement = stronger).
  const quality = f.long ? clampQuality(55 + 12 * (f.confluences?.length ?? 0)) : 0;
  return { name: "FIB_CONFLUENCE", long: f.long, quality, reason: f.reason, stop: f.stop, takeProfit: f.takeProfit };
}
