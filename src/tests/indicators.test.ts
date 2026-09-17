import { describe, expect, it } from "vitest";
import { ema, lastValid, rsi, sma } from "@/services/market/indicators";

describe("indicators", () => {
  it("sma computes a trailing average", () => {
    const s = sma([1, 2, 3, 4, 5], 3);
    expect(s[2]).toBe(2); // (1+2+3)/3
    expect(s[4]).toBe(4); // (3+4+5)/3
    expect(Number.isNaN(s[0])).toBe(true);
  });

  it("rsi is ~100 on a monotonic uptrend", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = lastValid(rsi(rising, 14));
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(95);
  });

  it("rsi is ~0 on a monotonic downtrend", () => {
    const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
    const r = lastValid(rsi(falling, 14));
    expect(r!).toBeLessThan(5);
  });

  it("ema warms up then tracks values", () => {
    const e = ema([1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(Number.isNaN(e[0])).toBe(true);
    expect(lastValid(e)).not.toBeNull();
  });
});
