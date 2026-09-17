import { fail, ok } from "@/lib/api";
import { getMarketDataProvider } from "@/services/market";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = getMarketDataProvider();

  const symbols = searchParams.get("symbols");
  const symbol = searchParams.get("symbol");

  try {
    if (symbols) {
      const list = symbols.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      return ok(await provider.getQuotes(list));
    }
    if (symbol) {
      return ok(await provider.getQuote(symbol));
    }
    return fail("symbol or symbols query param required");
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
