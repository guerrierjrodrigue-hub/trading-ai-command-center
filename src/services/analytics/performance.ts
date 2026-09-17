import { prisma } from "@/lib/prisma";
import { round } from "@/lib/utils";
import { getMarketDataProvider } from "@/services/market";
import { loadPortfolioState } from "@/services/trading/state";
import type { EquityPoint } from "@/services/trading/portfolio";

/** A single closed trade, reduced to what the stats need. */
export interface TradeLite {
  pnl: number;
  pnlPct: number;
  openedAt: Date;
  closedAt: Date;
}

export interface StatsBlock {
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // %
  totalPnl: number; // $
  expectancy: number; // $ expected value per trade (= average P&L)
  avgPnlPct: number; // % average return per trade
  avgWin: number; // $ average winning trade
  avgLoss: number; // $ average losing trade (<= 0)
  profitFactor: number; // gross profit / gross loss (0 if no losses & no wins; Infinity clamped to 999)
  largestWin: number;
  largestLoss: number;
  avgHoldHours: number;
}

export interface SymbolBreakdown extends StatsBlock {
  symbol: string;
}

export interface DrawdownPoint {
  time: string;
  equity: number;
  drawdownPct: number; // 0 at a fresh high, positive below the running peak
}

export interface BenchmarkComparison {
  symbol: string;
  periodStart: string; // ISO date of the first trade
  strategyReturnPct: number; // realized return over starting capital across the period
  buyHoldReturnPct: number; // benchmark price change over the same window
  edgePct: number; // strategy - buy&hold
}

export interface PerformanceAnalytics {
  overall: StatsBlock;
  bySource: { BOT: StatsBlock; USER: StatsBlock };
  bySymbol: SymbolBreakdown[];
  drawdownSeries: DrawdownPoint[];
  maxDrawdownPct: number;
  benchmark: BenchmarkComparison | null;
  startingCapital: number;
}

const EMPTY: StatsBlock = {
  trades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, expectancy: 0,
  avgPnlPct: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, largestWin: 0,
  largestLoss: 0, avgHoldHours: 0,
};

/** Pure: turns a set of closed trades into a stats block. */
export function computeStats(trades: TradeLite[]): StatsBlock {
  if (!trades.length) return { ...EMPTY };

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const holdHours = trades.reduce(
    (s, t) => s + Math.max(0, (t.closedAt.getTime() - t.openedAt.getTime()) / 3_600_000),
    0,
  );

  const profitFactor = grossLoss > 0 ? Math.min(999, grossProfit / grossLoss) : grossProfit > 0 ? 999 : 0;

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round((wins.length / trades.length) * 100, 1),
    totalPnl: round(totalPnl, 2),
    expectancy: round(totalPnl / trades.length, 2),
    avgPnlPct: round(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length, 2),
    avgWin: wins.length ? round(grossProfit / wins.length, 2) : 0,
    avgLoss: losses.length ? round(-grossLoss / losses.length, 2) : 0,
    profitFactor: round(profitFactor, 2),
    largestWin: round(Math.max(0, ...trades.map((t) => t.pnl)), 2),
    largestLoss: round(Math.min(0, ...trades.map((t) => t.pnl)), 2),
    avgHoldHours: round(holdHours / trades.length, 1),
  };
}

/** Pure: builds a drawdown series (peak-to-point) from an equity curve. */
export function computeDrawdownSeries(curve: EquityPoint[]): { series: DrawdownPoint[]; maxDrawdownPct: number } {
  let peak = -Infinity;
  let maxDd = 0;
  const series = curve.map((pt) => {
    peak = Math.max(peak, pt.equity);
    const dd = peak > 0 ? Math.max(0, ((peak - pt.equity) / peak) * 100) : 0;
    maxDd = Math.max(maxDd, dd);
    return { time: pt.time, equity: pt.equity, drawdownPct: round(dd, 2) };
  });
  return { series, maxDrawdownPct: round(maxDd, 2) };
}

/** Buy & hold return of a benchmark over [start, now], from daily candles. */
async function benchmarkReturn(symbol: string, start: Date): Promise<number | null> {
  const provider = getMarketDataProvider();
  const candles = await provider.getCandles(symbol, "1D", 400).catch(() => []);
  if (candles.length < 2) return null;
  const startSec = start.getTime() / 1000;
  // First candle at/after the period start, else the earliest we have.
  // Candle.time is unix SECONDS (lightweight-charts convention).
  const first = candles.find((c) => c.time >= startSec) ?? candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last || first.close <= 0) return null;
  return ((last.close - first.close) / first.close) * 100;
}

/** Assembles the full performance analytics for a user (PAPER portfolio). */
export async function computePerformanceAnalytics(
  userId: string,
  benchmarkSymbol = "BTC",
): Promise<PerformanceAnalytics> {
  const state = await loadPortfolioState(userId);

  const rows = await prisma.trade.findMany({
    where: { portfolioId: state.portfolioId },
    include: { asset: true, position: true },
    orderBy: { openedAt: "asc" },
  });

  const all: TradeLite[] = rows.map((t) => ({ pnl: t.pnl, pnlPct: t.pnlPct, openedAt: t.openedAt, closedAt: t.closedAt }));
  const bot = rows.filter((t) => t.position?.openedBy === "BOT").map((t) => ({ pnl: t.pnl, pnlPct: t.pnlPct, openedAt: t.openedAt, closedAt: t.closedAt }));
  const user = rows.filter((t) => t.position?.openedBy !== "BOT").map((t) => ({ pnl: t.pnl, pnlPct: t.pnlPct, openedAt: t.openedAt, closedAt: t.closedAt }));

  // Per-symbol.
  const bySymbolMap = new Map<string, TradeLite[]>();
  for (const t of rows) {
    const arr = bySymbolMap.get(t.asset.symbol) ?? [];
    arr.push({ pnl: t.pnl, pnlPct: t.pnlPct, openedAt: t.openedAt, closedAt: t.closedAt });
    bySymbolMap.set(t.asset.symbol, arr);
  }
  const bySymbol: SymbolBreakdown[] = [...bySymbolMap.entries()]
    .map(([symbol, ts]) => ({ symbol, ...computeStats(ts) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);

  const { series: drawdownSeries, maxDrawdownPct } = computeDrawdownSeries(state.metrics.equityCurve);

  // Benchmark: robot+user realized return vs buy&hold since the first trade.
  let benchmark: BenchmarkComparison | null = null;
  if (rows.length) {
    const start = rows[0].openedAt;
    const bh = await benchmarkReturn(benchmarkSymbol, start);
    if (bh !== null) {
      const realized = all.reduce((s, t) => s + t.pnl, 0);
      const strategyReturnPct = state.metrics.startingCapital > 0 ? (realized / state.metrics.startingCapital) * 100 : 0;
      benchmark = {
        symbol: benchmarkSymbol,
        periodStart: start.toISOString().slice(0, 10),
        strategyReturnPct: round(strategyReturnPct, 2),
        buyHoldReturnPct: round(bh, 2),
        edgePct: round(strategyReturnPct - bh, 2),
      };
    }
  }

  return {
    overall: computeStats(all),
    bySource: { BOT: computeStats(bot), USER: computeStats(user) },
    bySymbol,
    drawdownSeries,
    maxDrawdownPct,
    benchmark,
    startingCapital: state.metrics.startingCapital,
  };
}
