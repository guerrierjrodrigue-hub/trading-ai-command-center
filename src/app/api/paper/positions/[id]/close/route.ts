import { authUserId, fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getMarketDataProvider } from "@/services/market";
import { planClose } from "@/services/trading/paper-engine";
import type { Direction } from "@/services/risk/position-sizing";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const position = await prisma.position.findUnique({
    where: { id: params.id },
    include: { asset: true, portfolio: true },
  });
  if (!position || position.portfolio.userId !== auth.userId) {
    return fail("Position not found", 404);
  }
  if (position.status === "CLOSED") return fail("Position already closed", 409);

  const setting = await prisma.setting.findUnique({ where: { userId: auth.userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;

  const provider = getMarketDataProvider();
  const quote = await provider.getQuote(position.asset.symbol);
  const exitPrice = quote.price;

  const plan = planClose({
    cash: position.portfolio.cash,
    side: position.side as Direction,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    exitPrice,
    feeBps,
  });

  const [closed] = await prisma.$transaction([
    prisma.position.update({
      where: { id: position.id },
      data: {
        status: "CLOSED",
        exitPrice,
        realizedPnl: plan.pnl,
        feesPaid: position.feesPaid + plan.fee,
        closedAt: new Date(),
      },
    }),
    prisma.order.create({
      data: {
        portfolioId: position.portfolioId,
        assetId: position.assetId,
        positionId: position.id,
        side: position.side === "LONG" ? "SELL" : "BUY",
        type: "MARKET",
        status: "FILLED",
        quantity: position.quantity,
        price: exitPrice,
        fee: plan.fee,
        reason: "Close position",
      },
    }),
    prisma.trade.create({
      data: {
        portfolioId: position.portfolioId,
        assetId: position.assetId,
        positionId: position.id,
        side: position.side,
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        exitPrice,
        fees: position.feesPaid + plan.fee,
        pnl: plan.pnl,
        pnlPct: plan.pnlPct,
        openedAt: position.openedAt,
      },
    }),
    prisma.portfolio.update({
      where: { id: position.portfolioId },
      data: { cash: plan.cashAfter },
    }),
  ]);

  return ok({
    closed: closed.id,
    exitPrice,
    realizedPnl: plan.pnl,
    pnlPct: plan.pnlPct,
    fee: plan.fee,
    cashAfter: plan.cashAfter,
  });
}
