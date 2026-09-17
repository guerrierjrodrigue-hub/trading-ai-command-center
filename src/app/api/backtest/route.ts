import { authUserId, fail, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { backtestRunSchema } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { runBacktest } from "@/services/backtest/engine";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const backtests = await prisma.backtest.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok({ backtests });
}

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, backtestRunSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;

  const setting = await prisma.setting.findUnique({ where: { userId: auth.userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;

  try {
    const provider = getMarketDataProvider();
    const candles = await provider.getCandles(d.symbol, d.timeframe, d.limit);
    if (candles.length < 30) return fail("Not enough candles to backtest", 422);

    const result = runBacktest(candles, {
      strategy: d.strategy,
      startingCapital: d.startingCapital,
      feeBps,
      fast: d.fast,
      slow: d.slow,
      rsiPeriod: d.rsiPeriod,
      oversold: d.oversold,
      overbought: d.overbought,
      lookback: d.lookback,
      smaPeriod: d.smaPeriod,
    });

    // Persist a compact record (metrics + trade count), not the full curve.
    await prisma.backtest.create({
      data: {
        userId: auth.userId,
        symbol: d.symbol,
        timeframe: d.timeframe,
        startDate: new Date(candles[0].time * 1000),
        endDate: new Date(candles[candles.length - 1].time * 1000),
        startingCapital: d.startingCapital,
        result: {
          strategy: result.strategy,
          metrics: result.metrics,
          tradeCount: result.trades.length,
        } as unknown as object,
      },
    });

    return ok(result);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
