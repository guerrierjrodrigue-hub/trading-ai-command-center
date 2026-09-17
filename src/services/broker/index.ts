import { env } from "@/lib/env";
import { PaperBrokerConnector } from "./paper-broker";
import { AlpacaBrokerConnector } from "./alpaca-broker";
import { BinanceTestnetConnector } from "./binance-broker";
import type { BrokerConnector } from "./types";

let cached: BrokerConnector | null = null;

/**
 * Factory: returns the configured broker connector. The app depends only on
 * the read-only BrokerConnector interface. Default is the paper broker.
 */
export function getBrokerConnector(): BrokerConnector {
  if (cached) return cached;
  switch (env.broker.provider) {
    case "alpaca":
      cached = new AlpacaBrokerConnector();
      break;
    case "binance":
      cached = new BinanceTestnetConnector();
      break;
    case "paper":
    default:
      cached = new PaperBrokerConnector();
      break;
  }
  return cached;
}

/**
 * The single source of truth for whether REAL order execution is allowed.
 * Always false unless the user has explicitly set BROKER_TRADING_ENABLED=true
 * AND a non-paper broker is configured. No code path in the MVP flips this.
 */
export function realTradingEnabled(): boolean {
  return env.broker.tradingEnabled === true && env.broker.provider !== "paper";
}

export * from "./types";
