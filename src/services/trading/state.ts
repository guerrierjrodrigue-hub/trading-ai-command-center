import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getMarketDataProvider } from "@/services/market";
import { unrealizedPnl } from "./pnl";
import { computePortfolioMetrics, type PortfolioMetrics } from "./portfolio";
import type { Direction } from "@/services/risk/position-sizing";

export interface OpenPositionView {
  id: string;
  symbol: string;
  name: string;
  side: Direction;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  notional: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
}

export interface PortfolioState {
  portfolioId: string;
  currency: string;
  metrics: PortfolioMetrics;
  positions: OpenPositionView[];
  feeBps: number;
}

/** Loads (or lazily creates) the user's paper portfolio and computes live metrics. */
export async function loadPortfolioState(userId: string): Promise<PortfolioState> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;

  let portfolio = await prisma.portfolio.findFirst({ where: { userId } });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: "Paper Portfolio",
        startingCapital: setting?.startingCapital ?? env.paper.startingCapital,
        cash: setting?.startingCapital ?? env.paper.startingCapital,
      },
    });
  }

  const [openPositions, trades] = await Promise.all([
    prisma.position.findMany({
      where: { portfolioId: portfolio.id, status: "OPEN" },
      include: { asset: true },
      orderBy: { openedAt: "desc" },
    }),
    prisma.trade.findMany({ where: { portfolioId: portfolio.id } }),
  ]);

  const provider = getMarketDataProvider();
  const quotes = await Promise.all(
    openPositions.map((p) => provider.getQuote(p.asset.symbol).catch(() => null)),
  );

  const positions: OpenPositionView[] = openPositions.map((p, i) => {
    // If a real price is temporarily unavailable, value the position at its
    // ENTRY price (unrealized P&L 0) — never substitute a mock price, which
    // would show a wildly wrong P&L and could corrupt decisions.
    const currentPrice = quotes[i]?.price ?? p.entryPrice;
    const { pnl, pnlPct } = unrealizedPnl(
      p.side as Direction,
      p.entryPrice,
      p.quantity,
      currentPrice,
    );
    return {
      id: p.id,
      symbol: p.asset.symbol,
      name: p.asset.name,
      side: p.side as Direction,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      currentPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      notional: p.entryPrice * p.quantity,
      unrealizedPnl: pnl,
      unrealizedPnlPct: pnlPct,
      openedAt: p.openedAt.toISOString(),
    };
  });

  const metrics = computePortfolioMetrics({
    startingCapital: portfolio.startingCapital,
    cash: portfolio.cash,
    positions: positions.map((p) => ({
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
    })),
    trades: trades.map((t) => ({ pnl: t.pnl, closedAt: t.closedAt })),
  });

  return {
    portfolioId: portfolio.id,
    currency: portfolio.currency,
    metrics,
    positions,
    feeBps,
  };
}
