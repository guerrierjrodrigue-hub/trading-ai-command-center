import { round } from "@/lib/utils";
import { feeFor, realizedPnl } from "./pnl";
import type { Direction } from "@/services/risk/position-sizing";

/**
 * Pure paper-trading helpers. They compute the *effect* of an action so the
 * API layer can persist it. No DB, no side-effects here — fully testable.
 *
 * Cash accounting model (unified for LONG and SHORT):
 *   - Opening: cash -= (notional + fee). The position then carries a value of
 *     (costBasis + unrealizedPnl) so total equity = cash + Σ position values.
 *   - Closing: cash += (costBasis + realizedPnl_net). realizedPnl already nets
 *     the exit fee.
 */

export interface OpenPlan {
  direction: Direction;
  quantity: number;
  entryPrice: number;
  notional: number;
  fee: number;
  cashAfter: number;
}

export function planOpen(params: {
  cash: number;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  feeBps: number;
}): OpenPlan {
  const { cash, side, quantity, price, feeBps } = params;
  const notional = quantity * price;
  const fee = feeFor(notional, feeBps);
  const direction: Direction = side === "BUY" ? "LONG" : "SHORT";
  return {
    direction,
    quantity: round(quantity, 6),
    entryPrice: round(price, 6),
    notional: round(notional, 2),
    fee,
    cashAfter: round(cash - notional - fee, 2),
  };
}

export interface ClosePlan {
  exitPrice: number;
  fee: number;
  pnl: number; // net of exit fee
  pnlPct: number;
  cashAfter: number;
}

export function planClose(params: {
  cash: number;
  side: Direction;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  feeBps: number;
}): ClosePlan {
  const { cash, side, quantity, entryPrice, exitPrice, feeBps } = params;
  const exitNotional = quantity * exitPrice;
  const fee = feeFor(exitNotional, feeBps);
  const { pnl, pnlPct } = realizedPnl(side, entryPrice, exitPrice, quantity, fee);
  const costBasis = entryPrice * quantity;
  return {
    exitPrice: round(exitPrice, 6),
    fee,
    pnl,
    pnlPct,
    cashAfter: round(cash + costBasis + pnl, 2),
  };
}
