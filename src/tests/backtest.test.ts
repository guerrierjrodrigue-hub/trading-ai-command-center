import { describe, expect, it } from "vitest";
import { runBacktest } from "@/services/backtest/engine";
import type { Candle } from "@/services/market/types";

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000 + i * 86400,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1000,
  }));
}

describe("runBacktest", () => {
  it("captures gains on a clear uptrend with EMA cross", () => {
    // Steady uptrend for 120 bars.
    const closes = Array.from({ length: 120 }, (_, i) => 100 * Math.pow(1.01, i));
    const res = runBacktest(makeCandles(closes), {
      strategy: "EMA_CROSS",
      startingCapital: 10000,
      feeBps: 10,
      fast: 12,
      slow: 26,
    });
    expect(res.metrics.totalReturnPct).toBeGreaterThan(0);
    expect(res.metrics.finalEquity).toBeGreaterThan(10000);
    expect(res.equityCurve).toHaveLength(120);
    expect(res.metrics.buyHoldReturnPct).toBeGreaterThan(0);
  });

  it("produces coherent trade accounting", () => {
    // Up then down then up — forces at least one round trip.
    const up = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    const down = Array.from({ length: 40 }, (_, i) => 180 - i * 2);
    const up2 = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    const res = runBacktest(makeCandles([...up, ...down, ...up2]), {
      strategy: "EMA_CROSS",
      startingCapital: 10000,
      feeBps: 10,
    });
    expect(res.metrics.totalTrades).toBeGreaterThanOrEqual(1);
    // Wins + losses always equals total trades.
    expect(res.metrics.wins + res.metrics.losses).toBe(res.metrics.totalTrades);
    // Win rate within bounds.
    expect(res.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(res.metrics.winRate).toBeLessThanOrEqual(100);
  });

  it("handles a flat market with no explosion", () => {
    const closes = Array.from({ length: 60 }, () => 100);
    const res = runBacktest(makeCandles(closes), {
      strategy: "RSI",
      startingCapital: 10000,
      feeBps: 10,
    });
    expect(Number.isFinite(res.metrics.finalEquity)).toBe(true);
    expect(res.metrics.finalEquity).toBeGreaterThan(0);
  });
});
