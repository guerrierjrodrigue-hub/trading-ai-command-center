import { authUserId, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { telegramConfigured } from "@/services/notify/telegram";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const setting = await prisma.setting.findUnique({ where: { userId: auth.userId } });
  return ok({
    configured: telegramConfigured(),
    connected: !!setting?.telegramChatId,
  });
}
