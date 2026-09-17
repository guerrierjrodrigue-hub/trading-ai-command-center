import { fail, ok } from "@/lib/api";
import { getMarketDataProvider } from "@/services/market";
import { timeframeSchema } from "@/lib/validation";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return fail("symbol query param required");

  const tfRaw = searchParams.get("timeframe") ?? "1D";
  const tf = timeframeSchema.safeParse(tfRaw);
  if (!tf.success) return fail("invalid timeframe");

  const limit = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 1000);

  try {
    const provider = getMarketDataProvider();
    const candles = await provider.getCandles(symbol, tf.data, limit);
    return ok({ symbol, timeframe: tf.data, source: provider.source, candles });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
