import { describe, expect, it } from "vitest";
import { feeFor, realizedPnl, riskReward, unrealizedPnl } from "@/services/trading/pnl";

describe("unrealizedPnl", () => {
  it("computes LONG gain", () => {
    const r = unrealizedPnl("LONG", 100, 10, 110);
    expect(r.pnl).toBe(100);
    expect(r.pnlPct).toBe(10);
  });
  it("computes SHORT gain when price falls", () => {
    const r = unrealizedPnl("SHORT", 100, 10, 90);
    expect(r.pnl).toBe(100);
    expect(r.pnlPct).toBe(10);
  });
  it("computes LONG loss", () => {
    const r = unrealizedPnl("LONG", 100, 10, 95);
    expect(r.pnl).toBe(-50);
  });
});

describe("realizedPnl", () => {
  it("nets fees out of the gross P&L", () => {
    const r = realizedPnl("LONG", 100, 110, 10, 5);
    expect(r.pnl).toBe(95); // gross 100 - 5 fee
  });
});

describe("riskReward", () => {
  it("computes R/R = reward / risk", () => {
    expect(riskReward(100, 95, 110)).toBe(2); // risk 5, reward 10
  });
  it("returns 0 when risk is zero", () => {
    expect(riskReward(100, 100, 110)).toBe(0);
  });
});

describe("feeFor", () => {
  it("computes basis-point fees", () => {
    expect(feeFor(2000, 10)).toBe(2); // 0.10% of 2000
  });
});
