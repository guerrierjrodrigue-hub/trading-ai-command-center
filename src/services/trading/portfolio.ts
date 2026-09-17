import { round } from "@/lib/utils";
import { unrealizedPnl } from "./pnl";
import type { Direction } from "@/services/risk/position-sizing";

export interface OpenPositionInput {
  symbol: string;
  side: Direction;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
}

export interface ClosedTradeInput {
  pnl: number;
  closedAt: Date;
}

export interface AllocationSlice {
  label: string;
  value: number;
  pct: number;
}

export interface EquityPoint {
  time: string; // ISO date
  equity: number;
}

export interface PortfolioMetrics {
  startingCapital: number;
  cash: number;
  investedCost: number; // cost basis of open positions
  marketValue: number; // current value of open positions to the portfolio
  equity: number; // total portfolio value
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalReturnPct: number;
  pnlToday: number; // realized today
  maxDrawdownPct: number; // worst peak-to-trough over the whole curve
  currentDrawdownPct: number; // drawdown right now from the all-time peak equity
  openPositions: number;
  exposurePct: number;
  allocation: AllocationSlice[];
  equityCurve: EquityPoint[];
  winRate: number;
  trades: number;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function computePortfolioMetrics(params: {
  startingCapital: number;
  cash: number;
  positions: OpenPositionInput[];
  trades: ClosedTradeInput[];
}): PortfolioMetrics {
  const { startingCapital, cash, positions, trades } = params;

  let investedCost = 0;
  let marketValue = 0;
  let unrealized = 0;
  const allocation: AllocationSlice[] = [];

  for (const p of positions) {
    const cost = p.entryPrice * p.quantity;
    const { pnl } = unrealizedPnl(p.side, p.entryPrice, p.quantity, p.currentPrice);
    const value = cost + pnl; // value of the position to the portfolio
    investedCost += cost;
    marketValue += value;
    unrealized += pnl;
  }

  const equity = cash + marketValue;
  const realized = trades.reduce((s, t) => s + t.pnl, 0);
  const totalPnl = equity - startingCapital;
  const totalReturnPct = startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0;

  const now = new Date();
  const pnlToday = trades
    .filter((t) => isSameDay(new Date(t.closedAt), now))
    .reduce((s, t) => s + t.pnl, 0);

  // Allocation slices (open positions + cash).
  for (const p of positions) {
    const { pnl } = unrealizedPnl(p.side, p.entryPrice, p.quantity, p.currentPrice);
    const value = p.entryPrice * p.quantity + pnl;
    allocation.push({
      label: p.symbol,
      value: round(value, 2),
      pct: equity > 0 ? round((value / equity) * 100, 1) : 0,
    });
  }
  allocation.push({
    label: "Cash",
    value: round(cash, 2),
    pct: equity > 0 ? round((cash / equity) * 100, 1) : 0,
  });

  // Equity curve from cumulative realized P&L, ending at current equity.
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
  );
  const equityCurve: EquityPoint[] = [
    { time: "start", equity: round(startingCapital, 2) },
  ];
  let running = startingCapital;
  for (const t of sorted) {
    running += t.pnl;
    equityCurve.push({
      time: new Date(t.closedAt).toISOString().slice(0, 10),
      equity: round(running, 2),
    });
  }
  equityCurve.push({ time: "now", equity: round(equity, 2) });

  // Max drawdown from the equity curve, plus the drawdown we're in right now
  // (peak-to-current), which the bot's circuit-breaker reads.
  let peak = -Infinity;
  let maxDd = 0;
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.equity);
    if (peak > 0) {
      const dd = ((peak - pt.equity) / peak) * 100;
      maxDd = Math.max(maxDd, dd);
    }
  }
  const allTimePeak = equityCurve.reduce((m, pt) => Math.max(m, pt.equity), -Infinity);
  const currentDrawdownPct =
    allTimePeak > 0 ? Math.max(0, ((allTimePeak - equity) / allTimePeak) * 100) : 0;

  const wins = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return {
    startingCapital: round(startingCapital, 2),
    cash: round(cash, 2),
    investedCost: round(investedCost, 2),
    marketValue: round(marketValue, 2),
    equity: round(equity, 2),
    unrealizedPnl: round(unrealized, 2),
    realizedPnl: round(realized, 2),
    totalPnl: round(totalPnl, 2),
    totalReturnPct: round(totalReturnPct, 2),
    pnlToday: round(pnlToday, 2),
    maxDrawdownPct: round(maxDd, 2),
    currentDrawdownPct: round(currentDrawdownPct, 2),
    openPositions: positions.length,
    exposurePct: equity > 0 ? round((marketValue / equity) * 100, 1) : 0,
    allocation,
    equityCurve,
    winRate: round(winRate, 1),
    trades: trades.length,
  };
}
