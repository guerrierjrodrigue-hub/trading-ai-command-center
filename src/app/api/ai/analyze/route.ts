import { authUserId, fail, ok, parseBody, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { aiAnalyzeSchema } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { getAIProvider } from "@/services/ai";

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`ai:${auth.userId}`, 30, 60_000)) {
    return fail("AI rate limit reached, wait a moment", 429);
  }

  const parsed = await parseBody(req, aiAnalyzeSchema);
  if ("response" in parsed) return parsed.response;
  const { kind, symbol, symbols } = parsed.data;

  const ai = getAIProvider();
  const market = getMarketDataProvider();

  try {
    if (kind === "JOURNAL") {
      const entries = await prisma.journalEntry.findMany({
        where: { userId: auth.userId },
        orderBy: { tradedAt: "desc" },
        take: 100,
      });
      const insight = await ai.analyzeJournal(entries as unknown as Record<string, unknown>[]);
      await prisma.aiAnalysis.create({
        data: {
          userId: auth.userId,
          kind: "JOURNAL",
          provider: ai.name,
          prompt: `journal:${entries.length} entries`,
          response: insight as unknown as object,
          confidenceScore: null,
        },
      });
      return ok(insight);
    }

    if (kind === "COMPARE") {
      const list = (symbols ?? []).slice(0, 5);
      if (list.length < 2) return fail("Provide at least 2 symbols to compare", 422);
      const analyses = await Promise.all(
        list.map(async (s) => {
          const [quote, candles] = await Promise.all([
            market.getQuote(s),
            market.getCandles(s, "1D", 200),
          ]);
          return ai.analyzeAsset({ symbol: s, quote, candles });
        }),
      );
      return ok({ kind: "COMPARE", analyses });
    }

    // Default: ANALYZE a single asset.
    if (!symbol) return fail("symbol is required", 422);
    const [quote, candles] = await Promise.all([
      market.getQuote(symbol),
      market.getCandles(symbol, "1D", 200),
    ]);
    const analysis = await ai.analyzeAsset({ symbol, quote, candles });
    await prisma.aiAnalysis.create({
      data: {
        userId: auth.userId,
        kind: "ANALYZE",
        symbol,
        provider: ai.name,
        prompt: `analyze:${symbol}`,
        response: analysis as unknown as object,
        confidenceScore: analysis.confidenceScore,
      },
    });
    return ok(analysis);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
