import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { round, formatCurrency } from "@/lib/utils";
import type { Timeframe } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { getCatalogAsset } from "@/services/market/catalog";
import { isUptrend } from "@/services/market/indicators";
import { loadPortfolioState } from "@/services/trading/state";
import { planClose, planOpen } from "@/services/trading/paper-engine";
import { computePositionSize, fitQuantityToAccount } from "@/services/risk/position-sizing";
import { notifyUser } from "@/services/notify/notify";
import { longSignal, type BotStrategy } from "./strategy";
import {
  RISK_PROFILES,
  DEFAULT_MAX_DRAWDOWN_PCT,
  DEFAULT_TRAIL_PCT,
  DEFAULT_MAX_WEEKLY_LOSS_PCT,
  DEFAULT_MAX_PER_ASSET_EXPOSURE_PCT,
  DEFAULT_MAX_CONSECUTIVE_LOSSES,
  DEFAULT_MAX_HOLD_MINUTES,
  HIGHER_TF,
  autoPlan,
  type RiskProfileName,
} from "./auto";
import { computeTrailingStop } from "./trailing";
import { excludedStrategies } from "./feedback";
import { partialDecision } from "./partial";

/** In-process per-user run lock so scheduler + manual runs never overlap. */
const running = new Set<string>();
/** Cross-process lease duration (ms) for the DB lock below. A cycle far exceeding
 * this would be abnormal; the lease then simply expires and the next run proceeds. */
const LEASE_MS = 3 * 60 * 1000;

async function log(userId: string, action: string, message: string, symbol?: string) {
  await prisma.botLog.create({ data: { userId, action, message, symbol: symbol ?? null } });
}

export interface BotCycleResult {
  ran: boolean;
  opened: number;
  closed: number;
  message: string;
}

type PositionWithAsset = {
  id: string;
  portfolioId: string;
  assetId: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  feesPaid: number;
  realizedPnl: number | null; // accumulates partial-TP gains while still OPEN
  openedAt: Date;
  stopLoss: number | null;
  takeProfit: number | null;
  asset: { symbol: string };
  orders?: { side: string; quantity: number; reason?: string | null }[];
};

async function loadHeld(portfolioId: string): Promise<PositionWithAsset[]> {
  return prisma.position.findMany({
    where: { portfolioId, status: "OPEN", openedBy: "BOT" },
    include: { asset: true, orders: true },
  });
}

/**
 * Settles a single position close at `price`. Does the DB transaction, records
 * the trade + order, adjusts portfolio cash and writes a CLOSE log line.
 * Returns the resulting cash so callers can chain closes sequentially.
 */
async function settleClose(
  userId: string,
  pos: PositionWithAsset,
  price: number,
  reason: string,
  feeBps: number,
  cashBefore: number,
): Promise<{ cashAfter: number; pnl: number; pnlPct: number }> {
  // A LONG is opened with BUY and closed with SELL; a SHORT is the mirror
  // (opened with SELL, closed with BUY).
  const openSide = pos.side === "LONG" ? "BUY" : "SELL";
  const closeSide = pos.side === "LONG" ? "SELL" : "BUY";
  const plan = planClose({ cash: cashBefore, side: pos.side, quantity: pos.quantity, entryPrice: pos.entryPrice, exitPrice: price, feeBps });
  // Fold in any partial-TP already realized so the Trade reflects the WHOLE
  // round-trip (partial gain + remainder), on the original quantity.
  const priorPartial = pos.realizedPnl ?? 0;
  const openQty = (pos.orders?.filter((o) => o.side === openSide).reduce((s, o) => s + o.quantity, 0)) || pos.quantity;
  const totalPnl = round(priorPartial + plan.pnl, 2);
  const totalFees = round(pos.feesPaid + plan.fee, 6);
  const totalPnlPct = pos.entryPrice * openQty > 0 ? round((totalPnl / (pos.entryPrice * openQty)) * 100, 2) : plan.pnlPct;
  await prisma.$transaction([
    prisma.position.update({ where: { id: pos.id }, data: { status: "CLOSED", exitPrice: price, realizedPnl: totalPnl, feesPaid: totalFees, closedAt: new Date() } }),
    prisma.order.create({ data: { portfolioId: pos.portfolioId, assetId: pos.assetId, positionId: pos.id, side: closeSide, type: "MARKET", status: "FILLED", quantity: pos.quantity, price, fee: plan.fee, reason: "BOT close" } }),
    prisma.trade.create({ data: { portfolioId: pos.portfolioId, assetId: pos.assetId, positionId: pos.id, side: pos.side, quantity: openQty, entryPrice: pos.entryPrice, exitPrice: price, fees: totalFees, pnl: totalPnl, pnlPct: totalPnlPct, openedAt: pos.openedAt } }),
    prisma.portfolio.update({ where: { id: pos.portfolioId }, data: { cash: plan.cashAfter } }),
  ]);
  await log(userId, "CLOSE", `${pos.asset.symbol} : ${reason} → P&L ${plan.pnl} (${plan.pnlPct}%)`, pos.asset.symbol);
  return { cashAfter: plan.cashAfter, pnl: plan.pnl, pnlPct: plan.pnlPct };
}

/**
 * Sells PART of an open position (partial take-profit) and moves the stop to
 * breakeven. Does NOT create a Trade (the round-trip is booked when the
 * remainder finally closes); it records a SELL order, banks the proceeds, and
 * accumulates the realized gain on the position. Mutates `pos` in place.
 */
async function settlePartial(
  userId: string,
  pos: PositionWithAsset,
  price: number,
  sellQty: number,
  breakeven: number,
  feeBps: number,
  cashBefore: number,
): Promise<number> {
  const closeSide = pos.side === "LONG" ? "SELL" : "BUY";
  const plan = planClose({ cash: cashBefore, side: pos.side, quantity: sellQty, entryPrice: pos.entryPrice, exitPrice: price, feeBps });
  const newQty = round(pos.quantity - sellQty, 6);
  const newRealized = round((pos.realizedPnl ?? 0) + plan.pnl, 2);
  const newFees = round(pos.feesPaid + plan.fee, 6);
  // Move the stop to breakeven: a LONG's stop can only rise, a SHORT's only fall.
  const newStop = pos.side === "LONG"
    ? Math.max(pos.stopLoss ?? -Infinity, breakeven)
    : Math.min(pos.stopLoss ?? Infinity, breakeven);
  await prisma.$transaction([
    prisma.position.update({ where: { id: pos.id }, data: { quantity: newQty, realizedPnl: newRealized, feesPaid: newFees, stopLoss: newStop } }),
    prisma.order.create({ data: { portfolioId: pos.portfolioId, assetId: pos.assetId, positionId: pos.id, side: closeSide, type: "MARKET", status: "FILLED", quantity: sellQty, price, fee: plan.fee, reason: "BOT partial-TP" } }),
    prisma.portfolio.update({ where: { id: pos.portfolioId }, data: { cash: plan.cashAfter } }),
  ]);
  // Keep the in-memory position consistent for the rest of this cycle.
  pos.quantity = newQty;
  pos.realizedPnl = newRealized;
  pos.feesPaid = newFees;
  pos.stopLoss = newStop;
  (pos.orders ??= []).push({ side: closeSide, quantity: sellQty, reason: "BOT partial-TP" });
  await log(userId, "PARTIAL", `${pos.asset.symbol} : profit partiel pris (${sellQty} @ ${price}) — stop ramené au point mort ${newStop}`, pos.asset.symbol);
  await notifyUser(userId, `🟡 Profit partiel ${pos.asset.symbol} : clôture ${sellQty} @ ${formatCurrency(price)} (P&L ${plan.pnl >= 0 ? "+" : ""}${plan.pnl}). Stop → point mort, le reste continue.`);
  return plan.cashAfter;
}

interface Candidate {
  symbol: string;
  entry: number;
  stop: number;
  tp: number;
  side: "LONG" | "SHORT";
  reason: string;
  strategy: string;
  score?: number; // unified Trade Score (AUTO only)
  regime?: string; // detected market regime (AUTO only)
  htfAgree?: boolean; // higher-timeframe already confirmed (AUTO only)
}

/**
 * EMERGENCY: closes EVERY open position (bot- and user-opened) at the current
 * market price and turns the auto-pilot off. Used by the kill-switch button and
 * by the drawdown circuit-breaker. PAPER only.
 */
export async function panicCloseAll(
  userId: string,
  reason = "Arrêt d'urgence déclenché",
): Promise<{ closed: number; message: string }> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;
  const provider = getMarketDataProvider();

  const portfolio = await prisma.portfolio.findFirst({ where: { userId } });
  await prisma.botConfig.updateMany({ where: { userId }, data: { enabled: false } }).catch(() => {});

  if (!portfolio) return { closed: 0, message: "Aucun portefeuille." };

  const open = await prisma.position.findMany({
    where: { portfolioId: portfolio.id, status: "OPEN" },
    include: { asset: true, orders: true },
  });

  let cash = portfolio.cash;
  let closed = 0;
  for (const pos of open) {
    const quote = await provider.getQuote(pos.asset.symbol).catch(() => null);
    if (!quote) continue;
    const res = await settleClose(userId, pos, quote.price, reason, feeBps, cash);
    cash = res.cashAfter;
    closed++;
  }

  await log(userId, "HALT", `${reason} — robot arrêté, ${closed} position(s) fermée(s).`);
  await notifyUser(userId, `🛑 ${reason}\nRobot arrêté. ${closed} position(s) fermée(s).`);
  return { closed, message: `${closed} position(s) fermée(s), robot arrêté.` };
}

/**
 * DEMO: force-opens ONE paper position right now, bypassing the strategy/score
 * filters, so the user can WATCH the bot's mechanics live — the position is then
 * managed by the normal cycle exactly like a real one (trailing stop, partial
 * take-profit at the halfway target, stop-loss / take-profit exit). Uses a tight
 * stop (~1%) / target (~2%) so the reactions show within minutes to hours rather
 * than days. PAPER only — no real order. The bot must be running for the cycle
 * to then manage it.
 */
export async function openDemoTrade(
  userId: string,
  symbol = "BTC",
  side: "LONG" | "SHORT" = "LONG",
): Promise<{ ok: boolean; message: string }> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;
  const provider = getMarketDataProvider();

  const quote = await provider.getQuote(symbol).catch(() => null);
  if (!quote) return { ok: false, message: `Pas de prix en direct pour ${symbol} — réessaie dans un instant.` };
  const entry = quote.price;

  const cfg = await prisma.botConfig.findUnique({ where: { userId } });
  const profile = RISK_PROFILES[(cfg?.riskProfile as RiskProfileName) ?? "BALANCED"] ?? RISK_PROFILES.BALANCED;

  const state = await loadPortfolioState(userId);
  const equity = state.metrics.equity;
  const cash = state.metrics.cash;

  // Tight, symmetric levels so the whole lifecycle plays out quickly.
  const stop = round(side === "LONG" ? entry * 0.99 : entry * 1.01, 6);
  const tp = round(side === "LONG" ? entry * 1.02 : entry * 0.98, 6);

  let quantity: number;
  try {
    quantity = computePositionSize({ capital: equity, riskPct: profile.riskPerTradePct, entry, stop }).quantity;
  } catch {
    return { ok: false, message: "Impossible de dimensionner le trade démo." };
  }
  // Never exceed available cash.
  const feeRate = feeBps / 10_000;
  const maxQty = cash > 0 ? (cash / (entry * (1 + feeRate))) * 0.98 : 0;
  quantity = round(Math.min(quantity, maxQty), 6);
  if (quantity <= 0) return { ok: false, message: "Fonds insuffisants pour un trade démo." };

  const openSide = side === "LONG" ? "BUY" : "SELL";
  const plan = planOpen({ cash, side: openSide, quantity, price: entry, feeBps });

  const cat = getCatalogAsset(symbol);
  const asset = await prisma.asset.upsert({
    where: { symbol: cat?.symbol ?? symbol },
    update: {},
    create: { symbol: cat?.symbol ?? symbol, name: cat?.name ?? symbol, assetClass: cat?.assetClass ?? "CRYPTO", quoteCurrency: cat?.quoteCurrency ?? "USD", exchange: cat?.exchange },
  });
  // Atomic open (position + order + cash debit together).
  await prisma.$transaction(async (tx) => {
    const position = await tx.position.create({
      data: { portfolioId: state.portfolioId, assetId: asset.id, side, status: "OPEN", quantity: plan.quantity, entryPrice: plan.entryPrice, stopLoss: stop, takeProfit: tp, feesPaid: plan.fee, openedBy: "BOT" },
    });
    await tx.order.create({ data: { portfolioId: state.portfolioId, assetId: asset.id, positionId: position.id, side: openSide, type: "MARKET", status: "FILLED", quantity: plan.quantity, price: plan.entryPrice, fee: plan.fee, reason: "BOT open BOT:DEMO" } });
    await tx.portfolio.update({ where: { id: state.portfolioId }, data: { cash: plan.cashAfter } });
  });

  const verb = side === "LONG" ? "achat" : "vente à découvert";
  await log(userId, "OPEN", `🧪 DÉMO — ${symbol} : ${verb} ${plan.quantity} @ ${plan.entryPrice} · stop ${stop} · TP ${tp} (trade de démonstration forcé)`, symbol);
  await notifyUser(userId, `🧪 Trade DÉMO ${side === "LONG" ? "Achat" : "Vente"} ${symbol} : ${plan.quantity} @ ${formatCurrency(plan.entryPrice)}\nstop ${formatCurrency(stop)} · TP ${formatCurrency(tp)}\nLe robot va maintenant le gérer (stop suiveur, profit partiel, sortie).`);

  return { ok: true, message: `Trade démo ouvert : ${side === "LONG" ? "achat" : "vente"} ${symbol} @ ${formatCurrency(entry)}. Regarde la position et le journal évoluer.` };
}

/**
 * Runs ONE decision cycle. PAPER only. Supports two modes:
 *  - MANUAL: user-chosen strategy + symbols + fixed % stop.
 *  - AUTO:   the bot picks assets/entries/exits/stops/sizing from the risk
 *            profile (scanner + ATR). The user only sets a risk level.
 * A drawdown circuit-breaker halts the whole bot before any new risk is taken.
 * Stop-loss / take-profit are enforced generically for every bot position.
 *
 * Guarded by an in-process lock: if a cycle for this user is already running
 * (scheduler tick overlapping a manual run, or a cycle longer than one tick),
 * the second call is ignored instead of double-trading.
 */
export async function runBotCycle(userId: string): Promise<BotCycleResult> {
  // Fast in-process guard (same process: scheduler tick vs manual run).
  if (running.has(userId)) {
    return { ran: false, opened: 0, closed: 0, message: "cycle déjà en cours — ignoré" };
  }
  running.add(userId);
  try {
    // Cross-process lease lock: with the bot in its own worker process AND a
    // manual "run now" possible from the web server, the in-process Set is not
    // enough. We atomically claim the lease in the DB; if another process holds
    // a live lease, we skip. The lease auto-expires so a crash can't wedge it.
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    // Raw SQL on purpose: claims the lease atomically without depending on the
    // generated Prisma types for this column (added by `prisma db push`).
    const claimed = await prisma.$executeRaw`
      UPDATE "BotConfig"
      SET "lockRunUntil" = ${leaseUntil}
      WHERE "userId" = ${userId}
        AND ("lockRunUntil" IS NULL OR "lockRunUntil" < ${now})`;
    if (claimed === 0) {
      return { ran: false, opened: 0, closed: 0, message: "cycle déjà en cours (autre process) — ignoré" };
    }
    try {
      return await runBotCycleInner(userId);
    } finally {
      await prisma
        .$executeRaw`UPDATE "BotConfig" SET "lockRunUntil" = NULL WHERE "userId" = ${userId}`
        .catch(() => {});
    }
  } finally {
    running.delete(userId);
  }
}

async function runBotCycleInner(userId: string): Promise<BotCycleResult> {
  const cfg = await prisma.botConfig.findUnique({ where: { userId } });
  if (!cfg || !cfg.enabled) return { ran: false, opened: 0, closed: 0, message: "bot désactivé" };

  const setting = await prisma.setting.findUnique({ where: { userId } });
  const feeBps = setting?.feeBps ?? env.paper.feeBps;
  const maxDailyLoss = setting?.maxDailyLossPct ?? 3;
  const provider = getMarketDataProvider();

  const state = await loadPortfolioState(userId);
  let cash = state.metrics.cash;
  const equity = state.metrics.equity;
  let opened = 0;
  let closed = 0;

  // Effective parameters (from the profile in AUTO, from the config in MANUAL).
  const isAuto = cfg.mode === "AUTO";
  const profile = RISK_PROFILES[cfg.riskProfile as RiskProfileName] ?? RISK_PROFILES.BALANCED;
  const eff = isAuto
    ? {
        riskPerTradePct: profile.riskPerTradePct,
        maxOpenPositions: profile.maxOpenPositions,
        maxExposurePct: profile.maxExposurePct,
        timeframe: profile.timeframe as Timeframe,
        maxDrawdownPct: profile.maxDrawdownPct,
        trailPct: profile.trailPct,
        maxWeeklyLossPct: profile.maxWeeklyLossPct,
        maxPerAssetExposurePct: profile.maxPerAssetExposurePct,
        maxConsecutiveLosses: profile.maxConsecutiveLosses,
        maxHoldMinutes: profile.maxHoldMinutes,
      }
    : {
        riskPerTradePct: cfg.riskPerTradePct,
        maxOpenPositions: cfg.maxOpenPositions,
        maxExposurePct: setting?.maxPortfolioExposurePct ?? 60,
        timeframe: cfg.timeframe as Timeframe,
        maxDrawdownPct: DEFAULT_MAX_DRAWDOWN_PCT,
        trailPct: DEFAULT_TRAIL_PCT,
        maxWeeklyLossPct: DEFAULT_MAX_WEEKLY_LOSS_PCT,
        maxPerAssetExposurePct: DEFAULT_MAX_PER_ASSET_EXPOSURE_PCT,
        maxConsecutiveLosses: DEFAULT_MAX_CONSECUTIVE_LOSSES,
        maxHoldMinutes: DEFAULT_MAX_HOLD_MINUTES,
      };

  // Risk-hardening signals (computed once): 7-day realized P&L and the current
  // consecutive-loss streak. These gate NEW entries below.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [weekTrades, recentTrades] = await Promise.all([
    prisma.trade.findMany({ where: { portfolioId: state.portfolioId, closedAt: { gte: weekAgo } }, select: { pnl: true } }),
    prisma.trade.findMany({ where: { portfolioId: state.portfolioId }, orderBy: { closedAt: "desc" }, take: 20, select: { pnl: true } }),
  ]);
  const weeklyPnl = weekTrades.reduce((s, t) => s + t.pnl, 0);
  const weeklyLossPct = equity > 0 ? (-weeklyPnl / equity) * 100 : 0;
  let lossStreak = 0;
  for (const t of recentTrades) {
    if (t.pnl <= 0) lossStreak++;
    else break;
  }

  // 0) CIRCUIT-BREAKER — if we're in too deep a drawdown, close everything and
  //    stop the bot before taking any new risk.
  if (state.metrics.currentDrawdownPct >= eff.maxDrawdownPct) {
    const res = await panicCloseAll(
      userId,
      `Coupe-circuit : drawdown ${state.metrics.currentDrawdownPct}% ≥ limite ${eff.maxDrawdownPct}%`,
    );
    return { ran: true, opened: 0, closed: res.closed, message: `Coupe-circuit déclenché. ${res.message}` };
  }

  // Shared close executor for this cycle (chains cash + counts + notifies).
  async function execClose(pos: PositionWithAsset, price: number, reason: string) {
    const res = await settleClose(userId, pos, price, reason, feeBps, cash);
    cash = res.cashAfter;
    closed++;
    await notifyUser(
      userId,
      `🔴 Vente ${pos.asset.symbol} @ ${formatCurrency(price)}\n${reason}\nP&L ${res.pnl >= 0 ? "+" : ""}${res.pnl} (${res.pnlPct}%)`,
    );
  }

  const held = await loadHeld(state.portfolioId);

  // Prefetch every held-position quote in PARALLEL (was fetched one-by-one in
  // the loop below, which made a cycle slow when several positions were open).
  const heldSymbols = [...new Set(held.map((p) => p.asset.symbol))];
  const prefetched = await Promise.all(
    heldSymbols.map((s) =>
      provider
        .getQuote(s)
        .then((q) => [s, q.price] as const)
        .catch(() => [s, null] as const),
    ),
  );
  const quoteBySymbol = new Map<string, number | null>(prefetched);

  // 1) Generic stop-loss / take-profit for every bot position.
  const survivors: PositionWithAsset[] = [];
  const priceCache = new Map<string, number>();
  for (const pos of held) {
    const price = quoteBySymbol.get(pos.asset.symbol) ?? null;
    if (price == null) { survivors.push(pos); continue; }
    const quote = { price };
    priceCache.set(pos.asset.symbol, quote.price);

    // Time-stop (intraday): never let a position linger past the profile's max
    // holding time. Closes at market regardless of SL/TP. 0 = disabled (swing).
    if (eff.maxHoldMinutes > 0) {
      const ageMin = (Date.now() - pos.openedAt.getTime()) / 60000;
      if (ageMin >= eff.maxHoldMinutes) {
        await execClose(pos, quote.price, `sortie sur le temps (ouverte depuis ${Math.round(ageMin)} min ≥ ${eff.maxHoldMinutes} min)`);
        continue;
      }
    }

    // Trailing stop: ratchet the stop in the safe direction as the trade
    // advances (up for a LONG, down for a SHORT) to protect profit.
    const trailed = computeTrailingStop({
      entry: pos.entryPrice,
      takeProfit: pos.takeProfit,
      currentStop: pos.stopLoss,
      price: quote.price,
      trailPct: eff.trailPct,
      side: pos.side,
    });
    if (trailed != null) {
      await prisma.position.update({ where: { id: pos.id }, data: { stopLoss: trailed } });
      pos.stopLoss = trailed; // the touch-check below uses the moved stop
      await log(userId, "TRAIL", `${pos.asset.symbol} : stop déplacé à ${trailed} pour protéger les gains`, pos.asset.symbol);
    }

    // Partial take-profit: at the halfway target, close part and go breakeven.
    const partialTaken = (pos.orders ?? []).some((o) => o.reason === "BOT partial-TP");
    const pd = partialDecision({ entry: pos.entryPrice, takeProfit: pos.takeProfit, stop: pos.stopLoss, price: quote.price, quantity: pos.quantity, partialTaken, side: pos.side });
    if (pd?.take) {
      cash = await settlePartial(userId, pos, quote.price, pd.sellQty, pd.breakeven, feeBps, cash);
    }

    // Stop-loss / take-profit hit — mirrored by direction. LONG: stop below,
    // TP above. SHORT: stop above, TP below.
    if (pos.side === "LONG") {
      if (pos.stopLoss && quote.price <= pos.stopLoss) { await execClose(pos, quote.price, `stop-loss touché (${quote.price} ≤ ${pos.stopLoss})`); continue; }
      if (pos.takeProfit && quote.price >= pos.takeProfit) { await execClose(pos, quote.price, `take-profit atteint (${quote.price} ≥ ${pos.takeProfit})`); continue; }
    } else {
      if (pos.stopLoss && quote.price >= pos.stopLoss) { await execClose(pos, quote.price, `stop-loss touché (${quote.price} ≥ ${pos.stopLoss})`); continue; }
      if (pos.takeProfit && quote.price <= pos.takeProfit) { await execClose(pos, quote.price, `take-profit atteint (${quote.price} ≤ ${pos.takeProfit})`); continue; }
    }
    survivors.push(pos);
  }

  // 2) Mode-specific plan: which survivors to close on signal + entry candidates.
  const signalCloses: { id: string; reason: string }[] = [];
  let candidates: Candidate[] = [];
  let autoSkipped: { symbol: string; reason: string }[] = [];

  if (isAuto) {
    // Performance feedback: skip strategies that are losing money for this user.
    const excluded = await excludedStrategies(state.portfolioId);
    if (excluded.size) {
      await log(userId, "INFO", `Stratégie(s) en pause (espérance négative) : ${[...excluded].join(", ")}`);
    }
    const plan = await autoPlan(provider, profile, survivors.map((p) => ({ id: p.id, side: p.side, asset: { symbol: p.asset.symbol } })), excluded);
    signalCloses.push(...plan.closes);
    candidates = plan.candidates;
    autoSkipped = plan.skipped;
  } else {
    for (const pos of survivors) {
      const candles = await provider.getCandles(pos.asset.symbol, eff.timeframe, 200).catch(() => []);
      const sig = candles.length ? longSignal(candles, cfg.strategy as BotStrategy) : { long: true, reason: "" };
      if (!sig.long) signalCloses.push({ id: pos.id, reason: `signal de sortie — ${sig.reason}` });
    }
    let symbols = cfg.symbols;
    if (!symbols.length) {
      const wl = await prisma.watchlist.findFirst({ where: { userId }, include: { items: { include: { asset: true } } } });
      symbols = wl?.items.map((i) => i.asset.symbol) ?? [];
    }
    if (!symbols.length) symbols = ["BTC", "ETH", "SOL"];
    const heldSymbols = new Set(survivors.map((p) => p.asset.symbol));
    for (const symbol of symbols) {
      if (heldSymbols.has(symbol)) continue;
      const candles = await provider.getCandles(symbol, eff.timeframe, 200).catch(() => []);
      if (candles.length < 30) continue;
      const sig = longSignal(candles, cfg.strategy as BotStrategy);
      if (!sig.long) continue;
      const quote = await provider.getQuote(symbol).catch(() => null);
      if (!quote) continue;
      const entry = quote.price;
      // Prefer strategy-supplied levels (e.g. Fibonacci SL/TP from the book);
      // fall back to the config's fixed % stop when not provided/invalid.
      let stop: number;
      let tp: number;
      if (sig.stop != null && sig.takeProfit != null && sig.stop < entry && entry < sig.takeProfit) {
        stop = round(sig.stop, 6);
        tp = round(sig.takeProfit, 6);
      } else {
        stop = round(entry * (1 - cfg.stopPct / 100), 6);
        tp = round(entry * (1 + (cfg.stopPct * cfg.takeProfitRR) / 100), 6);
      }
      candidates.push({ symbol, entry, stop, tp, side: "LONG", reason: sig.reason, strategy: cfg.strategy });
    }
  }

  // 3) Execute signal closes.
  const stillOpen = new Map(survivors.map((p) => [p.id, p]));
  for (const c of signalCloses) {
    const pos = stillOpen.get(c.id);
    if (!pos) continue;
    const price = priceCache.get(pos.asset.symbol) ?? (await provider.getQuote(pos.asset.symbol).catch(() => null))?.price;
    if (price == null) continue;
    await execClose(pos, price, c.reason);
    stillOpen.delete(c.id);
  }

  // 4) Execute entries within limits.
  let openCount = stillOpen.size;
  const dailyLossPct = equity > 0 ? (-state.metrics.pnlToday / equity) * 100 : 0;
  const higherTf = HIGHER_TF[eff.timeframe];

  // Anti-revenge / weekly-loss circuit: block ALL new entries this cycle.
  let entriesBlocked: string | null = null;
  if (weeklyLossPct >= eff.maxWeeklyLossPct) {
    entriesBlocked = `Limite de perte hebdomadaire atteinte (${weeklyLossPct.toFixed(1)}% ≥ ${eff.maxWeeklyLossPct}%) — aucune nouvelle position`;
  } else if (lossStreak >= eff.maxConsecutiveLosses) {
    entriesBlocked = `Série de ${lossStreak} pertes consécutives — pause anti-revenge (limite ${eff.maxConsecutiveLosses})`;
  }
  if (entriesBlocked) await log(userId, "SKIP", entriesBlocked);

  // Current exposure per asset (to cap concentration on a single symbol).
  const exposureBySymbol = new Map<string, number>();
  for (const p of stillOpen.values()) {
    exposureBySymbol.set(p.asset.symbol, (exposureBySymbol.get(p.asset.symbol) ?? 0) + p.quantity * p.entryPrice);
  }

  for (const cand of candidates) {
    if (entriesBlocked) break;
    if (openCount >= eff.maxOpenPositions) break;
    if (dailyLossPct >= maxDailyLoss) { await log(userId, "SKIP", `Limite de perte quotidienne atteinte (${dailyLossPct.toFixed(1)}%)`); break; }

    // Multi-timeframe filter (MANUAL only): in AUTO the higher-timeframe
    // agreement is already folded into the unified Trade Score, so a second hard
    // veto here would double-penalize and needlessly keep the bot out.
    if (!isAuto && higherTf) {
      const htfCandles = await provider.getCandles(cand.symbol, higherTf, 200).catch(() => []);
      if (htfCandles.length >= 60) {
        const up = isUptrend(htfCandles.map((c) => c.close));
        const agree = cand.side === "LONG" ? up : !up;
        if (!agree) {
          await log(userId, "SKIP", `${cand.symbol} : tendance ${higherTf} ${cand.side === "LONG" ? "non haussière" : "non baissière"} (filtre multi-timeframe)`, cand.symbol);
          continue;
        }
      }
    }

    let sizing;
    try { sizing = computePositionSize({ capital: equity, riskPct: eff.riskPerTradePct, entry: cand.entry, stop: cand.stop }); } catch { continue; }
    if (sizing.quantity <= 0) continue;

    // Size the trade to FIT the account. Risk-based sizing (risk$ / stop distance)
    // can demand a notional far larger than available cash when the stop is tight
    // — which is the norm for low-volatility instruments like forex pairs. Left
    // unchecked, every such candidate was rejected for "insufficient cash /
    // exposure" and the bot never opened anything, even on valid setups. We cap
    // the quantity to the most constraining limit: available cash, remaining
    // total-exposure room, and per-asset exposure room. Sizing DOWN only lowers
    // risk, never raises it; if there's genuinely no room, we skip transparently.
    const quantity = fitQuantityToAccount({
      desiredQty: sizing.quantity,
      entry: cand.entry,
      cash,
      feeBps,
      equity,
      currentExposure: state.metrics.marketValue,
      maxExposurePct: eff.maxExposurePct,
      symbolExposure: exposureBySymbol.get(cand.symbol) ?? 0,
      maxPerAssetExposurePct: eff.maxPerAssetExposurePct,
    });
    if (quantity <= 0) {
      await log(userId, "SKIP", `${cand.symbol} : plus de place (cash/exposition) pour une nouvelle position`, cand.symbol);
      continue;
    }
    const wasCapped = quantity < sizing.quantity - 1e-9;
    const notional = quantity * cand.entry;
    const symExposure = (exposureBySymbol.get(cand.symbol) ?? 0) + notional;

    const cat = getCatalogAsset(cand.symbol);
    const asset = await prisma.asset.upsert({
      where: { symbol: cat?.symbol ?? cand.symbol },
      update: {},
      create: { symbol: cat?.symbol ?? cand.symbol, name: cat?.name ?? cand.symbol, assetClass: cat?.assetClass ?? "CRYPTO", quoteCurrency: cat?.quoteCurrency ?? "USD", exchange: cat?.exchange },
    });
    // Open side: BUY for a LONG, SELL (sell-to-open) for a SHORT.
    const openSide = cand.side === "LONG" ? "BUY" : "SELL";
    const verb = cand.side === "LONG" ? "achat" : "vente à découvert";
    const emoji = cand.side === "LONG" ? "🟢" : "🔵";
    const plan = planOpen({ cash, side: openSide, quantity, price: cand.entry, feeBps });
    cash = plan.cashAfter;
    // Atomic open: position + order + cash debit succeed or fail together, so a
    // crash can never leave a position without its matching cash movement.
    await prisma.$transaction(async (tx) => {
      const position = await tx.position.create({
        data: { portfolioId: state.portfolioId, assetId: asset.id, side: cand.side, status: "OPEN", quantity: plan.quantity, entryPrice: plan.entryPrice, stopLoss: cand.stop, takeProfit: cand.tp, feesPaid: plan.fee, openedBy: "BOT" },
      });
      await tx.order.create({ data: { portfolioId: state.portfolioId, assetId: asset.id, positionId: position.id, side: openSide, type: "MARKET", status: "FILLED", quantity: plan.quantity, price: plan.entryPrice, fee: plan.fee, reason: `BOT open BOT:${cand.strategy}` } });
      await tx.portfolio.update({ where: { id: state.portfolioId }, data: { cash: plan.cashAfter } });
    });
    await log(userId, "OPEN", `${cand.symbol} : ${verb} ${plan.quantity} @ ${plan.entryPrice} — ${cand.reason} · stop ${cand.stop} · TP ${cand.tp}${wasCapped ? " (taille ajustée au capital)" : ""}`, cand.symbol);
    await notifyUser(
      userId,
      `${emoji} ${cand.side === "LONG" ? "Achat" : "Vente à découvert"} ${cand.symbol} : ${plan.quantity} @ ${formatCurrency(plan.entryPrice)}\n${cand.reason}\nstop ${formatCurrency(cand.stop)} · TP ${formatCurrency(cand.tp)}`,
    );
    exposureBySymbol.set(cand.symbol, symExposure);
    opened++;
    openCount++;
  }

  await prisma.botConfig.update({ where: { userId }, data: { lastRunAt: new Date() } });
  if (opened === 0 && closed === 0) {
    // Explain WHY nothing happened, so "no action" is never a mystery.
    let why = "";
    if (entriesBlocked) why = ` (${entriesBlocked})`;
    else if (isAuto && autoSkipped.length) why = ` — ${autoSkipped.slice(0, 3).map((s) => `${s.symbol}: ${s.reason}`).join(" · ")}`;
    else if (isAuto) why = " — aucune configuration du livre détectée";
    await log(userId, "INFO", `Cycle ${isAuto ? "autonome" : "manuel"} terminé — aucune action.${why}`);
  }
  return { ran: true, opened, closed, message: `Cycle terminé : ${opened} ouverture(s), ${closed} clôture(s).` };
}
