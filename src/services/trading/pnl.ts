import { round } from "@/lib/utils";
import type { Direction } from "@/services/risk/position-sizing";

/** Unrealized P&L of an open position at the current price. */
export function unrealizedPnl(
  side: Direction,
  entryPrice: number,
  quantity: number,
  currentPrice: number,
): { pnl: number; pnlPct: number } {
  const per = side === "LONG" ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnl = per * quantity;
  const cost = entryPrice * quantity;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { pnl: round(pnl, 2), pnlPct: round(pnlPct, 2) };
}

/** Realized P&L when closing a position, net of fees. */
export function realizedPnl(
  side: Direction,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  fees = 0,
): { pnl: number; pnlPct: number } {
  const per = side === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const gross = per * quantity;
  const pnl = gross - fees;
  const cost = entryPrice * quantity;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { pnl: round(pnl, 2), pnlPct: round(pnlPct, 2) };
}

/** Risk / reward ratio from entry, stop and take-profit. */
export function riskReward(
  entry: number,
  stop: number,
  takeProfit: number,
): number {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(takeProfit - entry);
  if (risk === 0) return 0;
  return round(reward / risk, 2);
}

/** Simulated fee for a given notional and basis-points rate. */
export function feeFor(notional: number, feeBps: number): number {
  return round((notional * feeBps) / 10_000, 2);
}
