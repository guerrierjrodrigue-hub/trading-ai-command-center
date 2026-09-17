import { authUserId, fail, ok, parseBody, rateLimit } from "@/lib/api";
import { z } from "zod";
import { getMarketDataProvider } from "@/services/market";
import { getAIProvider } from "@/services/ai";

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

// Detects "analyse BTC" / "analyze btc" / "/analyze BTC" style commands.
const ANALYZE_RE = /^\/?(?:analyse|analyze)\s+([a-z0-9/]+)/i;

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`chat:${auth.userId}`, 40, 60_000)) {
    return fail("Rate limit reached, wait a moment", 429);
  }

  const parsed = await parseBody(req, chatSchema);
  if ("response" in parsed) return parsed.response;
  const message = parsed.data.message.trim();

  const ai = getAIProvider();
  const market = getMarketDataProvider();

  try {
    const m = message.match(ANALYZE_RE);
    if (m) {
      const symbol = m[1].toUpperCase();
      const [quote, candles] = await Promise.all([
        market.getQuote(symbol),
        market.getCandles(symbol, "1D", 200),
      ]);
      const analysis = await ai.analyzeAsset({ symbol, quote, candles });
      return ok({ type: "analysis", analysis });
    }
    const { text } = await ai.chat([{ role: "user", content: message }]);
    return ok({ type: "text", text });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
