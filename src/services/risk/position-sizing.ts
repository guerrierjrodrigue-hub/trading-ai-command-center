import { round } from "@/lib/utils";

export type Direction = "LONG" | "SHORT";

export interface PositionSizeInput {
  capital: number;
  riskPct: number; // e.g. 1 means 1%
  entry: number;
  stop: number;
}

export interface PositionSizeResult {
  direction: Direction;
  riskAmount: number; // capital * riskPct%
  riskPerUnit: number; // |entry - stop|
  quantity: number; // units to buy/sell
  notional: number; // quantity * entry
  potentialLoss: number; // at stop
}

/**
 * Core position-sizing formula:
 *   Risk $      = capital * riskPct%
 *   Risk/unit   = |entry - stop|
 *   Position    = Risk $ / Risk/unit
 *
 * Direction is inferred: stop below entry => LONG, stop above entry => SHORT.
 */
export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { capital, riskPct, entry, stop } = input;
  if (capital <= 0) throw new Error("capital must be > 0");
  if (riskPct <= 0) throw new Error("riskPct must be > 0");
  if (entry <= 0 || stop <= 0) throw new Error("entry and stop must be > 0");
  if (entry === stop) throw new Error("entry and stop must differ");

  const direction: Direction = stop < entry ? "LONG" : "SHORT";
  const riskAmount = capital * (riskPct / 100);
  const riskPerUnit = Math.abs(entry - stop);
  const quantity = riskAmount / riskPerUnit;
  const notional = quantity * entry;

  return {
    direction,
    riskAmount: round(riskAmount, 2),
    riskPerUnit: round(riskPerUnit, 6),
    quantity: round(quantity, 6),
    notional: round(notional, 2),
    potentialLoss: round(quantity * riskPerUnit, 2),
  };
}

/**
 * Caps a desired (risk-based) quantity so the resulting position actually FITS
 * the account: within available cash (incl. fee), remaining total-exposure room,
 * and remaining per-asset-exposure room. Risk-based sizing alone can demand a
 * notional many times the account for tight-stop / low-volatility instruments
 * (e.g. forex); without this cap those trades are impossible and never open.
 * Returns a quantity >= 0 (0 means there is no room for any position).
 */
export function fitQuantityToAccount(params: {
  desiredQty: number;
  entry: number;
  cash: number;
  feeBps: number;
  equity: number;
  currentExposure: number; // notional of all open positions
  maxExposurePct: number;
  symbolExposure: number; // notional already open on THIS symbol
  maxPerAssetExposurePct: number;
}): number {
  const { desiredQty, entry, cash, feeBps, equity, currentExposure, maxExposurePct, symbolExposure, maxPerAssetExposurePct } = params;
  if (entry <= 0) return 0;
  const feeRate = feeBps / 10_000;
  const maxByCash = cash > 0 ? (cash / (entry * (1 + feeRate))) * 0.98 : 0;
  const roomExposure = Math.max(0, (maxExposurePct / 100) * equity - currentExposure);
  const roomAsset = Math.max(0, (maxPerAssetExposurePct / 100) * equity - symbolExposure);
  const capped = Math.min(desiredQty, maxByCash, roomExposure / entry, roomAsset / entry);
  return capped > 0 ? round(capped, 6) : 0;
}

export interface RiskControlState {
  cash: number;
  openPositions: number;
  currentExposure: number; // notional of open positions
  capital: number; // portfolio total value (for exposure %)
  realizedPnlToday: number; // negative if losing
}

export interface RiskSettings {
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  maxPortfolioExposurePct: number;
}

export interface RiskCheck {
  allowed: boolean;
  violations: string[];
}

/**
 * Validates a prospective new position against the user's risk settings.
 * Returns every violated rule (so the UI can explain exactly what blocks).
 */
export function checkRiskLimits(
  newNotional: number,
  state: RiskControlState,
  settings: RiskSettings,
): RiskCheck {
  const violations: string[] = [];

  if (newNotional > state.cash) {
    violations.push(
      `Insufficient cash: order notional ${newNotional.toFixed(2)} > available ${state.cash.toFixed(2)}`,
    );
  }
  if (state.openPositions >= settings.maxOpenPositions) {
    violations.push(
      `Max open positions reached (${settings.maxOpenPositions})`,
    );
  }
  const exposurePct =
    state.capital > 0
      ? ((state.currentExposure + newNotional) / state.capital) * 100
      : 100;
  if (exposurePct > settings.maxPortfolioExposurePct) {
    violations.push(
      `Portfolio exposure ${exposurePct.toFixed(1)}% > max ${settings.maxPortfolioExposurePct}%`,
    );
  }
  const dailyLossPct =
    state.capital > 0 ? (-state.realizedPnlToday / state.capital) * 100 : 0;
  if (dailyLossPct >= settings.maxDailyLossPct) {
    violations.push(
      `Daily loss limit hit (${dailyLossPct.toFixed(1)}% >= ${settings.maxDailyLossPct}%)`,
    );
  }

  return { allowed: violations.length === 0, violations };
}
