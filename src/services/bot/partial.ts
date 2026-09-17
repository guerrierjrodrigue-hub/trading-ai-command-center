import { round } from "@/lib/utils";
import type { Side } from "./strategies/types";

/**
 * Partial take-profit (from the book: "prendre des profits partiels" at the
 * extension levels). When a winner reaches an intermediate target (halfway to
 * its final take-profit), the bot closes part of the position and moves the stop
 * to BREAKEVEN — locking in a gain and making the remainder risk-free, then
 * letting it run to the full target (with the trailing stop).
 *
 * Works for BOTH directions. For a LONG the profit target sits ABOVE entry; for
 * a SHORT it sits BELOW entry — the logic is mirrored accordingly.
 */

/** Where the first (partial) target sits, as a fraction of the way to the full TP. */
export const PARTIAL_AT_FRACTION = 0.5;
/** How much of the position to close at the partial target. */
export const PARTIAL_SELL_FRACTION = 0.5;

export interface PartialDecision {
  take: boolean; // should we take a partial right now?
  sellQty: number; // quantity to close (0 when take is false)
  tp1: number; // the intermediate target price
  breakeven: number; // where to move the stop (locks the position at no worse than entry)
}

/**
 * Pure decision. Returns null when partials don't apply (no valid TP in the
 * trade's profit direction). `take` is true only when: no partial has been
 * taken yet, price has reached tp1 (in the profit direction), and price has not
 * yet reached the full take-profit (a full TP hit is handled by the close path).
 */
export function partialDecision(p: {
  entry: number;
  takeProfit: number | null;
  stop: number | null;
  price: number;
  quantity: number;
  partialTaken: boolean;
  side?: Side;
}): PartialDecision | null {
  const side = p.side ?? "LONG";
  if (p.takeProfit == null) return null;
  // TP must be in the profit direction (above entry for LONG, below for SHORT).
  if (side === "LONG" ? p.takeProfit <= p.entry : p.takeProfit >= p.entry) return null;

  const tp1 = round(p.entry + PARTIAL_AT_FRACTION * (p.takeProfit - p.entry), 6);
  const breakeven = round(
    side === "LONG" ? Math.max(p.entry, p.stop ?? -Infinity) : Math.min(p.entry, p.stop ?? Infinity),
    6,
  );
  const base = { take: false, sellQty: 0, tp1, breakeven };
  if (p.partialTaken) return base;

  const reachedTp1 = side === "LONG" ? p.price >= tp1 : p.price <= tp1;
  if (!reachedTp1) return base;
  const reachedFull = side === "LONG" ? p.price >= p.takeProfit : p.price <= p.takeProfit;
  if (reachedFull) return base; // full target — close entirely elsewhere

  const sellQty = round(p.quantity * PARTIAL_SELL_FRACTION, 6);
  if (sellQty <= 0) return base;
  return { take: true, sellQty, tp1, breakeven };
}
