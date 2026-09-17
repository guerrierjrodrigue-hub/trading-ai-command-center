import { describe, expect, it } from "vitest";
import { computeStats, computeDrawdownSeries, type TradeLite } from "@/services/analytics/performance";

const t = (pnl: number, pnlPct: number, hours = 24): TradeLite => ({
  pnl,
  pnlPct,
  openedAt: new Date("2024-01-01T00:00:00Z"),
  closedAt: new Date(new Date("2024-01-01T00:00:00Z").getTime() + hours * 3_600_000),
});

describe("computeStats", () => {
  it("returns a zeroed block for no trades", () => {
    const s = computeStats([]);
    expect(s.trades).toBe(0);
    expect(s.expectancy).toBe(0);
    expect(s.profitFactor).toBe(0);
  });

  it("computes expectancy, win rate and profit factor", () => {
    // 2 wins (+100, +200), 2 losses (-50, -50): gross win 300, gross loss 100.
    const s = computeStats([t(100, 10), t(200, 20), t(-50, -5), t(-50, -5)]);
    expect(s.trades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.totalPnl).toBe(200);
    expect(s.expectancy).toBe(50); // 200 / 4
    expect(s.avgWin).toBe(150); // 300 / 2
    expect(s.avgLoss).toBe(-50); // -100 / 2
    expect(s.profitFactor).toBe(3); // 300 / 100
    expect(s.largestWin).toBe(200);
    expect(s.largestLoss).toBe(-50);
  });

  it("clamps profit factor when there are no losses", () => {
    const s = computeStats([t(100, 10), t(50, 5)]);
    expect(s.profitFactor).toBe(999);
    expect(s.winRate).toBe(100);
  });
});

describe("computeDrawdownSeries", () => {
  it("is zero at a fresh high and positive below the peak", () => {
    const { series, maxDrawdownPct } = computeDrawdownSeries([
      { time: "start", equity: 10000 },
      { time: "d1", equity: 11000 }, // peak
      { time: "d2", equity: 9900 }, // down from 11000
      { time: "now", equity: 11000 }, // back to peak
    ]);
    expect(series[0].drawdownPct).toBe(0);
    expect(series[1].drawdownPct).toBe(0);
    expect(series[2].drawdownPct).toBeCloseTo(10, 1); // (11000-9900)/11000
    expect(series[3].drawdownPct).toBe(0);
    expect(maxDrawdownPct).toBeCloseTo(10, 1);
  });
});
