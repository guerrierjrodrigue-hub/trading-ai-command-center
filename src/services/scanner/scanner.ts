import { clamp, round } from "@/lib/utils";
import {
  detectTrend,
  ema,
  lastValid,
  macd,
  rsi,
  supportResistance,
  type Trend,
} from "@/services/market/indicators";
import { CATALOG } from "@/services/market/catalog";
import type { Candle, MarketDataProvider, Quote } from "@/services/market/types";
import type { AssetClass } from "@prisma/client";

export type ScanDirection = "LONG" | "SHORT" | "NEUTRAL";
export type RiskLabel = "LOW" | "MEDIUM" | "HIGH";

export interface ScanResult {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  changePct24h: number;
  rsi: number | null;
  trend: Trend;
  direction: ScanDirection;
  setup: string;
  risk: RiskLabel;
  score: number; // AI Opportunity Score 0..100
  reasons: string[];
}

export interface ScanFilter {
  assetClass?: AssetClass;
  assetClasses?: AssetClass[]; // scan several classes at once (takes precedence over assetClass)
  minScore?: number;
  direction?: "LONG" | "SHORT" | "ANY";
}

/**
 * Rule-based opportunity scoring. Transparent and deterministic: the same
 * candles always give the same score, and every point is explained in `reasons`.
 * This is the engine the AI Copilot narrates — not a black box.
 */
export function scoreOpportunity(candles: Candle[], quote: Quote): ScanResult {
  const closes = candles.map((c) => c.close);
  const rsiVal = lastValid(rsi(closes, 14));
  const trend = detectTrend(closes);
  const ema20 = lastValid(ema(closes, 20));
  const ema50 = lastValid(ema(closes, 50));
  const { histogram } = macd(closes);
  const macdHist = lastValid(histogram);
  const { support, resistance } = supportResistance(candles, 60);
  const price = quote.price;

  const reasons: string[] = [];
  let bull = 0;
  let bear = 0;

  // Trend
  if (trend === "UP") {
    bull += 20;
    reasons.push("Uptrend: EMA20 above EMA50");
  } else if (trend === "DOWN") {
    bear += 20;
    reasons.push("Downtrend: EMA20 below EMA50");
  } else {
    reasons.push("Sideways / no clear trend");
  }

  // Price vs EMA20
  if (ema20 !== null) {
    if (price > ema20) {
      bull += 10;
      reasons.push("Price above EMA20 (momentum up)");
    } else {
      bear += 10;
      reasons.push("Price below EMA20 (momentum down)");
    }
  }

  // RSI
  if (rsiVal !== null) {
    if (rsiVal < 30) {
      bull += 18;
      reasons.push(`RSI ${rsiVal.toFixed(0)}: oversold (mean-reversion long)`);
    } else if (rsiVal > 70) {
      bear += 18;
      reasons.push(`RSI ${rsiVal.toFixed(0)}: overbought (mean-reversion short)`);
    } else if (rsiVal >= 50) {
      bull += 6;
      reasons.push(`RSI ${rsiVal.toFixed(0)}: bullish half`);
    } else {
      bear += 6;
      reasons.push(`RSI ${rsiVal.toFixed(0)}: bearish half`);
    }
  }

  // MACD histogram
  if (macdHist !== null) {
    if (macdHist > 0) {
      bull += 12;
      reasons.push("MACD histogram positive");
    } else {
      bear += 12;
      reasons.push("MACD histogram negative");
    }
  }

  // Proximity to support/resistance (breakout / bounce setups)
  const range = resistance - support || 1;
  const nearSupport = (price - support) / range < 0.15;
  const nearResistance = (resistance - price) / range < 0.15;
  let setup = "No clear setup";
  if (nearSupport && trend !== "DOWN") {
    bull += 10;
    setup = "Bounce off support";
    reasons.push("Price near recent support");
  } else if (nearResistance && trend === "UP") {
    bull += 8;
    setup = "Breakout attempt at resistance";
    reasons.push("Price testing recent resistance in an uptrend");
  } else if (nearResistance) {
    bear += 8;
    setup = "Rejection at resistance";
    reasons.push("Price near recent resistance");
  } else if (trend === "UP") {
    setup = "Trend continuation (long)";
  } else if (trend === "DOWN") {
    setup = "Trend continuation (short)";
  }

  const net = bull - bear;
  const direction: ScanDirection = net > 8 ? "LONG" : net < -8 ? "SHORT" : "NEUTRAL";
  // Map net conviction onto a 0..100 score centered at 50.
  const score = clamp(Math.round(50 + net * 0.8), 0, 100);

  // Risk from 24h volatility proxy.
  const vol = Math.abs(quote.changePct24h);
  const risk: RiskLabel = vol > 6 ? "HIGH" : vol > 2.5 ? "MEDIUM" : "LOW";

  return {
    symbol: quote.symbol,
    name: quote.symbol,
    assetClass: "CRYPTO",
    price: round(price, 6),
    changePct24h: quote.changePct24h,
    rsi: rsiVal !== null ? round(rsiVal, 1) : null,
    trend,
    direction,
    setup,
    risk,
    score,
    reasons,
  };
}

export async function scanMarket(
  provider: MarketDataProvider,
  filter: ScanFilter = {},
): Promise<ScanResult[]> {
  const classes = filter.assetClasses ?? (filter.assetClass ? [filter.assetClass] : null);
  const universe = classes
    ? CATALOG.filter((a) => classes.includes(a.assetClass))
    : CATALOG;

  // Fetch ALL quotes in one batched call (per source) rather than one getQuote
  // per asset — essential now that the universe spans dozens of forex pairs +
  // crypto. Symbols the live source can't serve (rate-limited, or a closed
  // weekend forex market) are simply absent from the map and skipped, never
  // scored on a fabricated price.
  const quotes = await provider.getQuotes(universe.map((a) => a.symbol)).catch(() => [] as Quote[]);
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

  const results = await Promise.all(
    universe.map(async (a) => {
      try {
        const quote = quoteBySymbol.get(a.symbol.toUpperCase());
        if (!quote) return null;
        const candles = await provider.getCandles(a.symbol, "1D", 200);
        if (!candles.length) return null;
        const r = scoreOpportunity(candles, quote);
        r.name = a.name;
        r.assetClass = a.assetClass;
        return r;
      } catch {
        return null;
      }
    }),
  );

  return results
    .filter((r): r is ScanResult => r != null)
    .filter((r) => r.score >= (filter.minScore ?? 0))
    .filter((r) =>
      !filter.direction || filter.direction === "ANY"
        ? true
        : r.direction === filter.direction,
    )
    .sort((a, b) => b.score - a.score);
}
