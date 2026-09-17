import { authUserId, fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { detectChatId, sendTelegram, telegramConfigured } from "@/services/notify/telegram";

export async function POST() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  if (!telegramConfigured()) return fail("Bot Telegram non configuré (TELEGRAM_BOT_TOKEN)", 400);

  try {
    const chatId = await detectChatId();
    if (!chatId) {
      return fail(
        "Aucun message détecté. Ouvre ton bot dans Telegram et envoie /start, puis réessaie.",
        404,
      );
    }
    await prisma.setting.upsert({
      where: { userId: auth.userId },
      update: { telegramChatId: chatId },
      create: { userId: auth.userId, telegramChatId: chatId },
    });
    await sendTelegram(
      chatId,
      "✅ <b>Trading AI Command Center</b> connecté. Tu recevras ici tes alertes.",
    );
    return ok({ connected: true });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
