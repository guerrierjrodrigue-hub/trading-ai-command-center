import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { runBotCycle } from "./runner";
import { buildMarketBrief, formatBriefForTelegram } from "@/services/brief/market-brief";
import { notifyUser } from "@/services/notify/notify";
import { telegramConfigured } from "@/services/notify/telegram";
import { OandaProvider } from "@/services/market/oanda-provider";

const g = globalThis as unknown as {
  __botSchedulerStarted?: boolean;
  __briefSentOn?: Map<string, string>; // userId -> YYYY-MM-DD last pushed
  __forexMarketOpen?: boolean; // last known forex/metals session state
};

/**
 * Watches the forex/metals market session (via OANDA's live `tradeable` flag)
 * and, on a transition, notifies every user (Telegram + journal) that the market
 * just OPENED or CLOSED. Crypto trades 24/7, so this only concerns forex + gold.
 * The first successful reading after a server start sets a silent baseline (no
 * message), and "unknown" readings (errors) are ignored — so a transient failure
 * never triggers a false announcement.
 */
async function checkMarketSession(): Promise<void> {
  const status = await new OandaProvider().marketStatus();
  if (status === "unknown") return;
  const open = status === "open";
  if (g.__forexMarketOpen === undefined) {
    g.__forexMarketOpen = open; // baseline — don't announce the state at startup
    return;
  }
  if (g.__forexMarketOpen === open) return; // no change
  g.__forexMarketOpen = open;

  const msg = open
    ? "🟢 Marché forex / or OUVERT — le robot peut de nouveau prendre des positions sur les devises et l'or."
    : "🔴 Marché forex / or FERMÉ (week-end) — le robot ne tradera que le crypto jusqu'à la réouverture.";
  const settings = await prisma.setting.findMany({ select: { userId: true } });
  for (const s of settings) {
    await notifyUser(s.userId, msg).catch(() => {});
    await prisma.botLog.create({ data: { userId: s.userId, action: "INFO", message: msg } }).catch(() => {});
  }
}

/** UTC hour at which the daily brief is pushed to Telegram. */
const BRIEF_UTC_HOUR = 12;

/** Pushes the daily market brief to every Telegram-connected user, once per UTC day. */
async function pushDailyBriefs(): Promise<void> {
  if (!telegramConfigured()) return;
  const now = new Date();
  if (now.getUTCHours() < BRIEF_UTC_HOUR) return;
  const today = now.toISOString().slice(0, 10);
  g.__briefSentOn ??= new Map();

  const settings = await prisma.setting.findMany({ where: { NOT: { telegramChatId: null } } });
  for (const s of settings) {
    if (g.__briefSentOn.get(s.userId) === today) continue;
    try {
      const brief = await buildMarketBrief(s.userId);
      await notifyUser(s.userId, formatBriefForTelegram(brief));
      g.__briefSentOn.set(s.userId, today);
    } catch {
      /* try again next tick */
    }
  }
}

/**
 * In-process autonomous scheduler. Started once from instrumentation.ts when
 * the Node server boots. Every tick it (1) runs any "due" enabled bot cycle and
 * (2) pushes the once-daily market brief. PAPER only.
 */
export function startBotScheduler(): void {
  if (g.__botSchedulerStarted) return;
  g.__botSchedulerStarted = true;

  const tickMs = Math.max(30, env.bot.tickSeconds) * 1000;
  // eslint-disable-next-line no-console
  console.log(`[bot] Auto-pilot scheduler started (tick ${tickMs / 1000}s)`);

  setInterval(async () => {
    try {
      const configs = await prisma.botConfig.findMany({ where: { enabled: true } });
      const now = Date.now();
      for (const c of configs) {
        const due = !c.lastRunAt || now - new Date(c.lastRunAt).getTime() >= c.intervalMinutes * 60_000;
        if (!due) continue;
        try {
          await runBotCycle(c.userId);
        } catch (e) {
          await prisma.botLog
            .create({ data: { userId: c.userId, action: "ERROR", message: `Cycle échoué : ${(e as Error).message}` } })
            .catch(() => {});
        }
      }
    } catch {
      /* transient DB/network error — ignore this tick */
    }

    try {
      await pushDailyBriefs();
    } catch {
      /* ignore */
    }

    try {
      await checkMarketSession();
    } catch {
      /* ignore — a transient failure never announces a false transition */
    }
  }, tickMs);
}
