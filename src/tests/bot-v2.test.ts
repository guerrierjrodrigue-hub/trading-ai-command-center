import { describe, expect, it } from "vitest";
import type { Candle } from "@/services/market/types";
import { isUptrend } from "@/services/market/indicators";
import { selectBest } from "@/services/bot/strategies/select";
import { parseStrategy } from "@/services/bot/feedback";

function mk(closes: number[], overrides: Record<number, Partial<Pick<Candle, "open" | "high" | "low">>> = {}): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: i > 0 ? closes[i - 1] : c,
    high: Math.max(c, i > 0 ? closes[i - 1] : c) * 1.003,
    low: Math.min(c, i > 0 ? closes[i - 1] : c) * 0.997,
    close: c,
    volume: 1000,
    ...overrides[i],
  }));
}
const rising = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

describe("isUptrend (higher-timeframe filter)", () => {
  it("is true for a rising series and false for a falling one", () => {
    expect(isUptrend(rising(120, 100, 200))).toBe(true);
    expect(isUptrend(rising(120, 200, 100))).toBe(false);
  });
});

describe("parseStrategy (performance attribution)", () => {
  it("extracts the strategy tag from an order reason", () => {
    expect(parseStrategy("BOT open BOT:FIB_CONFLUENCE")).toBe("FIB_CONFLUENCE");
    expect(parseStrategy("BOT open BOT:BIG_BOUNCE")).toBe("BIG_BOUNCE");
  });
  it("returns UNKNOWN when there is no tag", () => {
    expect(parseStrategy("BOT open")).toBe("UNKNOWN");
    expect(parseStrategy(null)).toBe("UNKNOWN");
  });
});

describe("selectBest exclusions (feedback loop)", () => {
  // Uptrend + shallow pullback to a support/psychological confluence => Big Bounce.
  const closes = [...rising(100, 100, 165), 162, 158, 154, 151, 150.4, 150.2, 150.9];
  const last = closes.length - 1;
  const c = mk(closes, { [last]: { open: 150.2, high: 151.3, low: 149.7 } });

  it("picks Big Bounce normally", () => {
    const best = selectBest(c, 55);
    expect(best?.name).toBe("BIG_BOUNCE");
  });
  it("skips an excluded strategy", () => {
    const best = selectBest(c, 55, new Set(["BIG_BOUNCE"]));
    // Nothing else fires on this setup, so the excluded winner yields null.
    expect(best).toBeNull();
  });
});
