import { describe, expect, it } from "vitest";
import { planClose, planOpen } from "@/services/trading/paper-engine";

describe("paper engine round-trip", () => {
  it("opens then closes a winning LONG and reconciles cash", () => {
    const startCash = 10000;
    const open = planOpen({ cash: startCash, side: "BUY", quantity: 10, price: 100, feeBps: 10 });
    expect(open.direction).toBe("LONG");
    expect(open.notional).toBe(1000);
    expect(open.fee).toBe(1); // 10 bps of 1000
    expect(open.cashAfter).toBe(8999); // 10000 - 1000 - 1

    const close = planClose({
      cash: open.cashAfter,
      side: "LONG",
      quantity: 10,
      entryPrice: 100,
      exitPrice: 110,
      feeBps: 10,
    });
    expect(close.fee).toBe(1.1); // 10 bps of 1100
    expect(close.pnl).toBe(98.9); // gross 100 - exit fee 1.1
    // cash back = 8999 + costBasis(1000) + pnl(98.9) = 10097.9
    expect(close.cashAfter).toBe(10097.9);

    // Net change vs start = pnl - openFee = 98.9 - 1 = 97.9
    expect(close.cashAfter - startCash).toBeCloseTo(97.9, 5);
  });

  it("opens a SHORT via SELL", () => {
    const open = planOpen({ cash: 10000, side: "SELL", quantity: 5, price: 200, feeBps: 0 });
    expect(open.direction).toBe("SHORT");
    expect(open.notional).toBe(1000);
  });
});
