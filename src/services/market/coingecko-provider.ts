import type { Timeframe } from "@/lib/validation";
import { env } from "@/lib/env";
import type { Candle, MarketDataProvider, Quote } from "./types";

/**
 * REAL market-data provider (CoinGecko public API, crypto only).
 *
 * Plugs in behind the same interface as the mock. Used when MARKET_PROVIDER=coingecko
 * (wrapped by FallbackMarketProvider so anything it can't serve — stocks, forex,
 * or a failed/rate-limited call — transparently uses the mock).
 *
 * Hardening for the free tier:
 *  - `getQuotes` fetches ALL requested crypto in ONE `/coins/markets` call.
 *  - a small in-memory TTL cache avoids hammering the API on repeat views.
 * All calls are server-side; the API key (if any) comes from env only.
 */
const IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  TRX: "tron",
  MATIC: "matic-network",
  ATOM: "cosmos",
  UNI: "uniswap",
  XLM: "stellar",
  NEAR: "near",
};

const DAYS_FOR_TF: Partial<Record<Timeframe, number>> = {
  "1m": 1,
  "5m": 1,
  "15m": 1,
  "30m": 1,
  "1h": 2,
  "4h": 14,
  // CoinGecko's free /ohlc endpoint auto-buckets by range: days>30 → 4-day
  // candles. 90 days yields only ~23 of them (too few to backtest); 365 days
  // stays in the same 4-day bucket but yields ~92.
  "1D": 365,
  "1W": 365,
};

const QUOTE_TTL_MS = 30_000;
const quoteCache = new Map<string, { t: number; q: Quote }>();

interface CgMarket {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  total_volume: number | null;
}

export class CoinGeckoProvider implements MarketDataProvider {
  readonly source = "live" as const;
  private base = env.market.baseUrl || "https://api.coingecko.com/api/v3";

  private id(symbol: string): string | null {
    return IDS[symbol.toUpperCase()] ?? null;
  }

  /** CoinGecko authoritatively serves the mapped crypto symbols. */
  covers(symbol: string): boolean {
    return this.id(symbol) !== null;
  }

  private headers(): HeadersInit {
    return env.market.apiKey ? { "x-cg-demo-api-key": env.market.apiKey } : {};
  }

  private toQuote(symbol: string, d: CgMarket): Quote {
    return {
      symbol,
      price: d.current_price,
      changePct24h: d.price_change_percentage_24h ?? 0,
      high24h: d.high_24h ?? d.current_price,
      low24h: d.low_24h ?? d.current_price,
      volume24h: d.total_volume ?? 0,
      source: "live",
      timestamp: Date.now(),
    };
  }

  private cached(symbol: string): Quote | null {
    const c = quoteCache.get(symbol.toUpperCase());
    if (c && Date.now() - c.t < QUOTE_TTL_MS) return c.q;
    return null;
  }

  private store(symbol: string, q: Quote) {
    quoteCache.set(symbol.toUpperCase(), { t: Date.now(), q });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const hit = this.cached(symbol);
    if (hit) return hit;
    const [q] = await this.getQuotes([symbol]);
    if (!q) throw new Error(`No live data for ${symbol}`);
    return q;
  }

  /** Batched: one API call for every mapped crypto symbol. Unmapped symbols are
   *  simply omitted from the result (the fallback wrapper fills them). */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const mapped = symbols
      .map((s) => ({ symbol: s, id: this.id(s) }))
      .filter((x): x is { symbol: string; id: string } => !!x.id);
    if (mapped.length === 0) return [];

    // Serve from cache when everything requested is still fresh.
    const allCached = mapped.map((m) => this.cached(m.symbol));
    if (allCached.every(Boolean)) return allCached as Quote[];

    const ids = [...new Set(mapped.map((m) => m.id))].join(",");
    const url = `${this.base}/coins/markets?vs_currency=usd&ids=${ids}`;
    const res = await fetch(url, { headers: this.headers(), next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const rows = (await res.json()) as CgMarket[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    const out: Quote[] = [];
    for (const m of mapped) {
      const row = byId.get(m.id);
      if (!row) continue;
      const q = this.toQuote(m.symbol, row);
      this.store(m.symbol, q);
      out.push(q);
    }
    return out;
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    const id = this.id(symbol);
    if (!id) throw new Error(`No live mapping for ${symbol}`);
    const days = DAYS_FOR_TF[timeframe] ?? 90;
    const url = `${this.base}/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
    const res = await fetch(url, { headers: this.headers(), next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const rows = (await res.json()) as number[][]; // [ts, o, h, l, c]
    return rows.slice(-limit).map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: r[1],
      high: r[2],
      low: r[3],
      close: r[4],
      volume: 0, // OHLC endpoint has no volume
    }));
  }
}
