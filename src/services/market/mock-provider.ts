import type { Timeframe } from "@/lib/validation";
import { hashSeed, round, seededRandom } from "@/lib/utils";
import { getCatalogAsset } from "./catalog";
import { TIMEFRAME_SECONDS, type Candle, type MarketDataProvider, type Quote } from "./types";

/**
 * Deterministic mock market-data provider.
 *
 * Generates a reproducible geometric random walk anchored to each asset's
 * catalog base price. The same (symbol, timeframe) always yields the same
 * series within a UTC day, so the UI is stable to look at while still moving
 * day to day. NO network, NO API key — the whole app runs on this by default.
 */
export class MockMarketDataProvider implements MarketDataProvider {
  readonly source = "mock" as const;

  private dayBucket(): number {
    return Math.floor(Date.now() / 86_400_000);
  }

  private buildSeries(symbol: string, timeframe: Timeframe, limit: number): Candle[] {
    const asset = getCatalogAsset(symbol);
    const base = asset?.basePrice ?? 100;
    const annualVol = asset?.annualVol ?? 0.4;

    const tfSec = TIMEFRAME_SECONDS[timeframe];
    // Per-bar volatility from annualised vol (≈ 365d * 24h * 3600s per year).
    const barsPerYear = (365 * 24 * 3600) / tfSec;
    const sigma = annualVol / Math.sqrt(barsPerYear);

    const seed = hashSeed(`${symbol}:${timeframe}:${this.dayBucket()}`);
    const rand = seededRandom(seed);

    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (now % tfSec) - (limit - 1) * tfSec;

    // Start a bit below base so "today" tends to sit mid-range.
    let price = base * (0.9 + rand() * 0.15);
    const candles: Candle[] = [];
    for (let i = 0; i < limit; i++) {
      const time = startTime + i * tfSec;
      // Box-Muller normal from two uniforms.
      const u1 = Math.max(rand(), 1e-9);
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const drift = -0.5 * sigma * sigma;
      const open = price;
      const close = open * Math.exp(drift + sigma * z);
      const hi = Math.max(open, close) * (1 + Math.abs(rand()) * sigma * 0.8);
      const lo = Math.min(open, close) * (1 - Math.abs(rand()) * sigma * 0.8);
      const vol = (asset?.basePrice ?? 100) * 1000 * (0.6 + rand());
      candles.push({
        time,
        open: round(open, 6),
        high: round(hi, 6),
        low: round(lo, 6),
        close: round(close, 6),
        volume: Math.round(vol),
      });
      price = close;
    }
    return candles;
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    return this.buildSeries(symbol, timeframe, Math.min(Math.max(limit, 50), 1000));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const candles = this.buildSeries(symbol, "1h", 26);
    const last = candles[candles.length - 1];
    const dayAgo = candles[Math.max(0, candles.length - 24)];
    const changePct24h = ((last.close - dayAgo.close) / dayAgo.close) * 100;
    const window = candles.slice(-24);
    return {
      symbol,
      price: round(last.close, 6),
      changePct24h: round(changePct24h, 2),
      high24h: round(Math.max(...window.map((c) => c.high)), 6),
      low24h: round(Math.min(...window.map((c) => c.low)), 6),
      volume24h: window.reduce((s, c) => s + c.volume, 0),
      source: "mock",
      timestamp: Date.now(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }
}
