import { describe, expect, it } from "vitest";
import { longSignal } from "@/services/bot/strategy";
import type { Candle } from "@/services/market/types";

function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ time: 1_700_000_000 + i * 86400, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }));
}

describe("bot longSignal", () => {
  const up = candles(Array.from({ length: 120 }, (_, i) => 100 * Math.pow(1.01, i)));
  const down = candles(Array.from({ length: 120 }, (_, i) => 300 * Math.pow(0.99, i)));

  it("is long in a clear uptrend (EMA cross)", () => {
    expect(longSignal(up, "EMA_CROSS").long).toBe(true);
  });
  it("is flat in a clear downtrend (EMA cross)", () => {
    expect(longSignal(down, "EMA_CROSS").long).toBe(false);
  });
  it("RSI momentum long in uptrend, flat in downtrend", () => {
    expect(longSignal(up, "RSI").long).toBe(true);
    expect(longSignal(down, "RSI").long).toBe(false);
  });
  it("always returns an explanation string", () => {
    expect(longSignal(up, "MACD").reason.length).toBeGreaterThan(0);
    expect(longSignal(up, "TREND_FOLLOWING").reason.length).toBeGreaterThan(0);
  });
});
