import { round } from "@/lib/utils";
import type { Side } from "./strategies/types";

/**
 * Trailing stop. Pure and deterministic. Works for BOTH directions.
 *
 * Philosophy (protect profits, let winners run):
 *  - Only ever move the stop in the SAFE direction (up for a LONG, down for a
 *    SHORT) — never give back locked-in room.
 *  - Activate only once the trade is meaningfully in profit: at least
 *    `activationFrac` of the way to its take-profit (or, if no TP is known, at
 *    least `trailPct` of profit). This stops the trail from cutting a trade the
 *    moment it ticks green.
 *  - Once active, the stop trails `trailPct` away from price and is floored at
 *    breakeven (entry), so an activated winner can no longer become a loser.
 *
 * Returns the new stop when it should move, or null to leave it as-is.
 */
export function computeTrailingStop(p: {
  entry: number;
  takeProfit: number | null;
  currentStop: number | null;
  price: number;
  trailPct: number; // fraction, e.g. 0.06 = trail 6% away from price
  activationFrac?: number; // fraction of the way to TP before trailing starts
  side?: Side;
}): number | null {
  const { entry, takeProfit, currentStop, price, trailPct } = p;
  const side = p.side ?? "LONG";
  const activationFrac = p.activationFrac ?? 0.5;
  if (trailPct <= 0) return null;

  if (side === "LONG") {
    if (!(price > entry)) return null; // only when in profit
    if (takeProfit && takeProfit > entry) {
      if ((price - entry) / (takeProfit - entry) < activationFrac) return null;
    } else if ((price - entry) / entry < trailPct) {
      return null;
    }
    const candidate = Math.max(price * (1 - trailPct), entry); // trail below, floor at breakeven
    const cur = currentStop ?? -Infinity;
    if (candidate <= cur) return null; // only ever raise
    if (candidate >= price) return null; // must stay below current price
    return round(candidate, 6);
  }

  // SHORT: profit grows as price FALLS; the stop sits ABOVE and ratchets DOWN.
  if (!(price < entry)) return null; // only when in profit
  if (takeProfit && takeProfit < entry) {
    if ((entry - price) / (entry - takeProfit) < activationFrac) return null;
  } else if ((entry - price) / entry < trailPct) {
    return null;
  }
  const candidate = Math.min(price * (1 + trailPct), entry); // trail above, floor at breakeven
  const cur = currentStop ?? Infinity;
  if (candidate >= cur) return null; // only ever lower
  if (candidate <= price) return null; // must stay above current price
  return round(candidate, 6);
}
