import { describe, expect, it } from "vitest";
import { computePortfolioMetrics } from "@/services/trading/portfolio";

describe("computePortfolioMetrics", () => {
  it("aggregates equity, unrealized and realized P&L", () => {
    const m = computePortfolioMetrics({
      startingCapital: 10000,
      cash: 7000,
      positions: [
        { symbol: "BTC", side: "LONG", quantity: 0.03, entryPrice: 95000, currentPrice: 96000 },
      ],
      trades: [{ pnl: 100, closedAt: new Date("2024-01-01") }],
    });

    // Position value = costBasis(2850) + unrealized((96000-95000)*0.03=30) = 2880
    expect(m.marketValue).toBe(2880);
    expect(m.unrealizedPnl).toBe(30);
    expect(m.equity).toBe(9880); // 7000 + 2880
    expect(m.realizedPnl).toBe(100);
    expect(m.openPositions).toBe(1);
    expect(m.trades).toBe(1);
    expect(m.winRate).toBe(100);
  });

  it("computes current drawdown from the all-time equity peak", () => {
    // Realized curve: 10000 -> 11000 (peak) -> 10000 (now, all in cash).
    const m = computePortfolioMetrics({
      startingCapital: 10000,
      cash: 10000,
      positions: [],
      trades: [
        { pnl: 1000, closedAt: new Date("2024-01-01") },
        { pnl: -1000, closedAt: new Date("2024-01-02") },
      ],
    });
    // Peak was 11000, we're back at 10000 => (11000-10000)/11000 = ~9.09%.
    expect(m.currentDrawdownPct).toBeCloseTo(9.09, 1);
    expect(m.maxDrawdownPct).toBeCloseTo(9.09, 1);
  });

  it("reports zero current drawdown at a fresh equity high", () => {
    const m = computePortfolioMetrics({
      startingCapital: 10000,
      cash: 11000,
      positions: [],
      trades: [{ pnl: 1000, closedAt: new Date("2024-01-01") }],
    });
    expect(m.currentDrawdownPct).toBe(0);
  });

  it("handles an empty portfolio", () => {
    const m = computePortfolioMetrics({
      startingCapital: 10000,
      cash: 10000,
      positions: [],
      trades: [],
    });
    expect(m.equity).toBe(10000);
    expect(m.totalReturnPct).toBe(0);
    expect(m.allocation.find((a) => a.label === "Cash")?.pct).toBe(100);
  });
});
