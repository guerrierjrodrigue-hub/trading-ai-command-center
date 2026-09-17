import { prisma } from "@/lib/prisma";
import { round } from "@/lib/utils";

/**
 * Performance feedback loop. The bot tags each entry order with the strategy
 * that opened it ("BOT:<STRATEGY>"). Here we read closed trades, attribute them
 * back to their strategy, and compute per-strategy expectancy. Strategies that
 * are demonstrably losing (negative expectancy over a minimum sample) are then
 * EXCLUDED from the autonomous selector — the bot stops using what doesn't work
 * for this user, and keeps what does.
 */

/** Minimum closed trades before we judge (and possibly disable) a strategy. */
export const MIN_TRADES_FOR_JUDGMENT = 8;

export interface StrategyStat {
  strategy: string;
  trades: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  expectancy: number; // average P&L per trade
  disabled: boolean; // excluded from AUTO selection right now
}

/** Parses the strategy name from an entry order reason like "BOT:FIB_CONFLUENCE". */
export function parseStrategy(reason: string | null | undefined): string {
  if (!reason) return "UNKNOWN";
  const m = /BOT:([A-Z_]+)/.exec(reason);
  return m ? m[1] : "UNKNOWN";
}

/** Per-strategy stats over the portfolio's closed BOT trades. */
export async function strategyStats(portfolioId: string): Promise<StrategyStat[]> {
  const trades = await prisma.trade.findMany({
    where: { portfolioId },
    include: { position: { include: { orders: true } } },
  });

  const agg = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of trades) {
    if (t.position?.openedBy !== "BOT") continue;
    const buy = t.position.orders.find((o) => o.side === "BUY");
    const strat = parseStrategy(buy?.reason);
    if (strat === "UNKNOWN") continue;
    const a = agg.get(strat) ?? { trades: 0, wins: 0, pnl: 0 };
    a.trades += 1;
    if (t.pnl > 0) a.wins += 1;
    a.pnl += t.pnl;
    agg.set(strat, a);
  }

  return [...agg.entries()]
    .map(([strategy, a]) => {
      const expectancy = a.trades ? a.pnl / a.trades : 0;
      return {
        strategy,
        trades: a.trades,
        wins: a.wins,
        winRate: a.trades ? round((a.wins / a.trades) * 100, 1) : 0,
        totalPnl: round(a.pnl, 2),
        expectancy: round(expectancy, 2),
        disabled: a.trades >= MIN_TRADES_FOR_JUDGMENT && expectancy < 0,
      };
    })
    .sort((x, y) => y.expectancy - x.expectancy);
}

/** The set of strategy names the bot should currently AVOID (negative expectancy). */
export async function excludedStrategies(portfolioId: string): Promise<Set<string>> {
  const stats = await strategyStats(portfolioId);
  return new Set(stats.filter((s) => s.disabled).map((s) => s.strategy));
}
