import { describe, expect, it } from "vitest";
import type { Candle } from "@/services/market/types";
import {
  buildH4,
  calculateUnits,
  donchianSignal,
  latestClosedSignal,
  levels,
  strategyFingerprint,
} from "@/services/bot/strategies/v2h4-gold";

const H4_SECONDS = 4 * 60 * 60;
const M15_SECONDS = 15 * 60;
// Any multiple of H4_SECONDS is already a valid H4 bucket boundary.
const ALIGNED_START = Math.floor(1_700_000_000 / H4_SECONDS) * H4_SECONDS;

function mkM15(count: number, startTime = ALIGNED_START): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 100 + i * 0.1;
    return {
      time: startTime + i * M15_SECONDS,
      open,
      high: open + 0.5,
      low: open - 0.5,
      close: open + 0.2,
      volume: 10,
    };
  });
}

function mkH4(time: number, o: number, h: number, l: number, c: number, v = 100): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: v };
}

describe("buildH4", () => {
  it("aggregates 16 M15 bars into one H4 bar (open/close/high/low/volume)", () => {
    const m15 = mkM15(16);
    const h4 = buildH4(m15);
    expect(h4).toHaveLength(1);
    const bar = h4[0];
    expect(bar.time).toBe(ALIGNED_START);
    expect(bar.open).toBeCloseTo(m15[0].open, 9); // first bar's open
    expect(bar.close).toBeCloseTo(m15[15].close, 9); // last bar's close
    expect(bar.high).toBeCloseTo(m15[15].high, 9); // highs increase with i
    expect(bar.low).toBeCloseTo(m15[0].low, 9); // lows increase with i
    expect(bar.volume).toBeCloseTo(160, 9); // 16 x 10
  });

  it("splits two consecutive H4 buckets correctly", () => {
    const m15 = mkM15(32);
    const h4 = buildH4(m15);
    expect(h4).toHaveLength(2);
    expect(h4[0].time).toBe(ALIGNED_START);
    expect(h4[1].time).toBe(ALIGNED_START + H4_SECONDS);
    // The two buckets don't share any bar: bucket 2's open is bar #16's open.
    expect(h4[1].open).toBeCloseTo(m15[16].open, 9);
  });

  it("returns nothing for no input", () => {
    expect(buildH4([])).toEqual([]);
  });
});

describe("donchianSignal — shift 1 (excludes the current bar)", () => {
  it("detects a breakout using the PRIOR 55 bars only, not the current one", () => {
    const bars: Candle[] = [];
    for (let i = 0; i < 55; i++) {
      bars.push(mkH4(ALIGNED_START + i * H4_SECONDS, 100, 105, 95, 100));
    }
    // Current bar breaks well above the prior channel [95, 105].
    bars.push(mkH4(ALIGNED_START + 55 * H4_SECONDS, 105, 120, 100, 115));

    const signal = donchianSignal(bars);
    expect(signal).not.toBeNull();
    expect(signal!.channelHigh).toBe(105); // excludes the current bar's high (120)
    expect(signal!.channelLow).toBe(95);
    expect(signal!.side).toBe("LONG");
  });

  it("returns no side when price stays inside the channel", () => {
    const bars: Candle[] = [];
    for (let i = 0; i < 56; i++) {
      bars.push(mkH4(ALIGNED_START + i * H4_SECONDS, 100, 105, 95, 100));
    }
    const signal = donchianSignal(bars);
    expect(signal!.side).toBeNull();
  });

  it("returns null with fewer than period+1 bars", () => {
    const bars: Candle[] = Array.from({ length: 10 }, (_, i) => mkH4(ALIGNED_START + i * H4_SECONDS, 100, 101, 99, 100));
    expect(donchianSignal(bars)).toBeNull();
  });
});

describe("latestClosedSignal — drops the still-forming H4 bucket", () => {
  it("excludes a bucket that hasn't closed yet as of `now`", () => {
    // 57 full H4 buckets worth of M15 bars.
    const m15 = mkM15(57 * 16);
    const lastBucketStart = ALIGNED_START + 56 * H4_SECONDS;

    // `now` sits INSIDE the 57th bucket (not yet closed) -> only 56 closed bars.
    const nowMidBucket = new Date((lastBucketStart + H4_SECONDS / 2) * 1000);
    const sigMid = latestClosedSignal(m15, nowMidBucket);
    expect(sigMid).not.toBeNull();
    expect(sigMid!.h4).toHaveLength(56);

    // `now` sits AFTER the 57th bucket closes -> 57 closed bars.
    const nowAfterClose = new Date((lastBucketStart + H4_SECONDS) * 1000);
    const sigAfter = latestClosedSignal(m15, nowAfterClose);
    expect(sigAfter).not.toBeNull();
    expect(sigAfter!.h4).toHaveLength(57);
  });
});

describe("levels", () => {
  it("sets SL at 1.5xATR and TP at 3R for a LONG", () => {
    const { stop, takeProfit } = levels(2000, 10, "LONG");
    expect(2000 - stop).toBeCloseTo(15, 6); // 1.5 * 10
    expect(takeProfit - 2000).toBeCloseTo(45, 6); // 3R = 3 * 15
  });

  it("mirrors SL/TP for a SHORT", () => {
    const { stop, takeProfit } = levels(2000, 10, "SHORT");
    expect(stop - 2000).toBeCloseTo(15, 6);
    expect(2000 - takeProfit).toBeCloseTo(45, 6);
  });
});

describe("calculateUnits", () => {
  it("returns 0 when the account is too small for the stop distance", () => {
    // $200 capital, 1% risk = $2, stop distance 40 -> 0.05 units -> floors to 0.
    expect(calculateUnits(200, 40)).toBe(0);
  });

  it("returns a positive whole-unit size for a sufficient account", () => {
    // $20,000 capital, 1% risk = $200, stop distance 40 -> 5 units.
    const units = calculateUnits(20_000, 40);
    expect(units).toBeGreaterThan(0);
    expect(units).toBe(5);
  });

  it("returns 0 for non-positive inputs", () => {
    expect(calculateUnits(0, 40)).toBe(0);
    expect(calculateUnits(20_000, 0)).toBe(0);
  });
});

describe("strategyFingerprint", () => {
  it("is a 64-character lowercase hex string (SHA-256)", async () => {
    const fp = await strategyFingerprint();
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across calls (deterministic config -> deterministic hash)", async () => {
    const a = await strategyFingerprint();
    const b = await strategyFingerprint();
    expect(a).toBe(b);
  });
});
