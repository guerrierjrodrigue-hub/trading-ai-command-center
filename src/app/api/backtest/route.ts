import { authUserId, fail, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { backtestRunSchema } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { OandaProvider } from "@/services/market/oanda-provider";
import { runSplitBacktest } from "@/services/backtest/engine";
import type { Candle } from "@/services/market/types";

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
    // Deep history for forex/gold (OANDA): page past OANDA's 5000-candle
    // per-request cap so slow strategies (e.g. V2-H4 Or, H4 Donchian) get
    // enough history to have a meaningful number of trades. Other asset
    // classes keep their existing single-request behavior, clamped to the
    // limit they already supported (1000), unchanged.
    const oanda = new OandaProvider();
    let candles: Candle[];
    if (oanda.covers(d.symbol) && env.oanda.apiToken && env.oanda.accountId) {
      candles = await oanda.fetchCandlesPaginated(d.symbol, d.timeframe, d.limit);
    } else {
      const provider = getMarketDataProvider();
      candles = await provider.getCandles(d.symbol, d.timeframe, Math.min(d.limit, 1000));
    }
    if (candles.length < 30) return fail("Not enough candles to backtest", 422);

    // Split backtest (Phase 2B): full period + in-sample/out-of-sample halves,
    // plus a bootstrap confidence interval on the full period's expectancy.
    // `result` keeps the exact same top-level shape (strategy/metrics/trades/
    // equityCurve) any existing caller reads — inSample/outOfSample/splitRatio
    // are additive.
    const result = runSplitBacktest(candles, {
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
