import type { Timeframe } from "@/lib/validation";
import { getCatalogAsset } from "./catalog";
import type { Candle, MarketDataProvider, Quote } from "./types";

/**
 * Routes each symbol to the right live source by asset class:
 *   crypto        -> cryptoProvider (CoinGecko)
 *   stocks/ETF    -> stocksProvider (Twelve Data)
 *   forex/metals  -> forexProvider  (OANDA)
 * Unknown symbols default to the crypto provider (matches prior behaviour).
 * It is resilient in batch: a failure in one sub-provider never sinks the
 * others — the outer FallbackMarketProvider fills any gaps from the mock.
 */
export class CompositeMarketProvider implements MarketDataProvider {
  readonly source = "live" as const;

  constructor(
    private cryptoProvider: MarketDataProvider,
    private stocksProvider: MarketDataProvider,
    private forexProvider: MarketDataProvider,
  ) {}

  private providerFor(symbol: string): MarketDataProvider {
    const cls = getCatalogAsset(symbol)?.assetClass;
    if (cls === "FOREX") return this.forexProvider;
    if (cls === "STOCK" || cls === "ETF") return this.stocksProvider;
    return this.cryptoProvider;
  }

  /** Covered if ANY live sub-provider authoritatively serves the symbol. */
  covers(symbol: string): boolean {
    return Boolean(
      this.cryptoProvider.covers?.(symbol) ||
        this.stocksProvider.covers?.(symbol) ||
        this.forexProvider.covers?.(symbol),
    );
  }

  async getQuote(symbol: string): Promise<Quote> {
    return this.providerFor(symbol).getQuote(symbol);
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const crypto: string[] = [];
    const stocks: string[] = [];
    const forex: string[] = [];
    for (const s of symbols) {
      const p = this.providerFor(s);
      if (p === this.forexProvider) forex.push(s);
      else if (p === this.stocksProvider) stocks.push(s);
      else crypto.push(s);
    }
    const [a, b, c] = await Promise.all([
      crypto.length ? this.cryptoProvider.getQuotes(crypto).catch(() => [] as Quote[]) : Promise.resolve([]),
      stocks.length ? this.stocksProvider.getQuotes(stocks).catch(() => [] as Quote[]) : Promise.resolve([]),
      forex.length ? this.forexProvider.getQuotes(forex).catch(() => [] as Quote[]) : Promise.resolve([]),
    ]);
    return [...a, ...b, ...c];
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]> {
    return this.providerFor(symbol).getCandles(symbol, timeframe, limit);
  }
}
