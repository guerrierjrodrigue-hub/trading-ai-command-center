import { ema, lastValid } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";
import { clampQuality, lastBullish, type StrategyEval } from "./types";

/**
 * Break-Hook-Go (from the book):
 *   Break — price breaks above a structure level (prior resistance).
 *   Hook  — price comes back down and retests the broken level.
 *   Go    — the market confirms the level now holds as support (bounce up).
 * You enter after the "Go". Long-only, with the trend.
 *   - Stop just below the broken level (now support).
 *   - Take-profit at ~2R (measured continuation).
 */
export function evaluate(candles: Candle[]): StrategyEval {
  const out = (long: boolean, quality: number, reason: string, stop?: number, takeProfit?: number): StrategyEval => ({
    name: "BREAK_HOOK_GO", long, quality: long ? clampQuality(quality) : 0, reason, stop, takeProfit,
  });
  if (candles.length < 60) return out(false, 0, "données insuffisantes");

  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const e50 = lastValid(ema(closes, 50));
  const e100 = lastValid(ema(closes, 100));
  const uptrend = e50 !== null && e100 !== null ? e50 > e100 : price > (e50 ?? price);
  if (!uptrend) return out(false, 0, "tendance non haussière (MA50 ≤ MA100)");

  // Prior resistance = the high of an OLDER window (before the recent action).
  const older = candles.slice(-40, -8);
  if (older.length < 8) return out(false, 0, "historique insuffisant");
  const priorRes = Math.max(...older.map((c) => c.high));

  const recent = candles.slice(-8);
  const brokeAbove = Math.max(...recent.map((c) => c.close)) > priorRes; // Break
  const retested = Math.min(...candles.slice(-4).map((c) => c.low)) <= priorRes * 1.01; // Hook
  const holdsAbove = price > priorRes && lastBullish(candles); // Go
  if (!brokeAbove) return out(false, 0, "pas de cassure du niveau");
  if (!retested) return out(false, 0, "cassure sans retest (pas de hook)");
  if (!holdsAbove) return out(false, 0, "le niveau ne tient pas encore (pas de go)");

  const stop = priorRes * 0.985; // below the broken level, now support
  if (!(stop < price)) return out(false, 0, "géométrie invalide (SL)");
  const takeProfit = price + 2 * (price - stop); // ~2R continuation target

  // Quality: reward a clean hold above the level and a bullish close.
  const distPct = ((price - priorRes) / priorRes) * 100;
  const quality = 55 + Math.min(20, distPct * 12) + 10;
  return out(
    true,
    quality,
    `Break-Hook-Go : cassure + retest du niveau ${priorRes.toFixed(2)} qui tient comme support · SL sous le niveau · TP ~2R`,
    stop,
    takeProfit,
  );
}
