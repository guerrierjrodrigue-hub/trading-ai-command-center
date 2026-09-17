import { round } from "@/lib/utils";
import { ema, macd, rsi, sma } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";
import { evaluate as fibEval } from "@/services/bot/strategies/fibonacci";
import { evaluate as bigBounceEval } from "@/services/bot/strategies/bigBounce";
import { evaluate as breakHookGoEval } from "@/services/bot/strategies/breakHookGo";
import { evaluate as divergenceEval } from "@/services/bot/strategies/divergence";
import type { StrategyEval } from "@/services/bot/strategies/types";

/**
 * Long/flat, single-position backtester. Fully deterministic and pure — given
 * the same candles + params it always produces the same result. Not a promise
 * of future performance; a study of how a rule would have behaved historically.
 */

export type StrategyType =
  | "EMA_CROSS"
  | "RSI"
  | "MACD"
  | "BREAKOUT"
  | "TREND_FOLLOWING"
  | "FIB_CONFLUENCE"
  | "BIG_BOUNCE"
  | "BREAK_HOOK_GO"
  | "DIVERGENCE";

/** The four "book" strategies are event-based (enter on a setup, exit at their own SL/TP). */
const BOOK_EVALUATORS: Partial<Record<StrategyType, (candles: Candle[]) => StrategyEval>> = {
  FIB_CONFLUENCE: fibEval,
  BIG_BOUNCE: bigBounceEval,
  BREAK_HOOK_GO: breakHookGoEval,
  DIVERGENCE: divergenceEval,
};

export interface BacktestParams {
  strategy: StrategyType;
  startingCapital: number;
  feeBps: number;
  // Strategy knobs (optional; sensible defaults per strategy).
  fast?: number;
  slow?: number;
  rsiPeriod?: number;
  oversold?: number;
  overbought?: number;
  lookback?: number;
  smaPeriod?: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  bars: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number; // grossProfit / grossLoss
  totalReturnPct: number;
  finalEquity: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdownPct: number;
  avgHoldingBars: number;
  buyHoldReturnPct: number; // benchmark: hold the asset the whole period
  // Pro metrics.
  expectancy: number; // average P&L per trade ($)
  worstLossStreak: number; // longest run of consecutive losing trades
  sharpe: number; // annualized, from per-bar equity returns
  sortino: number; // annualized, downside deviation only
  cagr: number; // compound annual growth rate (%)
}

export interface BacktestResult {
  strategy: StrategyType;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: { time: number; equity: number }[];
}

/**
 * Produces a boolean "want to be long" signal per bar for the chosen strategy.
 * NaN warmup bars => stay flat (false).
 */
function computeSignals(candles: Candle[], p: BacktestParams): boolean[] {
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const long = new Array<boolean>(n).fill(false);

  switch (p.strategy) {
    case "EMA_CROSS": {
      const fast = ema(closes, p.fast ?? 12);
      const slow = ema(closes, p.slow ?? 26);
      for (let i = 0; i < n; i++) {
        if (!Number.isNaN(fast[i]) && !Number.isNaN(slow[i])) long[i] = fast[i] > slow[i];
      }
      break;
    }
    case "MACD": {
      const { histogram } = macd(closes, p.fast ?? 12, p.slow ?? 26, 9);
      for (let i = 0; i < n; i++) {
        if (!Number.isNaN(histogram[i])) long[i] = histogram[i] > 0;
      }
      break;
    }
    case "RSI": {
      const r = rsi(closes, p.rsiPeriod ?? 14);
      const os = p.oversold ?? 30;
      const ob = p.overbought ?? 70;
      let inPos = false;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(r[i])) {
          long[i] = false;
          continue;
        }
        // Mean reversion: enter long when oversold, exit when overbought.
        if (!inPos && r[i] < os) inPos = true;
        else if (inPos && r[i] > ob) inPos = false;
        long[i] = inPos;
      }
      break;
    }
    case "BREAKOUT": {
      const lb = p.lookback ?? 20;
      for (let i = 0; i < n; i++) {
        if (i < lb) continue;
        const window = candles.slice(i - lb, i);
        const hi = Math.max(...window.map((c) => c.high));
        const lo = Math.min(...window.map((c) => c.low));
        // Donchian channel: long above prior-N high, flat below prior-N low.
        if (closes[i] > hi) long[i] = true;
        else if (closes[i] < lo) long[i] = false;
        else long[i] = i > 0 ? long[i - 1] : false; // hold state in the channel
      }
      break;
    }
    case "TREND_FOLLOWING": {
      const period = p.smaPeriod ?? 200;
      const s = sma(closes, Math.min(period, Math.max(2, n - 1)));
      for (let i = 0; i < n; i++) {
        if (!Number.isNaN(s[i])) long[i] = closes[i] > s[i];
      }
      break;
    }
  }
  return long;
}

export function runBacktest(candles: Candle[], p: BacktestParams): BacktestResult {
  // Book strategies are event-based (enter on a setup, exit at their own SL/TP).
  if (BOOK_EVALUATORS[p.strategy]) return runBookBacktest(candles, p);
  const feeRate = p.feeBps / 10_000;
  const signals = computeSignals(candles, p);

  let cash = p.startingCapital;
  let qty = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let entryBar = 0;
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];

  const equityAt = (price: number) => cash + qty * price;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const wantLong = signals[i];
    const inPos = qty > 0;

    // Enter
    if (wantLong && !inPos) {
      const investable = cash;
      const q = investable / (c.close * (1 + feeRate));
      const fee = q * c.close * feeRate;
      cash -= q * c.close + fee;
      qty = q;
      entryPrice = c.close;
      entryTime = c.time;
      entryBar = i;
    }
    // Exit
    else if (!wantLong && inPos) {
      const gross = qty * c.close;
      const fee = gross * feeRate;
      cash += gross - fee;
      const cost = qty * entryPrice;
      const pnl = gross - fee - cost;
      trades.push({
        entryTime,
        exitTime: c.time,
        entryPrice: round(entryPrice, 6),
        exitPrice: round(c.close, 6),
        quantity: round(qty, 6),
        pnl: round(pnl, 2),
        pnlPct: round((pnl / cost) * 100, 2),
        bars: i - entryBar,
      });
      qty = 0;
    }

    equityCurve.push({ time: c.time, equity: round(equityAt(c.close), 2) });
  }

  // Close any open position at the last close.
  if (qty > 0) {
    const last = candles[candles.length - 1];
    const gross = qty * last.close;
    const fee = gross * feeRate;
    cash += gross - fee;
    const cost = qty * entryPrice;
    const pnl = gross - fee - cost;
    trades.push({
      entryTime,
      exitTime: last.time,
      entryPrice: round(entryPrice, 6),
      exitPrice: round(last.close, 6),
      quantity: round(qty, 6),
      pnl: round(pnl, 2),
      pnlPct: round((pnl / cost) * 100, 2),
      bars: candles.length - 1 - entryBar,
    });
    qty = 0;
  }

  const metrics = computeMetrics(trades, equityCurve, p.startingCapital, cash, candles);
  return { strategy: p.strategy, metrics, trades, equityCurve };
}

/**
 * Event-based backtest for the book strategies: at each bar, if flat, ask the
 * strategy if a LONG setup fires (with its own stop/take-profit). Once in a
 * trade, exit when the bar's low hits the stop or its high hits the target
 * (stop checked first — conservative), else hold. Any open trade is closed at
 * the final bar. Short setups are the mirror of long ones by construction, so
 * validating the long side validates the pattern.
 */
function runBookBacktest(candles: Candle[], p: BacktestParams): BacktestResult {
  const evaluator = BOOK_EVALUATORS[p.strategy]!;
  const feeRate = p.feeBps / 10_000;

  let cash = p.startingCapital;
  let qty = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let entryBar = 0;
  let stop = 0;
  let target = 0;
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];

  const closeTrade = (exitPrice: number, exitTime: number, bar: number) => {
    const gross = qty * exitPrice;
    const fee = gross * feeRate;
    cash += gross - fee;
    const cost = qty * entryPrice;
    const pnl = gross - fee - cost;
    trades.push({
      entryTime,
      exitTime,
      entryPrice: round(entryPrice, 6),
      exitPrice: round(exitPrice, 6),
      quantity: round(qty, 6),
      pnl: round(pnl, 2),
      pnlPct: round((pnl / cost) * 100, 2),
      bars: bar - entryBar,
    });
    qty = 0;
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (qty > 0) {
      // Exit checks first (stop before target — conservative).
      if (c.low <= stop) closeTrade(stop, c.time, i);
      else if (c.high >= target) closeTrade(target, c.time, i);
    } else if (i >= 60) {
      const e = evaluator(candles.slice(0, i + 1));
      if (e.long && e.stop != null && e.takeProfit != null && e.stop < c.close && c.close < e.takeProfit) {
        const q = cash / (c.close * (1 + feeRate));
        const fee = q * c.close * feeRate;
        cash -= q * c.close + fee;
        qty = q;
        entryPrice = c.close;
        entryTime = c.time;
        entryBar = i;
        stop = e.stop;
        target = e.takeProfit;
      }
    }
    equityCurve.push({ time: c.time, equity: round(cash + qty * c.close, 2) });
  }
  if (qty > 0) closeTrade(candles[candles.length - 1].close, candles[candles.length - 1].time, candles.length - 1);

  const metrics = computeMetrics(trades, equityCurve, p.startingCapital, cash, candles);
  return { strategy: p.strategy, metrics, trades, equityCurve };
}

const YEAR_SECONDS = 31_557_600;

/** Shared metrics (basic + pro) from the trade list and equity curve. */
function computeMetrics(
  trades: BacktestTrade[],
  equityCurve: { time: number; equity: number }[],
  startingCapital: number,
  finalEquity: number,
  candles: Candle[],
): BacktestMetrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // Max drawdown on the equity curve.
  let peak = -Infinity;
  let maxDd = 0;
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.equity);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - pt.equity) / peak) * 100);
  }

  const first = candles[0]?.close ?? 0;
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const buyHold = first > 0 ? ((lastClose - first) / first) * 100 : 0;

  // Worst losing streak (consecutive losing trades).
  let worstLossStreak = 0;
  let streak = 0;
  for (const t of trades) {
    if (t.pnl <= 0) {
      streak++;
      worstLossStreak = Math.max(worstLossStreak, streak);
    } else streak = 0;
  }

  // Per-bar equity returns -> Sharpe / Sortino (annualized).
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) rets.push(equityCurve[i].equity / prev - 1);
  }
  const barSeconds = medianBarSeconds(candles);
  const periodsPerYear = barSeconds > 0 ? YEAR_SECONDS / barSeconds : 365;
  const mean = rets.length ? rets.reduce((s, r) => s + r, 0) / rets.length : 0;
  const variance = rets.length ? rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length : 0;
  const std = Math.sqrt(variance);
  const downside = rets.filter((r) => r < 0);
  const downsideDev = downside.length ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) : 0;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : 0;
  const sortino = downsideDev > 0 ? (mean / downsideDev) * Math.sqrt(periodsPerYear) : 0;

  // CAGR from first to last bar.
  const spanSeconds = (candles[candles.length - 1]?.time ?? 0) - (candles[0]?.time ?? 0);
  const years = spanSeconds > 0 ? spanSeconds / YEAR_SECONDS : 0;
  const cagr = years > 0 && startingCapital > 0 ? (Math.pow(finalEquity / startingCapital, 1 / years) - 1) * 100 : 0;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : grossProfit > 0 ? 999 : 0,
    totalReturnPct: round(((finalEquity - startingCapital) / startingCapital) * 100, 2),
    finalEquity: round(finalEquity, 2),
    avgWin: wins.length ? round(grossProfit / wins.length, 2) : 0,
    avgLoss: losses.length ? round(-grossLoss / losses.length, 2) : 0,
    maxDrawdownPct: round(maxDd, 2),
    avgHoldingBars: trades.length ? round(trades.reduce((s, t) => s + t.bars, 0) / trades.length, 1) : 0,
    buyHoldReturnPct: round(buyHold, 2),
    expectancy: trades.length ? round(trades.reduce((s, t) => s + t.pnl, 0) / trades.length, 2) : 0,
    worstLossStreak,
    sharpe: round(sharpe, 2),
    sortino: round(sortino, 2),
    cagr: round(cagr, 2),
  };
}

function medianBarSeconds(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i++) diffs.push(candles[i].time - candles[i - 1].time);
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 0;
}
