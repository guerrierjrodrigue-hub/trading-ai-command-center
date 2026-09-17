import { lastValid, rsi } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";
import { clampQuality, lastBullish, type StrategyEval } from "./types";

/**
 * Bullish (regular) divergence, from the book's "Convergence vs Divergence":
 * price makes a LOWER low while RSI makes a HIGHER low — the selling pressure is
 * fading, a reversal/correction up is likely. We take it only with confirmation
 * (price recovering off the low, RSI turning up). Long-only.
 *   - Stop below the divergence low; take-profit at recent resistance / ~2R.
 */
export function evaluate(candles: Candle[]): StrategyEval {
  const out = (long: boolean, quality: number, reason: string, stop?: number, takeProfit?: number): StrategyEval => ({
    name: "DIVERGENCE", long, quality: long ? clampQuality(quality) : 0, reason, stop, takeProfit,
  });
  if (candles.length < 60) return out(false, 0, "données insuffisantes");

  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const r = rsi(closes, 14);

  const n = candles.length;
  const winStart = n - 40;
  const mid = n - 20;

  // Lowest low in the older half and the newer half of the window.
  const argMinLow = (a: number, b: number): number => {
    let idx = a;
    for (let i = a; i < b; i++) if (candles[i].low < candles[idx].low) idx = i;
    return idx;
  };
  const i1 = argMinLow(winStart, mid);
  const i2 = argMinLow(mid, n);

  const priceLow1 = candles[i1].low;
  const priceLow2 = candles[i2].low;
  const r1 = r[i1];
  const r2 = r[i2];
  if (!Number.isFinite(r1) || !Number.isFinite(r2)) return out(false, 0, "RSI indisponible");

  // Regular bullish divergence: price lower low, RSI higher low.
  const priceLowerLow = priceLow2 < priceLow1;
  const rsiHigherLow = r2 > r1 + 1;
  if (!priceLowerLow || !rsiHigherLow) return out(false, 0, "pas de divergence haussière");

  // Confirmation: recovering off the low + momentum turning up.
  const rNow = lastValid(r);
  const rising = rNow !== null && rNow > r2;
  const recovered = price > candles[i2].close;
  if (!rising || !recovered || !lastBullish(candles)) {
    return out(false, 0, "divergence détectée mais pas encore confirmée");
  }

  const stop = priceLow2 * 0.985; // below the divergence low
  if (!(stop < price)) return out(false, 0, "géométrie invalide (SL)");
  const resistance = Math.max(...candles.slice(-40).map((c) => c.high));
  const takeProfit = Math.max(resistance, price + 2 * (price - stop));

  const quality = 50 + Math.min(25, (r2 - r1) * 1.5) + (rNow! < 45 ? 8 : 0);
  return out(
    true,
    quality,
    `Divergence haussière : plus bas prix mais RSI en hausse (${r1.toFixed(0)}→${r2.toFixed(0)}) · confirmée · SL sous le creux · TP résistance/2R`,
    stop,
    takeProfit,
  );
}
