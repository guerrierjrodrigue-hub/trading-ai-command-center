import type { Timeframe } from "@/lib/validation";

export type MarketSource = "mock" | "live";

export interface Quote {
  symbol: string;
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  source: MarketSource;
  timestamp: number; // unix ms
}

export interface Candle {
  time: number; // unix seconds (lightweight-charts convention)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataProvider {
  readonly source: MarketSource;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  /**
   * Whether this provider AUTHORITATIVELY serves live data for `symbol`. When a
   * live provider covers a symbol, callers must NEVER substitute a simulated
   * (mock) price for it — mixing a real entry price with a mock exit price
   * corrupts P&L. On a transient failure the quote is treated as unavailable
   * instead. Optional; absent means "unknown / not covered".
   */
  covers?(symbol: string): boolean;
}

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1D": 86400,
  "1W": 604800,
};
