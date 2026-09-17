import { fail, ok } from "@/lib/api";
import { getMarketDataProvider } from "@/services/market";
import { scanMarket } from "@/services/scanner/scanner";
import { scannerQuerySchema } from "@/lib/validation";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = scannerQuerySchema.safeParse({
    assetClass: searchParams.get("assetClass") ?? undefined,
    minScore: searchParams.get("minScore") ?? undefined,
    direction: searchParams.get("direction") ?? undefined,
  });
  if (!parsed.success) return fail("invalid query", 422, parsed.error.flatten());

  try {
    const provider = getMarketDataProvider();
    const results = await scanMarket(provider, parsed.data);
    return ok({ count: results.length, results });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
