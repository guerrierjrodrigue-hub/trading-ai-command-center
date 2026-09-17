import { prisma } from "@/lib/prisma";
import { sendTelegram, telegramConfigured } from "./telegram";

/** Escapes the few characters Telegram's HTML parse mode is picky about. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Best-effort push to a user's connected channels. Never throws — a failed
 * notification must never break a trading cycle. Currently: Telegram (if the
 * bot token is configured AND the user has connected their chat).
 */
export async function notifyUser(userId: string, text: string): Promise<void> {
  if (!telegramConfigured()) return;
  try {
    const setting = await prisma.setting.findUnique({ where: { userId } });
    if (!setting?.telegramChatId) return;
    await sendTelegram(setting.telegramChatId, escapeHtml(text));
  } catch {
    /* delivery is best-effort; ignore transient failures */
  }
}
