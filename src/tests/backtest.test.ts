import { describe, expect, it } from "vitest";
import { bootstrapExpectancy, runBacktest, runSplitBacktest, splitCandles } from "@/services/backtest/engine";
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

describe("splitCandles", () => {
  it("in-sample + out-of-sample lengths always add up to the total", () => {
    for (const n of [0, 1, 30, 100, 101, 300]) {
      const candles = makeCandles(Array.from({ length: n }, (_, i) => 100 + i));
      const { inSample, outOfSample } = splitCandles(candles, 0.7);
      expect(inSample.length + outOfSample.length).toBe(n);
    }
  });

  it("defaults to a 70/30 split", () => {
    const candles = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
    const { inSample, outOfSample } = splitCandles(candles);
    expect(inSample).toHaveLength(70);
    expect(outOfSample).toHaveLength(30);
  });
});

describe("bootstrapExpectancy", () => {
  const pnls = [10, -5, 20, -8, 15, -3, 30, -12, 5, -1];

  it("is reproducible for the same trades + seed (seeded mulberry32)", () => {
    const a = bootstrapExpectancy(pnls, 2000, 42);
    const b = bootstrapExpectancy(pnls, 2000, 42);
    expect(a).toEqual(b);
  });

  it("differs for a different seed (sanity check it's actually seeded, not constant)", () => {
    const a = bootstrapExpectancy(pnls, 2000, 42);
    const b = bootstrapExpectancy(pnls, 2000, 43);
    expect(a).not.toEqual(b);
  });

  it("keeps P(expectancy > 0) within [0, 1]", () => {
    const res = bootstrapExpectancy(pnls, 2000, 42);
    expect(res.probabilityPositive).toBeGreaterThanOrEqual(0);
    expect(res.probabilityPositive).toBeLessThanOrEqual(1);
  });

  it("returns a degenerate (zeroed) result for no trades", () => {
    const res = bootstrapExpectancy([]);
    expect(res.meanLow).toBe(0);
    expect(res.meanHigh).toBe(0);
    expect(res.probabilityPositive).toBe(0);
  });

  it("places the CI band around a clearly positive sample above zero", () => {
    const allPositive = [10, 12, 8, 15, 9, 11, 14, 10, 13, 9];
    const res = bootstrapExpectancy(allPositive, 2000, 42);
    expect(res.meanLow).toBeGreaterThan(0);
    expect(res.probabilityPositive).toBe(1);
  });
});

describe("runSplitBacktest", () => {
  it("attaches inSample/outOfSample/splitRatio and a bootstrap CI on the full metrics", () => {
    const up = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
    const down = Array.from({ length: 60 }, (_, i) => 220 - i * 2);
    const up2 = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
    const candles = makeCandles([...up, ...down, ...up2]);

    const res = runSplitBacktest(candles, { strategy: "EMA_CROSS", startingCapital: 10000, feeBps: 10 }, 0.7);

    expect(res.splitRatio).toBe(0.7);
    expect(res.inSample).toBeDefined();
    expect(res.outOfSample).toBeDefined();
    // The full-period result keeps its normal shape (unchanged existing metrics).
    expect(res.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    // Bootstrap fields land on the FULL period's metrics only.
    expect(res.metrics.bootstrapResamples).toBe(2000);
    expect(res.metrics.bootstrapSeed).toBe(42);
    expect(res.metrics.expectancyProbPositive).toBeGreaterThanOrEqual(0);
    expect(res.metrics.expectancyProbPositive).toBeLessThanOrEqual(1);
  });
});
