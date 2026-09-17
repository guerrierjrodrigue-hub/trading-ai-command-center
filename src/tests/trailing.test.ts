import { describe, expect, it } from "vitest";
import { computeTrailingStop } from "@/services/bot/trailing";

describe("computeTrailingStop", () => {
  const base = { entry: 100, takeProfit: 120, currentStop: 90, trailPct: 0.06, activationFrac: 0.5 };

  it("does nothing while the trade is not in profit", () => {
    expect(computeTrailingStop({ ...base, price: 99 })).toBeNull();
  });

  it("does nothing before the activation threshold (halfway to TP)", () => {
    // Halfway to TP (120) is 110; at 108 we're not there yet.
    expect(computeTrailingStop({ ...base, price: 108 })).toBeNull();
  });

  it("raises the stop once activated, trailing below price", () => {
    // price 115 -> candidate = 115*0.94 = 108.1, above the old stop 90.
    const s = computeTrailingStop({ ...base, price: 115 });
    expect(s).not.toBeNull();
    expect(s!).toBeCloseTo(108.1, 1);
    expect(s!).toBeLessThan(115);
    expect(s!).toBeGreaterThan(base.currentStop);
  });

  it("never lowers an already-higher stop", () => {
    // Old stop 112 already above the candidate (108.1) -> keep it.
    expect(computeTrailingStop({ ...base, price: 115, currentStop: 112 })).toBeNull();
  });

  it("floors the trailed stop at breakeven when the candidate is below entry", () => {
    // Tight profit past activation but big trail width -> candidate < entry -> breakeven.
    const s = computeTrailingStop({ entry: 100, takeProfit: 111, currentStop: 95, price: 110, trailPct: 0.15 });
    expect(s).toBe(100); // breakeven, and above the old stop 95
  });

  it("with no take-profit, requires at least one trail-width of profit", () => {
    expect(computeTrailingStop({ entry: 100, takeProfit: null, currentStop: 90, price: 103, trailPct: 0.06 })).toBeNull();
    const s = computeTrailingStop({ entry: 100, takeProfit: null, currentStop: 90, price: 110, trailPct: 0.06 });
    expect(s).not.toBeNull();
    expect(s!).toBeCloseTo(103.4, 1); // 110*0.94
  });
});

describe("computeTrailingStop — SHORT (mirror)", () => {
  // Short: entry 100, take-profit BELOW at 80, stop ABOVE at 110. Halfway = 90.
  const base = { entry: 100, takeProfit: 80, currentStop: 110, trailPct: 0.06, activationFrac: 0.5, side: "SHORT" as const };

  it("does nothing while the trade is not in profit (price >= entry)", () => {
    expect(computeTrailingStop({ ...base, price: 101 })).toBeNull();
  });

  it("does nothing before the activation threshold (halfway down to TP)", () => {
    // Halfway to TP(80) is 90; at 92 we're not there yet.
    expect(computeTrailingStop({ ...base, price: 92 })).toBeNull();
  });

  it("lowers the stop once activated, trailing above price", () => {
    // price 85 -> candidate = 85*1.06 = 90.1, below the old stop 110.
    const s = computeTrailingStop({ ...base, price: 85 });
    expect(s).not.toBeNull();
    expect(s!).toBeCloseTo(90.1, 1);
    expect(s!).toBeGreaterThan(85);
    expect(s!).toBeLessThan(base.currentStop);
  });

  it("never raises an already-lower stop", () => {
    // Old stop 88 already below the candidate (90.1) -> keep it.
    expect(computeTrailingStop({ ...base, price: 85, currentStop: 88 })).toBeNull();
  });

  it("floors the trailed stop at breakeven when the candidate is above entry", () => {
    const s = computeTrailingStop({ entry: 100, takeProfit: 89, currentStop: 105, price: 90, trailPct: 0.15, side: "SHORT" });
    expect(s).toBe(100); // breakeven, and below the old stop 105
  });
});
