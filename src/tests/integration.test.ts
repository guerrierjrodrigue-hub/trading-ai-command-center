import { describe, expect, it } from "vitest";
import { MockMarketDataProvider } from "@/services/market/mock-provider";
import { scanMarket, scoreOpportunity } from "@/services/scanner/scanner";
import { MockAIProvider } from "@/services/ai/mock-provider";
import { runBacktest } from "@/services/backtest/engine";

/**
 * End-to-end smoke test wiring the real pipeline together with the mock data
 * provider (no DB): market data -> scanner -> AI analysis -> backtest.
 * Proves the "brains" of the app produce coherent output as a system.
 */
describe("integration: market → scanner → AI → backtest", () => {
  const market = new MockMarketDataProvider();

  it("scans the whole universe and ranks by score", async () => {
    const results = await scanMarket(market, {});
    expect(results.length).toBeGreaterThan(5);
    // Sorted descending by score.
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
    // Every result carries an explanation.
    expect(results[0].reasons.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[0].score).toBeLessThanOrEqual(100);
  });

  it("produces a complete, safe AI analysis for BTC", async () => {
    const [quote, candles] = await Promise.all([
      market.getQuote("BTC"),
      market.getCandles("BTC", "1D", 200),
    ]);
    const ai = new MockAIProvider();
    const a = await ai.analyzeAsset({ symbol: "BTC", quote, candles });

    expect(a.type).toBe("scenario"); // never presented as a certainty
    expect(a.disclaimer.length).toBeGreaterThan(0);
    expect(a.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(a.confidenceScore).toBeLessThanOrEqual(100);
    expect(a.risks.length).toBeGreaterThan(0);
    expect(a.stopLoss).not.toBeNull();
    expect(a.takeProfit).not.toBeNull();
  });

  it("backtests a strategy on real (mock) candles with coherent metrics", async () => {
    const candles = await market.getCandles("ETH", "1D", 300);
    const res = runBacktest(candles, { strategy: "EMA_CROSS", startingCapital: 10000, feeBps: 10 });
    expect(Number.isFinite(res.metrics.finalEquity)).toBe(true);
    expect(res.metrics.finalEquity).toBeGreaterThan(0);
    expect(res.metrics.wins + res.metrics.losses).toBe(res.metrics.totalTrades);
    expect(res.equityCurve.length).toBe(candles.length);
  });

  it("scanner scoring is deterministic for identical input", async () => {
    const quote = await market.getQuote("SOL");
    const candles = await market.getCandles("SOL", "1D", 200);
    const a = scoreOpportunity(candles, quote);
    const b = scoreOpportunity(candles, quote);
    expect(a.score).toBe(b.score);
    expect(a.direction).toBe(b.direction);
  });
});
