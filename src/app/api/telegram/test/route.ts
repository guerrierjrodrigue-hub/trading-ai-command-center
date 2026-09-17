import { authUserId, fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/services/notify/telegram";

export async function POST() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const setting = await prisma.setting.findUnique({ where: { userId: auth.userId } });
  if (!setting?.telegramChatId) return fail("Telegram non connecté", 400);
  try {
    await sendTelegram(
      setting.telegramChatId,
      "🔔 Message de test — les notifications Telegram fonctionnent. (Ceci est un scénario de simulation, pas un conseil financier.)",
    );
    return ok({ sent: true });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
