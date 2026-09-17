import { describe, expect, it } from "vitest";
import { FallbackMarketProvider } from "@/services/market/fallback-provider";
import type { Candle, MarketDataProvider, Quote } from "@/services/market/types";

function quote(symbol: string, price: number, source: "live" | "mock"): Quote {
  return { symbol, price, changePct24h: 0, high24h: price, low24h: price, volume24h: 0, source, timestamp: 0 };
}

/** A live provider that covers BTC/ETH but always FAILS (simulates a rate limit). */
const failingLive: MarketDataProvider = {
  source: "live",
  covers: (s) => ["BTC", "ETH"].includes(s.toUpperCase()),
  async getQuote() { throw new Error("429"); },
  async getQuotes() { throw new Error("429"); },
  async getCandles() { throw new Error("429"); },
};

/** A mock that always returns a (very different) simulated price. */
const mock: MarketDataProvider = {
  source: "mock",
  async getQuote(s) { return quote(s, 999, "mock"); },
  async getQuotes(syms) { return syms.map((s) => quote(s, 999, "mock")); },
  async getCandles(): Promise<Candle[]> { return [{ time: 1, open: 999, high: 999, low: 999, close: 999, volume: 0 }]; },
};

describe("FallbackMarketProvider — never mocks a covered symbol", () => {
  const p = new FallbackMarketProvider(failingLive, mock);

  it("throws instead of returning a mock price for a covered symbol", async () => {
    await expect(p.getQuote("BTC")).rejects.toThrow();
  });

  it("DOES fall back to mock for an uncovered symbol", async () => {
    const q = await p.getQuote("AAPL"); // not covered by the failing live source
    expect(q.source).toBe("mock");
    expect(q.price).toBe(999);
  });

  it("getQuotes omits covered-but-failed symbols (never mocks them)", async () => {
    const out = await p.getQuotes(["BTC", "ETH", "AAPL"]);
    const symbols = out.map((q) => q.symbol.toUpperCase());
    expect(symbols).not.toContain("BTC");
    expect(symbols).not.toContain("ETH");
    expect(symbols).toContain("AAPL"); // uncovered -> mock-filled
  });

  it("returns empty candles for a covered symbol instead of mock candles", async () => {
    expect(await p.getCandles("BTC", "1D")).toEqual([]);
    expect((await p.getCandles("AAPL", "1D")).length).toBeGreaterThan(0); // uncovered -> mock
  });
});
