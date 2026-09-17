import type { Timeframe } from "@/lib/validation";
import { env } from "@/lib/env";
import { getCatalogAsset } from "./catalog";
import type { Candle, MarketDataProvider, Quote } from "./types";

/**
 * REAL stocks / ETF / forex provider (Twelve Data).
 * Free tier: 8 req/min, 800/day. Behind the same interface as the mock and
 * wrapped by the composite + fallback, so a missing key / rate limit simply
 * falls back to simulation for those symbols — nothing breaks.
 * Key comes from STOCKS_API_KEY (server-side only).
 */
const INTERVAL: Record<Timeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "1D": "1day",
  "1W": "1week",
};

const QUOTE_TTL_MS = 30_000;
const quoteCache = new Map<string, { t: number; q: Quote }>();

export class TwelveDataProvider implements MarketDataProvider {
  readonly source = "live" as const;
  private base = "https://api.twelvedata.com";

  private key(): string {
    if (!env.market.stocksApiKey) {
      throw new Error("STOCKS_API_KEY required for Twelve Data");
    }
    return env.market.stocksApiKey;
  }

  /**
   * Twelve Data authoritatively serves stocks / ETF / forex. When it covers a
   * symbol, callers must not substitute a mock price on a transient failure
   * (rate limit / missing key) — that would corrupt trade P&L.
   */
  covers(symbol: string): boolean {
    const cls = getCatalogAsset(symbol)?.assetClass;
    return cls === "STOCK" || cls === "ETF" || cls === "FOREX";
  }

  private cached(symbol: string): Quote | null {
    const c = quoteCache.get(symbol.toUpperCase());
    return c && Date.now() - c.t < QUOTE_TTL_MS ? c.q : null;
  }

  private toQuote(symbol: string, d: any): Quote {
    const price = Number(d.close ?? d.price);
    if (!Number.isFinite(price)) throw new Error(`Twelve Data: no price for ${symbol}`);
    const q: Quote = {
      symbol,
      price,
      changePct24h: Number(d.percent_change ?? 0),
      high24h: Number(d.high ?? price),
      low24h: Number(d.low ?? price),
      volume24h: Number(d.volume ?? 0),
      source: "live",
      timestamp: Date.now(),
    };
    quoteCache.set(symbol.toUpperCase(), { t: Date.now(), q });
    return q;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const hit = this.cached(symbol);
    if (hit) return hit;
    const url = `${this.base}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${this.key()}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`Twelve Data ${res.status}`);
    const d = (await res.json()) as any;
    if (d.status === "error") throw new Error(d.message ?? "Twelve Data error");
    return this.toQuote(symbol, d);
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    if (symbols.length === 1) return [await this.getQuote(symbols[0])];
    const list = symbols.map((s) => encodeURIComponent(s)).join(",");
    const url = `${this.base}/quote?symbol=${list}&apikey=${this.key()}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`Twelve Data ${res.status}`);
    const data = (await res.json()) as any;
    // Batch responses are keyed by symbol; a single symbol returns a flat object.
    const out: Quote[] = [];
    for (const s of symbols) {
      const d = data[s] ?? data[s.toUpperCase()];
      if (d && d.status !== "error") {
        try {
          out.push(this.toQuote(s, d));
        } catch {
          /* skip — fallback fills it */
        }
      }
    }
    return out;
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    const url = `${this.base}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${INTERVAL[timeframe]}&outputsize=${Math.min(limit, 5000)}&apikey=${this.key()}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Twelve Data ${res.status}`);
    const data = (await res.json()) as any;
    if (data.status === "error" || !Array.isArray(data.values)) {
      throw new Error(data.message ?? `Twelve Data: no candles for ${symbol}`);
    }
    // API returns newest first — reverse to oldest→newest.
    return (data.values as any[])
      .map((v) => ({
        time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
        volume: Number(v.volume ?? 0),
      }))
      .reverse();
  }
}
