import type { Timeframe } from "@/lib/validation";
import { env } from "@/lib/env";
import { getCatalogAsset } from "./catalog";
import type { Candle, MarketDataProvider, Quote } from "./types";

/**
 * REAL forex + metals (gold) provider — OANDA v20 REST API.
 *
 * Uses a free OANDA *practice* (demo) account for market DATA only. It reads
 * prices/candles; it never places an order (real order execution stays gated by
 * the BrokerConnector layer + BROKER_TRADING_ENABLED). Credentials come from env
 * only (OANDA_API_TOKEN, OANDA_ACCOUNT_ID, OANDA_ENV) — never hardcoded.
 *
 * Behind the same interface as every other provider, routed by the composite
 * (FOREX -> OANDA) and wrapped by the fallback. Because it declares `covers()`
 * for the instruments it serves, a transient failure or a closed weekend market
 * is surfaced as "unavailable" (never substituted with a mock price), so trade
 * P&L is never corrupted by mixing a real entry with a simulated exit.
 *
 * Symbols: the app catalog uses slash form (EUR/USD, XAU/USD); OANDA uses
 * underscores (EUR_USD, XAU_USD). Gold (XAU/USD) is classified as FOREX in the
 * catalog so no Prisma AssetClass migration is needed.
 */

/** Timeframe -> OANDA granularity. */
const GRANULARITY: Record<Timeframe, string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "30m": "M30",
  "1h": "H1",
  "4h": "H4",
  "1D": "D",
  "1W": "W",
};

interface OandaPrice {
  instrument: string;
  tradeable?: boolean;
  status?: string;
  closeoutBid?: string;
  closeoutAsk?: string;
  bids?: { price: string }[];
  asks?: { price: string }[];
}

interface OandaCandle {
  complete: boolean;
  volume: number;
  time: string; // unix seconds with a fractional part, as a string
  mid?: { o: string; h: string; l: string; c: string };
}

export class OandaProvider implements MarketDataProvider {
  readonly source = "live" as const;

  private base(): string {
    return env.oanda.environment === "live"
      ? "https://api-fxtrade.oanda.com"
      : "https://api-fxpractice.oanda.com";
  }

  private token(): string {
    if (!env.oanda.apiToken) throw new Error("OANDA_API_TOKEN required for OANDA");
    return env.oanda.apiToken;
  }

  private accountId(): string {
    if (!env.oanda.accountId) throw new Error("OANDA_ACCOUNT_ID required for OANDA");
    return env.oanda.accountId;
  }

  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.token()}`, "Accept-Datetime-Format": "UNIX" };
  }

  /**
   * Catalog-driven: any FOREX-class catalog asset (forex pairs + metals, which
   * are classified FOREX) maps to its OANDA instrument by turning the slash into
   * an underscore (EUR/USD -> EUR_USD, XAU/USD -> XAU_USD). Adding a pair to the
   * catalog automatically makes OANDA cover it — no change needed here.
   */
  private instrument(symbol: string): string | null {
    const asset = getCatalogAsset(symbol);
    if (asset?.assetClass !== "FOREX") return null;
    return symbol.toUpperCase().replace("/", "_");
  }

  /** OANDA authoritatively serves the forex + metal (gold/silver) instruments. */
  covers(symbol: string): boolean {
    return this.instrument(symbol) !== null;
  }

  private mid(p: OandaPrice): number | null {
    const bid = Number(p.closeoutBid ?? p.bids?.[0]?.price);
    const ask = Number(p.closeoutAsk ?? p.asks?.[0]?.price);
    if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
    if (Number.isFinite(bid)) return bid;
    if (Number.isFinite(ask)) return ask;
    return null;
  }

  private toQuote(symbol: string, price: number): Quote {
    // OANDA's pricing endpoint carries no 24h stats; indicators run off candles.
    return {
      symbol,
      price,
      changePct24h: 0,
      high24h: price,
      low24h: price,
      volume24h: 0,
      source: "live",
      timestamp: Date.now(),
    };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const [q] = await this.getQuotes([symbol]);
    if (!q) throw new Error(`OANDA: no live price for ${symbol} (market closed?)`);
    return q;
  }

  /** One pricing request for a set of OANDA instruments. Throws on HTTP error. */
  private async fetchPricing(instruments: string[]): Promise<OandaPrice[]> {
    const list = instruments.join(",");
    const url = `${this.base()}/v3/accounts/${this.accountId()}/pricing?instruments=${encodeURIComponent(list)}`;
    const res = await fetch(url, { headers: this.headers(), next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`OANDA ${res.status}`);
    const data = (await res.json()) as { prices?: OandaPrice[] };
    return data.prices ?? [];
  }

  /**
   * Batched: one pricing call for every mapped instrument. If the batch call
   * fails (e.g. a single unknown instrument makes OANDA reject the whole
   * request), it retries each instrument on its own and returns whatever
   * succeeds — so one bad symbol never wipes out the rest of the forex universe.
   */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const mapped = symbols
      .map((s) => ({ symbol: s, instrument: this.instrument(s) }))
      .filter((x): x is { symbol: string; instrument: string } => !!x.instrument);
    if (mapped.length === 0) return [];

    const instruments = [...new Set(mapped.map((m) => m.instrument))];
    let prices: OandaPrice[];
    try {
      prices = await this.fetchPricing(instruments);
    } catch {
      const settled = await Promise.allSettled(instruments.map((i) => this.fetchPricing([i])));
      prices = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    }
    const byInstrument = new Map(prices.map((p) => [p.instrument, p]));

    const out: Quote[] = [];
    for (const m of mapped) {
      const p = byInstrument.get(m.instrument);
      if (!p) continue;
      // Market closed (weekend) -> not tradeable -> unavailable, never mocked.
      if (p.tradeable === false || (p.status && p.status !== "tradeable")) continue;
      const price = this.mid(p);
      if (price == null || !(price > 0)) continue;
      out.push(this.toQuote(m.symbol, price));
    }
    return out;
  }

  /**
   * Whether the forex/metals market is currently OPEN, using OANDA's own
   * `tradeable` flag on a representative instrument (EUR/USD). Returns "unknown"
   * on any error or missing credentials, so callers can avoid acting on a
   * transient failure (e.g. never announce a false "market closed").
   */
  async marketStatus(symbol = "EUR/USD"): Promise<"open" | "closed" | "unknown"> {
    const instrument = this.instrument(symbol);
    if (!instrument || !env.oanda.apiToken || !env.oanda.accountId) return "unknown";
    try {
      const prices = await this.fetchPricing([instrument]);
      const p = prices.find((x) => x.instrument === instrument);
      if (!p) return "unknown";
      return p.tradeable === false || (p.status && p.status !== "tradeable") ? "closed" : "open";
    } catch {
      return "unknown";
    }
  }

  /** One candles request (<=5000, OANDA's own per-request ceiling). `to` (unix
   * seconds), when given, asks for `count` candles ending AT that instant —
   * the building block both getCandles() and the paginated fetch use. */
  private async fetchCandlePage(
    instrument: string,
    granularity: string,
    count: number,
    to?: number,
  ): Promise<Candle[]> {
    const params = new URLSearchParams({ granularity, count: String(count), price: "M" });
    if (to != null) params.set("to", String(to));
    const url = `${this.base()}/v3/instruments/${instrument}/candles?${params.toString()}`;
    const res = await fetch(url, { headers: this.headers(), next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`OANDA ${res.status}`);
    const data = (await res.json()) as { candles?: OandaCandle[] };
    const rows = data.candles ?? [];
    // OANDA returns candles oldest -> newest already.
    return rows
      .filter((c) => c.mid)
      .map((c) => ({
        time: Math.floor(Number(c.time)),
        open: Number(c.mid!.o),
        high: Number(c.mid!.h),
        low: Number(c.mid!.l),
        close: Number(c.mid!.c),
        volume: Number(c.volume ?? 0),
      }))
      .filter((c) => Number.isFinite(c.close));
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    const instrument = this.instrument(symbol);
    if (!instrument) throw new Error(`OANDA: no instrument mapping for ${symbol}`);
    const count = Math.min(Math.max(limit, 1), 5000);
    return this.fetchCandlePage(instrument, GRANULARITY[timeframe], count);
  }

  /**
   * Pages through OANDA's candles endpoint (which caps a single request at
   * 5000 candles) to assemble up to `target` candles for a backtest that
   * needs deep history — walking backward from now via the `to` parameter,
   * one 5000-candle page at a time. Always clamped to
   * MAX_PAGINATED_CANDLES regardless of what's asked, so a request for "1
   * year" of M15 gold candles can't blow up the memory of a small VM.
   * Stops early if OANDA runs out of history (a page returns fewer candles
   * than requested, or contributes nothing new). Candles are deduplicated
   * by `time` (adjacent pages can overlap by one bar at the boundary) and
   * returned oldest -> newest, matching getCandles()'s convention.
   */
  async fetchCandlesPaginated(symbol: string, timeframe: Timeframe, target: number): Promise<Candle[]> {
    const instrument = this.instrument(symbol);
    if (!instrument) throw new Error(`OANDA: no instrument mapping for ${symbol}`);
    const wanted = Math.min(Math.max(Math.floor(target), 1), MAX_PAGINATED_CANDLES);
    const granularity = GRANULARITY[timeframe];
    const PAGE_SIZE = 5000;

    const rawPages: Candle[] = [];
    let uniqueCount = 0;
    let to: number | undefined;

    while (uniqueCount < wanted) {
      const count = Math.min(PAGE_SIZE, wanted - uniqueCount);
      const page = await this.fetchCandlePage(instrument, granularity, count, to);
      if (!page.length) break; // no more history available at all

      rawPages.push(...page);
      const newUniqueCount = dedupeCandlesByTime(rawPages).length;
      const exhausted = page.length < count; // OANDA gave fewer than asked -> hit the start of history
      const noProgress = newUniqueCount === uniqueCount; // fully-overlapping page -> stuck, stop
      uniqueCount = newUniqueCount;
      to = page[0].time - 1; // page is oldest -> newest; next page walks further back

      if (exhausted || noProgress) break;
    }

    const deduped = dedupeCandlesByTime(rawPages);
    return deduped.slice(Math.max(0, deduped.length - wanted));
  }
}

/**
 * Safety ceiling for fetchCandlesPaginated. This app runs on a small VM with
 * limited RAM, so even an explicit request for more history than this is
 * capped rather than honored — 40,000 M15 candles is about 416 days
 * (~1 year) of calendar time, comfortably covering the "1 year" backtesting
 * option while keeping the in-memory candle array (and everything the
 * backtest engine builds from it) bounded.
 */
export const MAX_PAGINATED_CANDLES = 40_000;

/** Removes duplicate candles by `time` (keeping the first occurrence) and
 * sorts the result oldest -> newest. Exported standalone so the join-overlap
 * dedup logic is directly unit-testable without mocking network calls. */
export function dedupeCandlesByTime(candles: Candle[]): Candle[] {
  const seen = new Set<number>();
  const out: Candle[] = [];
  for (const c of candles) {
    if (!seen.has(c.time)) {
      seen.add(c.time);
      out.push(c);
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
