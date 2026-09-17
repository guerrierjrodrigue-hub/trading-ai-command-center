import { env } from "@/lib/env";

/**
 * Telegram delivery. The bot token is read server-side only (never exposed to
 * the client). To send to a person, we need their chat id, obtained after they
 * send /start to the bot (see detectChatId).
 */
const API = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return !!env.telegram.botToken;
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = env.telegram.botToken;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN non configuré");
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

/**
 * Reads recent updates and returns the most recent chat id that messaged the
 * bot. Returns null if the user hasn't sent anything yet (they must /start).
 */
export async function detectChatId(): Promise<string | null> {
  const token = env.telegram.botToken;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN non configuré");
  const res = await fetch(`${API}/bot${token}/getUpdates`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
  const data = (await res.json()) as any;
  const updates: any[] = data.result ?? [];
  for (let i = updates.length - 1; i >= 0; i--) {
    const chat = updates[i]?.message?.chat ?? updates[i]?.edited_message?.chat;
    if (chat?.id) return String(chat.id);
  }
  return null;
}
