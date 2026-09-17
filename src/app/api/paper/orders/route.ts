import { authUserId, fail, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { paperOrderSchema } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { getCatalogAsset } from "@/services/market/catalog";
import { loadPortfolioState } from "@/services/trading/state";
import { planOpen } from "@/services/trading/paper-engine";
import { feeFor } from "@/services/trading/pnl";
import {
  checkRiskLimits,
  computePositionSize,
} from "@/services/risk/position-sizing";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const portfolio = await prisma.portfolio.findFirst({ where: { userId: auth.userId } });
  if (!portfolio) return ok({ orders: [] });
  const orders = await prisma.order.findMany({
    where: { portfolioId: portfolio.id },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({
    orders: orders.map((o) => ({
      id: o.id,
      symbol: o.asset.symbol,
      side: o.side,
      type: o.type,
      status: o.status,
      quantity: o.quantity,
      price: o.price,
      fee: o.fee,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, paperOrderSchema);
  if ("response" in parsed) return parsed.response;
  const input = parsed.data;

  const setting = await prisma.setting.findUnique({ where: { userId: auth.userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;

  // Resolve/ensure the asset.
  const cat = getCatalogAsset(input.symbol);
  const asset = await prisma.asset.upsert({
    where: { symbol: cat?.symbol ?? input.symbol },
    update: {},
    create: {
      symbol: cat?.symbol ?? input.symbol,
      name: cat?.name ?? input.symbol,
      assetClass: cat?.assetClass ?? "CRYPTO",
      quoteCurrency: cat?.quoteCurrency ?? "USD",
      exchange: cat?.exchange,
    },
  });

  const provider = getMarketDataProvider();
  const quote = await provider.getQuote(asset.symbol);
  const fillPrice = quote.price;

  const state = await loadPortfolioState(auth.userId);

  // Determine quantity: explicit, or risk-based sizing.
  let quantity = input.quantity ?? 0;
  let sizing: ReturnType<typeof computePositionSize> | null = null;
  if (!quantity) {
    if (!input.stopLoss || !input.riskPct) {
      return fail(
        "Provide either `quantity`, or `stopLoss` + `riskPct` for risk-based sizing",
        422,
      );
    }
    const sizingEntry = input.entryPrice ?? fillPrice;
    try {
      sizing = computePositionSize({
        capital: state.metrics.equity,
        riskPct: input.riskPct,
        entry: sizingEntry,
        stop: input.stopLoss,
      });
    } catch (e) {
      return fail((e as Error).message, 422);
    }
    quantity = sizing.quantity;
  }
  if (quantity <= 0) return fail("Quantity resolves to 0", 422);

  const notional = quantity * fillPrice;

  // Risk-limit gate.
  const risk = checkRiskLimits(
    notional,
    {
      cash: state.metrics.cash,
      openPositions: state.metrics.openPositions,
      currentExposure: state.metrics.marketValue,
      capital: state.metrics.equity,
      realizedPnlToday: state.metrics.pnlToday,
    },
    {
      riskPerTradePct: setting?.riskPerTradePct ?? 1,
      maxDailyLossPct: setting?.maxDailyLossPct ?? 3,
      maxOpenPositions: setting?.maxOpenPositions ?? 5,
      maxPortfolioExposurePct: setting?.maxPortfolioExposurePct ?? 60,
    },
  );
  if (!risk.allowed) {
    return fail("Order blocked by risk limits", 422, { violations: risk.violations });
  }

  // Execute (simulated fill at market).
  const plan = planOpen({
    cash: state.metrics.cash,
    side: input.side,
    quantity,
    price: fillPrice,
    feeBps,
  });

  const position = await prisma.position.create({
    data: {
      portfolioId: state.portfolioId,
      assetId: asset.id,
      side: plan.direction,
      status: "OPEN",
      quantity: plan.quantity,
      entryPrice: plan.entryPrice,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      feesPaid: plan.fee,
    },
  });
  await prisma.order.create({
    data: {
      portfolioId: state.portfolioId,
      assetId: asset.id,
      positionId: position.id,
      side: input.side,
      type: "MARKET",
      status: "FILLED",
      quantity: plan.quantity,
      price: plan.entryPrice,
      fee: plan.fee,
      reason: input.reason,
    },
  });
  await prisma.portfolio.update({
    where: { id: state.portfolioId },
    data: { cash: plan.cashAfter },
  });

  return ok(
    {
      position: {
        id: position.id,
        symbol: asset.symbol,
        side: plan.direction,
        quantity: plan.quantity,
        entryPrice: plan.entryPrice,
        fee: plan.fee,
      },
      sizing,
      fillPrice,
      feePaid: plan.fee,
      cashAfter: plan.cashAfter,
    },
    { status: 201 },
  );
}
