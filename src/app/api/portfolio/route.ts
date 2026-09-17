import { authUserId, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { loadPortfolioState } from "@/services/trading/state";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const state = await loadPortfolioState(auth.userId);
  const trades = await prisma.trade.findMany({
    where: { portfolioId: state.portfolioId },
    include: { asset: true },
    orderBy: { closedAt: "desc" },
    take: 50,
  });

  return ok({
    ...state,
    history: trades.map((t) => ({
      id: t.id,
      symbol: t.asset.symbol,
      side: t.side,
      quantity: t.quantity,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      pnl: t.pnl,
      pnlPct: t.pnlPct,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt.toISOString(),
    })),
  });
}
