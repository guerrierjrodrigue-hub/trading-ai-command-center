import { describe, expect, it } from "vitest";
import {
  checkRiskLimits,
  computePositionSize,
  fitQuantityToAccount,
} from "@/services/risk/position-sizing";

describe("fitQuantityToAccount — caps size to fit the account", () => {
  const base = {
    entry: 1.1, // e.g. EUR/USD
    cash: 10000,
    feeBps: 10,
    equity: 10000,
    currentExposure: 0,
    maxExposurePct: 80,
    symbolExposure: 0,
    maxPerAssetExposurePct: 35,
  };

  it("caps a tight-stop forex trade (huge risk-based qty) to the per-asset limit", () => {
    // Risk-based sizing for a 0.1% stop would demand ~181k units (~200k notional,
    // 20x the account). It must be capped so the notional fits within 35% equity.
    const qty = fitQuantityToAccount({ ...base, desiredQty: 181818 });
    expect(qty).toBeGreaterThan(0);
    const notional = qty * base.entry;
    expect(notional).toBeLessThanOrEqual(0.35 * base.equity + 1e-6); // per-asset cap
    expect(notional).toBeLessThanOrEqual(base.cash); // never exceeds cash
  });

  it("leaves a already-fitting quantity unchanged", () => {
    const qty = fitQuantityToAccount({ ...base, desiredQty: 100 }); // 110 notional
    expect(qty).toBe(100);
  });

  it("returns 0 when there is no cash / exposure room left", () => {
    const qty = fitQuantityToAccount({ ...base, desiredQty: 1000, cash: 0, currentExposure: 8000 });
    expect(qty).toBe(0);
  });
});

describe("computePositionSize", () => {
  it("matches the PRD example: 10k capital, 1% risk, entry 100, stop 95 => 20 units", () => {
    const r = computePositionSize({ capital: 10000, riskPct: 1, entry: 100, stop: 95 });
    expect(r.direction).toBe("LONG");
    expect(r.riskAmount).toBe(100);
    expect(r.riskPerUnit).toBe(5);
    expect(r.quantity).toBe(20);
    expect(r.notional).toBe(2000);
    expect(r.potentialLoss).toBe(100);
  });

  it("infers SHORT when the stop is above entry", () => {
    const r = computePositionSize({ capital: 10000, riskPct: 2, entry: 100, stop: 110 });
    expect(r.direction).toBe("SHORT");
    expect(r.riskAmount).toBe(200);
    expect(r.riskPerUnit).toBe(10);
    expect(r.quantity).toBe(20);
  });

  it("throws when entry equals stop", () => {
    expect(() => computePositionSize({ capital: 1000, riskPct: 1, entry: 100, stop: 100 })).toThrow();
  });
});

describe("checkRiskLimits", () => {
  const settings = {
    riskPerTradePct: 1,
    maxDailyLossPct: 3,
    maxOpenPositions: 5,
    maxPortfolioExposurePct: 60,
  };

  it("allows an order within all limits", () => {
    const res = checkRiskLimits(
      1000,
      { cash: 5000, openPositions: 1, currentExposure: 1000, capital: 10000, realizedPnlToday: 0 },
      settings,
    );
    expect(res.allowed).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  it("blocks when notional exceeds cash", () => {
    const res = checkRiskLimits(
      6000,
      { cash: 5000, openPositions: 1, currentExposure: 0, capital: 10000, realizedPnlToday: 0 },
      settings,
    );
    expect(res.allowed).toBe(false);
    expect(res.violations.join(" ")).toMatch(/cash/i);
  });

  it("blocks when max open positions reached", () => {
    const res = checkRiskLimits(
      100,
      { cash: 9000, openPositions: 5, currentExposure: 1000, capital: 10000, realizedPnlToday: 0 },
      settings,
    );
    expect(res.allowed).toBe(false);
    expect(res.violations.join(" ")).toMatch(/open positions/i);
  });

  it("blocks when exposure would exceed the cap", () => {
    const res = checkRiskLimits(
      3000,
      { cash: 9000, openPositions: 1, currentExposure: 4000, capital: 10000, realizedPnlToday: 0 },
      settings,
    );
    expect(res.allowed).toBe(false);
    expect(res.violations.join(" ")).toMatch(/exposure/i);
  });

  it("blocks when the daily loss limit is hit", () => {
    const res = checkRiskLimits(
      100,
      { cash: 9000, openPositions: 1, currentExposure: 0, capital: 10000, realizedPnlToday: -300 },
      settings,
    );
    expect(res.allowed).toBe(false);
    expect(res.violations.join(" ")).toMatch(/daily loss/i);
  });
});
