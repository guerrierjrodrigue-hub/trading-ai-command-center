import { env } from "@/lib/env";
import { MockMarketDataProvider } from "./mock-provider";
import { CoinGeckoProvider } from "./coingecko-provider";
import { TwelveDataProvider } from "./twelvedata-provider";
import { OandaProvider } from "./oanda-provider";
import { CompositeMarketProvider } from "./composite-provider";
import { FallbackMarketProvider } from "./fallback-provider";
import type { MarketDataProvider } from "./types";

let cached: MarketDataProvider | null = null;

/**
 * Factory: returns the configured market-data provider.
 * The rest of the app depends ONLY on the MarketDataProvider interface,
 * never on a concrete implementation.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;
  switch (env.market.provider) {
    case "coingecko":
      // Live crypto with automatic fallback to the mock for anything the live
      // source can't serve (unmapped symbols, network/rate-limit errors).
      cached = new FallbackMarketProvider(new CoinGeckoProvider(), new MockMarketDataProvider());
      break;
    case "twelvedata":
      // Live stocks/ETF only; everything else falls back to the mock.
      cached = new FallbackMarketProvider(new TwelveDataProvider(), new MockMarketDataProvider());
      break;
    case "oanda":
      // Live forex + gold only (OANDA practice); everything else falls back to the mock.
      cached = new FallbackMarketProvider(new OandaProvider(), new MockMarketDataProvider());
      break;
    case "live":
      // Real data everywhere: crypto via CoinGecko, stocks/ETF via Twelve Data,
      // forex + gold via OANDA, with the mock filling any gap (missing key /
      // credential, rate limit, error).
      cached = new FallbackMarketProvider(
        new CompositeMarketProvider(
          new CoinGeckoProvider(),
          new TwelveDataProvider(),
          new OandaProvider(),
        ),
        new MockMarketDataProvider(),
      );
      break;
    case "mock":
    default:
      cached = new MockMarketDataProvider();
      break;
  }
  return cached;
}

export * from "./types";
export * from "./indicators";
export { CATALOG, getCatalogAsset } from "./catalog";
