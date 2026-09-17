import { ema, lastValid } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";
import { clampQuality, isClose, lastBullish, psychLevel, type StrategyEval } from "./types";

/**
 * Big Bounce (from the book): a strong rejection on a CONFLUENCE of structure
 * (support + moving average + psychological level). You enter the bounce in the
 * direction of the trend. Long-only.
 *   - Trend up (MA50 > MA100).
 *   - Price is sitting on an established support zone (recent swing low),
 *     with confluence from MA50/100/200 and/or a psychological round level.
 *   - The last bar dipped into the zone and closed back up (rejection).
 *   - Stop just below the support; take-profit at recent resistance (>= ~2R).
 */
export function evaluate(candles: Candle[]): StrategyEval {
  const out = (long: boolean, quality: number, reason: string, stop?: number, takeProfit?: number): StrategyEval => ({
    name: "BIG_BOUNCE", long, quality: long ? clampQuality(quality) : 0, reason, stop, takeProfit,
  });
  if (candles.length < 60) return out(false, 0, "données insuffisantes");

  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const e50 = lastValid(ema(closes, 50));
  const e100 = lastValid(ema(closes, 100));
  const e200 = lastValid(ema(closes, 200));

  const uptrend = e50 !== null && e100 !== null ? e50 > e100 : price > (e50 ?? price);
  if (!uptrend) return out(false, 0, "tendance non haussière (MA50 ≤ MA100)");

  // Support = the RECENT pullback low (local swing low price just came back to),
  // not the global minimum of a rising window.
  const pull = candles.slice(-12, -1);
  if (pull.length < 6) return out(false, 0, "historique insuffisant");
  const support = Math.min(...pull.map((c) => c.low));
  const resistance = Math.max(...candles.slice(-40).map((c) => c.high));

  // Price must be sitting on the support zone and have just rejected it.
  const nearSupport = isClose(price, support, 0.015) && price >= support;
  const dipped = Math.min(candles[candles.length - 1].low, candles[candles.length - 2].low) <= support * 1.01;
  if (!nearSupport || !dipped || !lastBullish(candles)) {
    return out(false, 0, "pas de rejet net sur le support");
  }

  // Confluence count (support always counts as one structural element).
  const confluences: string[] = ["support"];
  if (e50 !== null && isClose(price, e50, 0.01)) confluences.push("MA50");
  if (e100 !== null && isClose(price, e100, 0.01)) confluences.push("MA100");
  if (e200 !== null && isClose(price, e200, 0.01)) confluences.push("MA200");
  const psy = psychLevel(price);
  if (isClose(price, psy, 0.008)) confluences.push(`niveau psycho ${psy}`);
  if (confluences.length < 2) return out(false, 0, "confluence insuffisante pour un Big Bounce");

  const stop = support * 0.985; // just below the level
  const takeProfit = resistance; // aim for the range high
  if (!(stop < price && price < takeProfit)) return out(false, 0, "géométrie invalide (SL/TP)");
  // Require at least ~1.5R of room.
  const rr = (takeProfit - price) / (price - stop);
  if (rr < 1.5) return out(false, 0, `objectif trop proche (R/R ${rr.toFixed(1)})`);

  return out(
    true,
    52 + 12 * confluences.length + Math.min(15, rr * 4),
    `Big Bounce : rejet sur confluence ${confluences.join(" + ")} · R/R ${rr.toFixed(1)} · SL sous support · TP résistance`,
    stop,
    takeProfit,
  );
}
