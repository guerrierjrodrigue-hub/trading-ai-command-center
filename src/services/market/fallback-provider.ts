import type { Timeframe } from "@/lib/validation";
import type { Candle, MarketDataProvider, Quote } from "./types";

/**
 * Wraps a "live" provider with a fallback (mock) one. Every call tries live
 * first and falls back per-symbol to the mock for symbols the live source does
 * NOT cover (e.g. a stock/forex when only crypto is live).
 *
 * CRITICAL — never mock a covered symbol: if the live provider authoritatively
 * serves a symbol (`live.covers(symbol)`), a transient failure (network / rate
 * limit) must NOT be replaced with a simulated price. The mock's anchor prices
 * are stale catalog values (e.g. ADA 0.95 vs a live 0.21), so mixing a real
 * entry with a mock exit corrupts P&L catastrophically. For covered symbols a
 * failure is surfaced as "unavailable" (getQuote throws, getQuotes omits,
 * getCandles returns []), and the caller simply skips that symbol this cycle.
 */
export class FallbackMarketProvider implements MarketDataProvider {
  readonly source = "live" as const;

  constructor(
    private live: MarketDataProvider,
    private fallback: MarketDataProvider,
  ) {}

  private covered(symbol: string): boolean {
    return Boolean(this.live.covers?.(symbol));
  }

  covers(symbol: string): boolean {
    return this.covered(symbol);
  }

  async getQuote(symbol: string): Promise<Quote> {
    try {
      return await this.live.getQuote(symbol);
    } catch (e) {
      if (this.covered(symbol)) throw e; // never substitute a mock for a live symbol
      return this.fallback.getQuote(symbol);
    }
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    // Fetch as many as possible from the live source in ONE batched call, then
    // fill ONLY uncovered symbols from the fallback. Covered symbols the live
    // source couldn't serve are omitted (never mocked).
    let live: Quote[] = [];
    try {
      live = await this.live.getQuotes(symbols);
    } catch {
      live = [];
    }
    const bySymbol = new Map(live.map((q) => [q.symbol.toUpperCase(), q]));
    const out = await Promise.all(
      symbols.map(async (s) => {
        const hit = bySymbol.get(s.toUpperCase());
        if (hit) return hit;
        if (this.covered(s)) return null; // covered but unavailable -> omit, don't mock
        return this.fallback.getQuote(s);
      }),
    );
    return out.filter((q): q is Quote => q != null);
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]> {
    try {
      const candles = await this.live.getCandles(symbol, timeframe, limit);
      if (candles.length > 0) return candles;
      // Empty from a covered source = unavailable; do not fabricate mock candles.
      return this.covered(symbol) ? [] : this.fallback.getCandles(symbol, timeframe, limit);
    } catch {
      return this.covered(symbol) ? [] : this.fallback.getCandles(symbol, timeframe, limit);
    }
  }
}
