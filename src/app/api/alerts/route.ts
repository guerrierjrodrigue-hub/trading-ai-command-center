import { authUserId, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { alertCreateSchema } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { lastValid, rsi } from "@/services/market/indicators";
import { sendTelegram } from "@/services/notify/telegram";

const OP_TEXT: Record<string, string> = { GT: ">", LT: "<", CROSS_ABOVE: "↑", CROSS_BELOW: "↓" };

async function currentMetric(symbol: string, metric: string): Promise<number | null> {
  const provider = getMarketDataProvider();
  if (metric === "PRICE") return (await provider.getQuote(symbol)).price;
  if (metric === "VOLUME") return (await provider.getQuote(symbol)).volume24h;
  if (metric === "RSI") {
    const candles = await provider.getCandles(symbol, "1D", 120);
    return lastValid(rsi(candles.map((c) => c.close), 14));
  }
  return null; // AI_SCORE / EMA_CROSS evaluated elsewhere (phase 2)
}

function conditionMet(op: string, value: number, threshold: number): boolean {
  switch (op) {
    case "GT":
    case "CROSS_ABOVE":
      return value > threshold;
    case "LT":
    case "CROSS_BELOW":
      return value < threshold;
    default:
      return false;
  }
}

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const [alerts, setting] = await Promise.all([
    prisma.alert.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: "desc" } }),
    prisma.setting.findUnique({ where: { userId: auth.userId } }),
  ]);
  const chatId = setting?.telegramChatId ?? null;

  // Evaluate ACTIVE alerts against current market data.
  const evaluated = await Promise.all(
    alerts.map(async (a) => {
      let currentValue: number | null = null;
      if (a.status === "ACTIVE") {
        currentValue = await currentMetric(a.symbol, a.metric).catch(() => null);
        if (currentValue !== null && conditionMet(a.operator, currentValue, a.threshold)) {
          await prisma.alert.update({
            where: { id: a.id },
            data: { status: "TRIGGERED", lastTriggeredAt: new Date() },
          });
          // Deliver to Telegram if connected (best-effort — never fails the request).
          if (chatId && (a.channels.length === 0 || a.channels.includes("telegram"))) {
            void sendTelegram(
              chatId,
              `🔔 <b>Alerte ${a.symbol}</b>\n${a.metric} ${OP_TEXT[a.operator] ?? a.operator} ${a.threshold} — valeur actuelle ${currentValue.toFixed(2)}.\n\n<i>Scénario de simulation, pas un conseil financier.</i>`,
            ).catch(() => {});
          }
          return { ...a, status: "TRIGGERED", currentValue };
        }
      }
      return { ...a, currentValue };
    }),
  );

  return ok({ alerts: evaluated });
}

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, alertCreateSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;

  const alert = await prisma.alert.create({
    data: {
      userId: auth.userId,
      symbol: d.symbol.toUpperCase(),
      metric: d.metric,
      operator: d.operator,
      threshold: d.threshold,
      channels: d.channels,
      note: d.note,
    },
  });
  return ok(alert, { status: 201 });
}
