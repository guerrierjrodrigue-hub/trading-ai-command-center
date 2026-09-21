import { describe, expect, it } from "vitest";
import type { Candle } from "@/services/market/types";
import { detectRegime, regimePolicy } from "@/services/bot/regime";
import { tradeScore } from "@/services/bot/tradeScore";
import { runBacktest } from "@/services/backtest/engine";

/** Build daily candles from a close series (simple, low intrabar range). */
function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: i > 0 ? closes[i - 1] : c,
    high: Math.max(c, i > 0 ? closes[i - 1] : c) * 1.004,
    low: Math.min(c, i > 0 ? closes[i - 1] : c) * 0.996,
    close: c,
    volume: 1000,
  }));
}
function ramp(n: number, from: number, to: number): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

describe("detectRegime", () => {
  it("flags a steady uptrend as TRENDING_BULL", () => {
    const r = detectRegime(candles(ramp(120, 100, 170)));
    expect(r.direction).toBe("UP");
    expect(r.regime).toBe("TRENDING_BULL");
  });

  it("flags a steady downtrend as TRENDING_BEAR", () => {
    const r = detectRegime(candles(ramp(120, 170, 100)));
    expect(r.direction).toBe("DOWN");
    expect(r.regime).toBe("TRENDING_BEAR");
  });

  it("flags a flat market as RANGE or LOW_VOL (no direction)", () => {
    const r = detectRegime(candles(Array.from({ length: 120 }, () => 100)));
    expect(r.direction).toBe("NEUTRAL");
    expect(["RANGE", "LOW_VOL"]).toContain(r.regime);
  });
});

describe("regimePolicy (Strategy Manager)", () => {
  it("blocks all entries in extreme volatility (the one hard rule)", () => {
    expect(regimePolicy("HIGH_VOL").blockEntries).toBe(true);
    expect(regimePolicy("HIGH_VOL").allowLong).toBe(false);
    expect(regimePolicy("HIGH_VOL").allowShort).toBe(false);
  });
  it("otherwise allows both directions (regime informs the score, not a veto)", () => {
    for (const r of ["TRENDING_BULL", "TRENDING_BEAR", "RANGE", "LOW_VOL"] as const) {
      expect(regimePolicy(r)).toMatchObject({ blockEntries: false, allowLong: true, allowShort: true });
      expect(regimePolicy(r).allowedStrategies.length).toBe(5); // FIB_CONFLUENCE, BIG_BOUNCE, BREAK_HOOK_GO, DIVERGENCE, V2H4_GOLD
    }
  });
});

describe("tradeScore", () => {
  const base = candles(ramp(120, 100, 150));
  it("scores a fully-favorable long higher than an unfavorable one", () => {
    const good = tradeScore({ candles: base, side: "LONG", rr: 2.5, strategyQuality: 90, htfAgree: true, regimeAligned: true });
    const bad = tradeScore({ candles: base, side: "LONG", rr: 0.8, strategyQuality: 30, htfAgree: false, regimeAligned: false });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeLessThanOrEqual(100);
    expect(bad.score).toBeGreaterThanOrEqual(0);
  });
});

describe("runBacktest — book strategy + pro metrics", () => {
  it("runs a book strategy and returns pro metrics fields", () => {
    // A choppy-but-rising series so a setup can plausibly fire; we mainly assert
    // the engine runs and reports the new metrics without throwing.
    const closes = [...ramp(80, 100, 140), ...ramp(40, 140, 125), ...ramp(40, 125, 165)];
    const res = runBacktest(candles(closes), { strategy: "BIG_BOUNCE", startingCapital: 10000, feeBps: 10 });
    expect(res.strategy).toBe("BIG_BOUNCE");
    expect(typeof res.metrics.sharpe).toBe("number");
    expect(typeof res.metrics.sortino).toBe("number");
    expect(typeof res.metrics.expectancy).toBe("number");
    expect(typeof res.metrics.worstLossStreak).toBe("number");
    expect(typeof res.metrics.cagr).toBe("number");
    expect(res.metrics.totalTrades).toBeGreaterThanOrEqual(0);
  });
});
