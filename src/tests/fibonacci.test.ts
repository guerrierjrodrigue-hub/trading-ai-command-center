import { describe, expect, it } from "vitest";
import { analyzeFib } from "@/services/bot/strategies/fibonacci";
import type { Candle } from "@/services/market/types";

/** Build a candle from a close (tight wicks, rising open from previous). */
function toCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: i > 0 ? closes[i - 1] : c,
    high: c * 1.001,
    low: c * 0.999,
    close: c,
    volume: 1000,
  }));
}

/** Uptrend context -> impulse leg 100->200 -> pullback to ~61.8% -> small bounce. */
function fibScenario(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 60; i++) closes.push(80 + i * 0.34); // gentle rise ~80->100
  for (let w = 0; w <= 40; w++) closes.push(100 + w * 2.5); // impulse 100 -> 200
  const retraceFrom = 200;
  const retraceTo = 136;
  for (let k = 1; k <= 15; k++) closes.push(retraceFrom - (k * (retraceFrom - retraceTo)) / 15);
  closes.push(136.75, 137.5, 138.25, 139); // bounce (momentum turning up)
  return closes;
}

describe("analyzeFib (Fibonacci + confluence)", () => {
  it("goes long on a pullback into the Fib zone with valid SL/TP geometry", () => {
    const candles = toCandles(fibScenario());
    const res = analyzeFib(candles);
    const entry = candles[candles.length - 1].close;
    expect(res.long).toBe(true);
    expect(res.stop).toBeDefined();
    expect(res.takeProfit).toBeDefined();
    expect(res.stop!).toBeLessThan(entry); // stop below entry
    expect(entry).toBeLessThan(res.takeProfit!); // TP above entry
    expect((res.confluences ?? []).length).toBeGreaterThan(0);
  });

  it("refuses to trade against the trend (downtrend)", () => {
    const up = fibScenario();
    const down = up.map((c) => 300 - c); // mirror into a downtrend
    const res = analyzeFib(toCandles(down));
    expect(res.long).toBe(false);
  });

  it("does not enter when price is still at the high (no pullback)", () => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i++) closes.push(80 + i * 0.34);
    for (let w = 0; w <= 59; w++) closes.push(100 + w * 1.7); // straight up, no retrace
    const res = analyzeFib(toCandles(closes));
    expect(res.long).toBe(false);
  });

  it("needs enough data", () => {
    expect(analyzeFib(toCandles([1, 2, 3])).long).toBe(false);
  });
});
