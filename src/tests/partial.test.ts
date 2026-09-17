import { describe, expect, it } from "vitest";
import { partialDecision } from "@/services/bot/partial";

describe("partialDecision (partial take-profit + breakeven)", () => {
  const base = { entry: 100, takeProfit: 120 as number | null, stop: 90 as number | null, price: 100, quantity: 10, partialTaken: false };

  it("returns null when there is no valid take-profit", () => {
    expect(partialDecision({ ...base, takeProfit: null })).toBeNull();
    expect(partialDecision({ ...base, takeProfit: 100 })).toBeNull();
  });

  it("does not take a partial before the halfway target", () => {
    // Halfway to TP(120) is 110; at 108 we're not there.
    const d = partialDecision({ ...base, price: 108 });
    expect(d?.take).toBe(false);
    expect(d?.tp1).toBe(110);
  });

  it("sells half and sets breakeven at the halfway target", () => {
    const d = partialDecision({ ...base, price: 111 });
    expect(d?.take).toBe(true);
    expect(d?.sellQty).toBe(5); // half of 10
    expect(d?.breakeven).toBe(100); // entry (>= current stop 90)
    expect(d?.tp1).toBe(110);
  });

  it("does not take a partial once one was already taken", () => {
    expect(partialDecision({ ...base, price: 115, partialTaken: true })?.take).toBe(false);
  });

  it("does not partial when the full target is already reached (full close handles it)", () => {
    expect(partialDecision({ ...base, price: 121 })?.take).toBe(false);
  });

  it("breakeven never sits below entry, even with a higher trailed stop", () => {
    const d = partialDecision({ ...base, price: 111, stop: 105 });
    expect(d?.breakeven).toBe(105); // already above entry -> keep the higher stop
  });
});

describe("partialDecision — SHORT (mirror)", () => {
  // Short: entry 100, take-profit BELOW at 80, stop ABOVE at 110. Halfway to TP is 90.
  const base = { entry: 100, takeProfit: 80 as number | null, stop: 110 as number | null, price: 100, quantity: 10, partialTaken: false, side: "SHORT" as const };

  it("returns null when the take-profit is not below entry (invalid short TP)", () => {
    expect(partialDecision({ ...base, takeProfit: 120 })).toBeNull();
    expect(partialDecision({ ...base, takeProfit: 100 })).toBeNull();
  });

  it("does not take a partial before the halfway target (price still too high)", () => {
    const d = partialDecision({ ...base, price: 92 }); // 92 > tp1 90 -> not there yet
    expect(d?.take).toBe(false);
    expect(d?.tp1).toBe(90);
  });

  it("closes half and sets breakeven at the halfway target", () => {
    const d = partialDecision({ ...base, price: 89 }); // reached 90 going down
    expect(d?.take).toBe(true);
    expect(d?.sellQty).toBe(5);
    expect(d?.breakeven).toBe(100); // entry (<= current stop 110)
    expect(d?.tp1).toBe(90);
  });

  it("does not partial once the full target is already reached", () => {
    expect(partialDecision({ ...base, price: 79 })?.take).toBe(false);
  });

  it("breakeven never sits above entry, even with a lower trailed stop", () => {
    const d = partialDecision({ ...base, price: 89, stop: 95 });
    expect(d?.breakeven).toBe(95); // already below entry -> keep the lower (safer) stop
  });
});
