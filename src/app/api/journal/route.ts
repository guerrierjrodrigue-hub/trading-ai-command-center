import { authUserId, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { journalCreateSchema } from "@/lib/validation";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const entries = await prisma.journalEntry.findMany({
    where: { userId: auth.userId },
    orderBy: { tradedAt: "desc" },
    take: 100,
  });
  return ok({ entries });
}

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, journalCreateSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;

  const entry = await prisma.journalEntry.create({
    data: {
      userId: auth.userId,
      symbol: d.symbol,
      strategy: d.strategy,
      side: d.side,
      entryPrice: d.entryPrice,
      stopLoss: d.stopLoss,
      takeProfit: d.takeProfit,
      exitPrice: d.exitPrice,
      result: d.result,
      pnl: d.pnl,
      emotion: d.emotion,
      reason: d.reason,
      notes: d.notes,
      tradedAt: d.tradedAt ? new Date(d.tradedAt) : new Date(),
    },
  });
  return ok(entry, { status: 201 });
}
