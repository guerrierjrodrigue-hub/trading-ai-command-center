import { describe, expect, it } from "vitest";
import type { Candle } from "@/services/market/types";
import { evaluate as bigBounce } from "@/services/bot/strategies/bigBounce";
import { evaluate as breakHookGo } from "@/services/bot/strategies/breakHookGo";
import { evaluate as divergence } from "@/services/bot/strategies/divergence";
import { selectBest, evaluateAll } from "@/services/bot/strategies/select";

type OV = Partial<Pick<Candle, "open" | "high" | "low">>;
function mk(closes: number[], overrides: Record<number, OV> = {}): Candle[] {
  return closes.map((c, i) => {
    const base: Candle = {
      time: 1_700_000_000 + i * 86_400,
      open: i > 0 ? closes[i - 1] : c,
      high: Math.max(c, i > 0 ? closes[i - 1] : c) * 1.003,
      low: Math.min(c, i > 0 ? closes[i - 1] : c) * 0.997,
      close: c,
      volume: 1000,
    };
    return { ...base, ...overrides[i] };
  });
}

function rising(n: number, from: number, to: number): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

describe("Big Bounce", () => {
  it("enters on a rejection at a support+psychological confluence in an uptrend", () => {
    const closes = [...rising(100, 100, 165)];
    // pull back toward the 150 support, then a bullish rejection bar
    closes.push(162, 158, 154, 151, 150.4, 150.2, 150.9);
    const last = closes.length - 1;
    const c = mk(closes, {
      [last]: { open: 150.2, high: 151.3, low: 149.7 }, // dipped to ~150, closed up 150.9
      [last - 1]: { open: 150.9, high: 151.0, low: 149.8 },
    });
    const res = bigBounce(c);
    const entry = closes[last];
    expect(res.long).toBe(true);
    expect(res.stop!).toBeLessThan(entry);
    expect(entry).toBeLessThan(res.takeProfit!);
  });

  it("stays out when there is no trend", () => {
    const flat = Array.from({ length: 120 }, () => 100);
    expect(bigBounce(mk(flat)).long).toBe(false);
  });
});

describe("Break-Hook-Go", () => {
  it("enters after a break, retest and hold above a level", () => {
    const closes = [...rising(70, 110, 149)];
    for (let i = 0; i < 42; i++) closes.push(148 + (i % 3)); // plateau/resistance ~148-150
    // recent 8 bars: break above ~150, retest, hold (go)
    closes.push(151, 153, 156, 154, 151, 150.5, 151, 152);
    const last = closes.length - 1;
    const c = mk(closes, {
      [last]: { open: 151, high: 152.5, low: 150.6 }, // bullish, holds above level
      [last - 2]: { low: 150.2 },
      [last - 3]: { low: 150.1 },
    });
    const res = breakHookGo(c);
    const entry = closes[last];
    expect(res.long).toBe(true);
    expect(res.stop!).toBeLessThan(entry);
    expect(entry).toBeLessThan(res.takeProfit!);
  });
});

describe("Divergence", () => {
  it("enters on a confirmed bullish divergence (lower price low, higher RSI low)", () => {
    const closes: number[] = [];
    closes.push(...rising(60, 210, 190)); // gentle decline
    closes.push(...rising(36, 190, 150)); // steep leg down -> RSI very low near 150
    closes.push(...rising(9, 150, 165)); // bounce
    closes.push(...rising(10, 165, 145)); // shallower leg down -> lower price, higher RSI
    closes.push(...rising(5, 145, 151)); // recovery / confirmation
    const last = closes.length - 1;
    const c = mk(closes, { [last]: { open: 148, high: 151.5, low: 147.5 } }); // bullish close
    const res = divergence(c);
    const entry = closes[last];
    expect(res.long).toBe(true);
    expect(res.stop!).toBeLessThan(entry);
    expect(entry).toBeLessThan(res.takeProfit!);
  });
});

describe("selectBest", () => {
  it("evaluates all book strategies and returns a named winner with geometry", () => {
    const closes = [...rising(100, 100, 165)];
    closes.push(162, 158, 154, 151, 150.4, 150.2, 150.9);
    const last = closes.length - 1;
    const c = mk(closes, { [last]: { open: 150.2, high: 151.3, low: 149.7 } });
    const all = evaluateAll(c);
    expect(all.length).toBe(5); // FIB_CONFLUENCE, BIG_BOUNCE, BREAK_HOOK_GO, DIVERGENCE, V2H4_GOLD
    const best = selectBest(c, 55);
    expect(best).not.toBeNull();
    if (best) {
      expect(best.long).toBe(true);
      expect(best.quality).toBeGreaterThanOrEqual(55);
      expect(best.stop!).toBeLessThan(closes[last]);
    }
  });

  it("returns null when nothing qualifies", () => {
    const flat = Array.from({ length: 120 }, () => 100);
    expect(selectBest(mk(flat), 55)).toBeNull();
  });

  it("does NOT open a short when shorts are not allowed", () => {
    // A downtrend that mirrors a valid long setup: still no LONG, and shorts off.
    const closes = [...rising(100, 100, 165)];
    closes.push(162, 158, 154, 151, 150.4, 150.2, 150.9);
    const last = closes.length - 1;
    const longWinner = mk(closes, { [last]: { open: 150.2, high: 151.3, low: 149.7 } });
    const mirrored = reflectCandles(longWinner);
    expect(selectBest(mirrored, 55, undefined, false)).toBeNull();
  });

  it("finds a SHORT setup on a mirrored (downtrending) series when allowed", () => {
    // Reflect a known LONG winner: the mirror is a valid SHORT setup.
    const closes = [...rising(100, 100, 165)];
    closes.push(162, 158, 154, 151, 150.4, 150.2, 150.9);
    const last = closes.length - 1;
    const longWinner = mk(closes, { [last]: { open: 150.2, high: 151.3, low: 149.7 } });
    const mirrored = reflectCandles(longWinner);
    const best = selectBest(mirrored, 55, undefined, true);
    expect(best).not.toBeNull();
    if (best) {
      expect(best.side).toBe("SHORT");
      const entry = mirrored[mirrored.length - 1].close;
      // Short geometry: take-profit BELOW entry, stop ABOVE entry.
      expect(best.takeProfit!).toBeLessThan(entry);
      expect(best.stop!).toBeGreaterThan(entry);
    }
  });
});

/** Reflect a price series around the mid of its range (same math as select.ts). */
function reflectCandles(candles: Candle[]): Candle[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  const ref = lo + hi;
  return candles.map((c) => ({
    time: c.time,
    open: ref - c.open,
    high: ref - c.low,
    low: ref - c.high,
    close: ref - c.close,
    volume: c.volume,
  }));
}
