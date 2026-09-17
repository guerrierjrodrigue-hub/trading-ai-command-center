/**
 * Broker abstraction — the "standard socket" a real brokerage plugs into.
 *
 * SAFETY: real order execution is gated. A connector may expose trading only
 * when it is in PAPER (demo) mode, or in LIVE mode when BROKER_TRADING_ENABLED
 * is explicitly true. The default provider is the internal paper engine, which
 * does NOT trade through this interface (the app's own /api/paper handles it).
 */

export type BrokerMode = "paper" | "live";

export interface BrokerAccount {
  provider: string;
  mode: BrokerMode;
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  /** Whether REAL (live-money) execution is enabled. Always false in paper mode. */
  tradingEnabled: boolean;
  /** True when the connector is actually configured (keys present, etc.). */
  connected: boolean;
  note?: string;
}

export interface BrokerPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  type: string;
  status: string;
  filledPrice: number | null;
  createdAt: string;
}

export interface BrokerOrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
}

export interface BrokerCapabilities {
  provider: string;
  mode: BrokerMode;
  /** Can this connector place orders right now? (paper = yes; live = only if the master switch is on) */
  canTrade: boolean;
  /** What this broker trades — used to guide/validate symbol input in the UI. */
  assetClass?: "CRYPTO" | "STOCK" | "MIXED";
  /** A few valid example symbols for this broker (first is used as the default). */
  sampleSymbols?: string[];
}

export interface BrokerConnector {
  readonly name: string;
  readonly mode: BrokerMode;
  capabilities(): BrokerCapabilities;
  /** Read-only: account balances. */
  getAccount(userId: string): Promise<BrokerAccount>;
  /** Read-only: open positions held at the broker. */
  getPositions(userId: string): Promise<BrokerPosition[]>;
  /** Read-only: recent orders. Optional. */
  getOrders?(userId: string): Promise<BrokerOrder[]>;
  /** Place an order. Optional — only implemented by brokers that can trade. */
  submitOrder?(userId: string, input: BrokerOrderInput): Promise<BrokerOrder>;
  /** Close an open position. Optional. */
  closePosition?(userId: string, symbol: string): Promise<void>;
}

export class BrokerNotConfiguredError extends Error {}
export class BrokerTradingDisabledError extends Error {}
