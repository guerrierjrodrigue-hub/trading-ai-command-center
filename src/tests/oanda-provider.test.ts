import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { OandaProvider as OandaProviderType } from "@/services/market/oanda-provider";

/**
 * OANDA provider: symbol coverage, mid-price parsing, weekend/non-tradeable
 * handling (must NOT surface a price so covered symbols are never mocked), and
 * candle parsing. `fetch` is mocked; env is set before the module loads.
 */
function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

async function loadProvider(): Promise<OandaProviderType> {
  vi.resetModules();
  process.env.OANDA_API_TOKEN = "test-token";
  process.env.OANDA_ACCOUNT_ID = "101-000-0000000-001";
  process.env.OANDA_ENV = "practice";
  const mod = await import("@/services/market/oanda-provider");
  return new mod.OandaProvider();
}

describe("OandaProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("covers only the mapped forex/metal symbols", async () => {
    const p = await loadProvider();
    expect(p.covers("EUR/USD")).toBe(true);
    expect(p.covers("gbp/usd")).toBe(true); // case-insensitive
    expect(p.covers("XAU/USD")).toBe(true); // gold
    expect(p.covers("USD/JPY")).toBe(true);
    expect(p.covers("BTC")).toBe(false);
    expect(p.covers("AAPL")).toBe(false);
  });

  it("parses the mid price from closeout bid/ask", async () => {
    const p = await loadProvider();
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({
        prices: [
          { instrument: "EUR_USD", tradeable: true, closeoutBid: "1.1000", closeoutAsk: "1.1002" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const q = await p.getQuote("EUR/USD");
    expect(q.symbol).toBe("EUR/USD");
    expect(q.price).toBeCloseTo(1.1001, 6);
    expect(q.source).toBe("live");
    // Uses the practice host and the account id in the pricing path.
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("api-fxpractice.oanda.com");
    expect(url).toContain("/accounts/101-000-0000000-001/pricing");
    expect(url).toContain("EUR_USD");
  });

  it("omits a non-tradeable (weekend/closed) instrument instead of pricing it", async () => {
    const p = await loadProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          prices: [
            { instrument: "EUR_USD", tradeable: true, closeoutBid: "1.10", closeoutAsk: "1.10" },
            { instrument: "XAU_USD", tradeable: false, closeoutBid: "2600", closeoutAsk: "2601" },
          ],
        }),
      ),
    );
    const out = await p.getQuotes(["EUR/USD", "XAU/USD"]);
    const symbols = out.map((q) => q.symbol);
    expect(symbols).toContain("EUR/USD");
    expect(symbols).not.toContain("XAU/USD"); // closed market -> unavailable, never a stale price
  });

  it("getQuote throws when the market is closed (so a covered symbol is never mocked)", async () => {
    const p = await loadProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ prices: [{ instrument: "XAU_USD", tradeable: false }] }),
      ),
    );
    await expect(p.getQuote("XAU/USD")).rejects.toThrow();
  });

  it("parses candles oldest->newest with numeric OHLC", async () => {
    const p = await loadProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          candles: [
            { complete: true, volume: 10, time: "1700000000.000000000", mid: { o: "1.10", h: "1.12", l: "1.09", c: "1.11" } },
            { complete: true, volume: 12, time: "1700086400.000000000", mid: { o: "1.11", h: "1.13", l: "1.10", c: "1.125" } },
          ],
        }),
      ),
    );
    const candles = await p.getCandles("EUR/USD", "1D", 200);
    expect(candles.length).toBe(2);
    expect(candles[0].time).toBe(1700000000);
    expect(candles[0].close).toBeCloseTo(1.11, 6);
    expect(candles[1].high).toBeCloseTo(1.13, 6);
  });

  it("returns no quotes for symbols it does not map", async () => {
    const p = await loadProvider();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await p.getQuotes(["BTC", "AAPL"]);
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing mapped -> no API call
  });
});
