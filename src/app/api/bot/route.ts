import { authUserId, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { botConfigSchema } from "@/lib/validation";
import { RISK_PROFILES } from "@/services/bot/auto";
import { strategyStats, excludedStrategies } from "@/services/bot/feedback";
import { botInsight, type BotInsightRow } from "@/services/bot/insight";
import { botGateStatus } from "@/services/bot/status";
import { getMarketDataProvider } from "@/services/market";
import { unrealizedPnl } from "@/services/trading/pnl";
import type { Direction } from "@/services/risk/position-sizing";

async function ensureConfig(userId: string) {
  const existing = await prisma.botConfig.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.botConfig.create({ data: { userId } });
}

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const config = await ensureConfig(auth.userId);
  const [logs, portfolio] = await Promise.all([
    prisma.botLog.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.portfolio.findFirst({ where: { userId: auth.userId } }),
  ]);
  const positions = portfolio
    ? await prisma.position.findMany({
        where: { portfolioId: portfolio.id, status: "OPEN", openedBy: "BOT" },
        include: { asset: true },
        orderBy: { openedAt: "desc" },
      })
    : [];
  const strategies = portfolio ? await strategyStats(portfolio.id) : [];

  const provider = getMarketDataProvider();
  const heldSymbols = new Set(positions.map((p) => p.asset.symbol));

  // Global bot "brakes" (drawdown, weekly loss, loss streak, max positions,
  // enabled/running) + the strategies paused for negative expectancy. The panel
  // must reflect these or it shows "prêt" while the bot opens nothing.
  const [status, excluded] = await Promise.all([
    botGateStatus(auth.userId),
    portfolio ? excludedStrategies(portfolio.id) : Promise.resolve(new Set<string>()),
  ]);

  // Live per-asset explanation of what the bot sees and why it enters or not.
  let insight: BotInsightRow[] = [];
  try {
    insight = await botInsight(provider, config.riskProfile, heldSymbols, excluded);
  } catch {
    insight = [];
  }

  // Current price + unrealized P&L per bot position (so the user sees direction
  // and how each trade is doing right now).
  const priceBySymbol = new Map<string, number>();
  await Promise.all(
    [...heldSymbols].map(async (sym) => {
      const q = await provider.getQuote(sym).catch(() => null);
      if (q) priceBySymbol.set(sym, q.price);
    }),
  );

  return ok({
    config,
    profiles: RISK_PROFILES,
    status,
    logs,
    strategies,
    insight,
    positions: positions.map((p) => {
      const current = priceBySymbol.get(p.asset.symbol) ?? null;
      const up = current != null ? unrealizedPnl(p.side as Direction, p.entryPrice, p.quantity, current) : null;
      return {
        id: p.id,
        symbol: p.asset.symbol,
        side: p.side,
        quantity: p.quantity,
        entryPrice: p.entryPrice,
        currentPrice: current,
        unrealizedPnl: up?.pnl ?? null,
        unrealizedPnlPct: up?.pnlPct ?? null,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        openedAt: p.openedAt.toISOString(),
      };
    }),
  });
}

export async function PATCH(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, botConfigSchema);
  if ("response" in parsed) return parsed.response;
  await ensureConfig(auth.userId);
  const config = await prisma.botConfig.update({
    where: { userId: auth.userId },
    data: {
      ...parsed.data,
      symbols: parsed.data.symbols
        ? parsed.data.symbols.map((s) => s.toUpperCase())
        : undefined,
    },
  });
  return ok({ config });
}
