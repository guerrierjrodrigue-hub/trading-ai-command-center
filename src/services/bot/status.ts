import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { loadPortfolioState } from "@/services/trading/state";
import { OandaProvider } from "@/services/market/oanda-provider";
import {
  RISK_PROFILES,
  DEFAULT_MAX_DRAWDOWN_PCT,
  DEFAULT_MAX_WEEKLY_LOSS_PCT,
  DEFAULT_MAX_CONSECUTIVE_LOSSES,
  type RiskProfileName,
} from "./auto";

/**
 * The autonomous bot has GLOBAL "brakes" that stop ALL new entries for a cycle,
 * independently of whether a given asset looks ready in the live-analysis panel.
 * The panel used to ignore them, so it could show several "prêt à rentrer" rows
 * while the bot opened nothing — confusing. This computes those global gates
 * with the SAME logic the runner uses, so the UI can state plainly whether the
 * bot can currently open a position and, if not, why.
 */
export interface BotGateStatus {
  enabled: boolean;
  mode: string;
  running: boolean; // enabled AND actively cycling (a recent lastRunAt)
  lastRunAt: string | null;
  canOpen: boolean; // could the bot open a NEW position right now?
  blockReason: string | null; // plain-French reason when canOpen is false
  openPositions: number;
  maxOpenPositions: number;
  drawdownPct: number;
  maxDrawdownPct: number;
  weeklyLossPct: number;
  maxWeeklyLossPct: number;
  lossStreak: number;
  maxConsecutiveLosses: number;
  dailyLossPct: number;
  maxDailyLossPct: number;
  forexMarketOpen: boolean | null; // forex/metals session (null = unknown); crypto is 24/7
}

export async function botGateStatus(userId: string): Promise<BotGateStatus> {
  const cfg = await prisma.botConfig.findUnique({ where: { userId } });
  const setting = await prisma.setting.findUnique({ where: { userId } });
  const state = await loadPortfolioState(userId);
  const equity = state.metrics.equity;

  const isAuto = (cfg?.mode ?? "AUTO") === "AUTO";
  const profile = RISK_PROFILES[(cfg?.riskProfile as RiskProfileName) ?? "BALANCED"] ?? RISK_PROFILES.BALANCED;
  const maxOpenPositions = isAuto ? profile.maxOpenPositions : cfg?.maxOpenPositions ?? 4;
  const maxDrawdownPct = isAuto ? profile.maxDrawdownPct : DEFAULT_MAX_DRAWDOWN_PCT;
  const maxWeeklyLossPct = isAuto ? profile.maxWeeklyLossPct : DEFAULT_MAX_WEEKLY_LOSS_PCT;
  const maxConsecutiveLosses = isAuto ? profile.maxConsecutiveLosses : DEFAULT_MAX_CONSECUTIVE_LOSSES;
  const maxDailyLossPct = setting?.maxDailyLossPct ?? 3;

  // Same risk-hardening signals the runner computes.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [weekTrades, recentTrades, openPositions] = await Promise.all([
    prisma.trade.findMany({ where: { portfolioId: state.portfolioId, closedAt: { gte: weekAgo } }, select: { pnl: true } }),
    prisma.trade.findMany({ where: { portfolioId: state.portfolioId }, orderBy: { closedAt: "desc" }, take: 20, select: { pnl: true } }),
    prisma.position.count({ where: { portfolioId: state.portfolioId, status: "OPEN", openedBy: "BOT" } }),
  ]);
  const weeklyPnl = weekTrades.reduce((s, t) => s + t.pnl, 0);
  const weeklyLossPct = equity > 0 ? (-weeklyPnl / equity) * 100 : 0;
  let lossStreak = 0;
  for (const t of recentTrades) {
    if (t.pnl <= 0) lossStreak++;
    else break;
  }
  const drawdownPct = state.metrics.currentDrawdownPct;
  const dailyLossPct = equity > 0 ? (-state.metrics.pnlToday / equity) * 100 : 0;
  const marketStatus = await new OandaProvider().marketStatus();
  const forexMarketOpen = marketStatus === "unknown" ? null : marketStatus === "open";

  // Determine the global gate, in the same order the runner applies it.
  let blockReason: string | null = null;
  if (!cfg?.enabled) {
    blockReason = "Le robot est arrêté — clique sur « Démarrer » pour qu'il trade.";
  } else if (drawdownPct >= maxDrawdownPct) {
    blockReason = `Coupe-circuit : perte depuis le sommet ${drawdownPct.toFixed(1)}% ≥ limite ${maxDrawdownPct}% (le robot s'est mis en sécurité).`;
  } else if (weeklyLossPct >= maxWeeklyLossPct) {
    blockReason = `Limite de perte hebdomadaire atteinte (${weeklyLossPct.toFixed(1)}% ≥ ${maxWeeklyLossPct}%) — pause des entrées jusqu'à ce que la semaine glissante repasse sous la limite.`;
  } else if (lossStreak >= maxConsecutiveLosses) {
    blockReason = `Série de ${lossStreak} pertes consécutives — pause anti-revenge (limite ${maxConsecutiveLosses}). Une prochaine clôture gagnante relâche le frein.`;
  } else if (dailyLossPct >= maxDailyLossPct) {
    blockReason = `Limite de perte quotidienne atteinte (${dailyLossPct.toFixed(1)}% ≥ ${maxDailyLossPct}%) — reprise demain.`;
  } else if (openPositions >= maxOpenPositions) {
    blockReason = `Nombre maximum de positions atteint (${openPositions}/${maxOpenPositions}) — le robot rouvrira quand une position se ferme.`;
  }

  // "Running" = enabled and has cycled within the last 15 min (scheduler alive).
  const lastRun = cfg?.lastRunAt ?? null;
  const running = Boolean(cfg?.enabled) && lastRun != null && Date.now() - lastRun.getTime() < 15 * 60 * 1000;

  return {
    enabled: Boolean(cfg?.enabled),
    mode: cfg?.mode ?? "AUTO",
    running,
    lastRunAt: lastRun ? lastRun.toISOString() : null,
    canOpen: blockReason == null,
    blockReason,
    openPositions,
    maxOpenPositions,
    drawdownPct: Math.round(drawdownPct * 10) / 10,
    maxDrawdownPct,
    weeklyLossPct: Math.round(weeklyLossPct * 10) / 10,
    maxWeeklyLossPct,
    lossStreak,
    maxConsecutiveLosses,
    dailyLossPct: Math.round(dailyLossPct * 10) / 10,
    maxDailyLossPct,
    forexMarketOpen,
  };
}
