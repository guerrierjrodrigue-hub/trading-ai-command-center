import { prisma } from "@/lib/prisma";
import { AI_DISCLAIMER } from "@/services/ai/types";
import { getMarketDataProvider } from "@/services/market";
import { scanMarket, type ScanResult } from "@/services/scanner/scanner";
import { loadPortfolioState } from "@/services/trading/state";
import { formatCurrency, formatPct } from "@/lib/utils";

export interface BriefOpportunity {
  symbol: string;
  direction: string;
  score: number;
  setup: string;
}
export interface BriefMover {
  symbol: string;
  changePct24h: number;
}
export interface BriefWatchItem {
  symbol: string;
  changePct24h: number;
  trend: string;
  score: number;
}

export interface MarketBrief {
  date: string; // YYYY-MM-DD
  generatedAt: string; // ISO
  sentiment: "Risk-On" | "Neutre" | "Risk-Off";
  avgScore: number;
  overview: string;
  topOpportunities: BriefOpportunity[];
  gainers: BriefMover[];
  losers: BriefMover[];
  positions: {
    count: number;
    equity: number;
    unrealizedPnl: number;
    exposurePct: number;
    pnlToday: number;
  };
  watchlist: BriefWatchItem[];
  risks: string[];
  disclaimer: string;
}

/**
 * Composes the daily market brief from the same rule-based engine the scanner
 * uses (transparent, grounded, works offline) plus the user's live portfolio.
 * Structured for a future cron: the service is pure input->output and the API
 * route or a scheduler can call it on any cadence.
 */
export async function buildMarketBrief(userId: string): Promise<MarketBrief> {
  const provider = getMarketDataProvider();

  const [scan, portfolio, setting, watchlists] = await Promise.all([
    scanMarket(provider, {}),
    loadPortfolioState(userId),
    prisma.setting.findUnique({ where: { userId } }),
    prisma.watchlist.findMany({
      where: { userId },
      include: { items: { include: { asset: true } } },
    }),
  ]);

  const avgScore = scan.length
    ? Math.round(scan.reduce((s, r) => s + r.score, 0) / scan.length)
    : 50;
  const sentiment: MarketBrief["sentiment"] =
    avgScore >= 60 ? "Risk-On" : avgScore <= 45 ? "Risk-Off" : "Neutre";

  const longs = scan.filter((r) => r.direction === "LONG").length;
  const shorts = scan.filter((r) => r.direction === "SHORT").length;

  const topOpportunities: BriefOpportunity[] = scan
    .slice(0, 5)
    .map((r) => ({ symbol: r.symbol, direction: r.direction, score: r.score, setup: r.setup }));

  const byChange = [...scan].sort((a, b) => b.changePct24h - a.changePct24h);
  const gainers = byChange.slice(0, 3).map((r) => ({ symbol: r.symbol, changePct24h: r.changePct24h }));
  const losers = byChange.slice(-3).reverse().map((r) => ({ symbol: r.symbol, changePct24h: r.changePct24h }));

  // Watchlist highlights (reuse scan data — no extra network calls).
  const watchSymbols = new Set(
    watchlists.flatMap((w) => w.items.map((i) => i.asset.symbol)),
  );
  const scanBySymbol = new Map<string, ScanResult>(scan.map((r) => [r.symbol, r]));
  const watchlist: BriefWatchItem[] = [...watchSymbols]
    .map((sym) => scanBySymbol.get(sym))
    .filter((r): r is ScanResult => !!r)
    .map((r) => ({ symbol: r.symbol, changePct24h: r.changePct24h, trend: r.trend, score: r.score }));

  // Risk flags.
  const risks: string[] = [];
  const highVol = scan.filter((r) => r.risk === "HIGH").length;
  if (highVol > 0) risks.push(`${highVol} actif(s) en volatilité élevée aujourd'hui.`);
  if (setting) {
    if (portfolio.metrics.exposurePct > setting.maxPortfolioExposurePct * 0.8) {
      risks.push(
        `Exposition à ${portfolio.metrics.exposurePct}% (limite ${setting.maxPortfolioExposurePct}%).`,
      );
    }
    const dailyLossPct =
      portfolio.metrics.equity > 0
        ? (-portfolio.metrics.pnlToday / portfolio.metrics.equity) * 100
        : 0;
    if (dailyLossPct > setting.maxDailyLossPct * 0.5) {
      risks.push(`Perte du jour à surveiller (${dailyLossPct.toFixed(1)}%).`);
    }
  }
  if (portfolio.metrics.openPositions === 0) {
    risks.push("Aucune position ouverte — capital en attente.");
  }
  if (risks.length === 0) risks.push("Aucun signal de risque particulier détecté.");

  const best = topOpportunities[0];
  const overview = [
    `Sentiment global ${sentiment} (score d'opportunité moyen ${avgScore}/100).`,
    `${longs} actif(s) en biais haussier, ${shorts} en biais baissier sur ${scan.length} scannés.`,
    best
      ? `Meilleure configuration : ${best.symbol} (${best.direction}, score ${best.score}) — ${best.setup}.`
      : "",
    `Portefeuille : ${formatCurrency(portfolio.metrics.equity)} d'equity, ${portfolio.metrics.openPositions} position(s) ouverte(s), P&L latent ${formatCurrency(portfolio.metrics.unrealizedPnl)}, P&L du jour ${formatPct(
      portfolio.metrics.equity > 0
        ? (portfolio.metrics.pnlToday / portfolio.metrics.equity) * 100
        : 0,
    )}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    sentiment,
    avgScore,
    overview,
    topOpportunities,
    gainers,
    losers,
    positions: {
      count: portfolio.metrics.openPositions,
      equity: portfolio.metrics.equity,
      unrealizedPnl: portfolio.metrics.unrealizedPnl,
      exposurePct: portfolio.metrics.exposurePct,
      pnlToday: portfolio.metrics.pnlToday,
    },
    watchlist,
    risks,
    disclaimer: AI_DISCLAIMER,
  };
}

/** Compact plain-text rendering of the brief for a Telegram push. */
export function formatBriefForTelegram(brief: MarketBrief): string {
  const lines: string[] = [];
  lines.push(`📊 Brief du marché — ${brief.date}`);
  lines.push(`Sentiment : ${brief.sentiment} (score moyen ${brief.avgScore})`);
  lines.push("");
  lines.push(brief.overview);
  if (brief.topOpportunities.length) {
    lines.push("");
    lines.push("🎯 Opportunités :");
    for (const o of brief.topOpportunities.slice(0, 5)) {
      lines.push(`• ${o.symbol} ${o.direction} — score ${o.score} (${o.setup})`);
    }
  }
  lines.push("");
  lines.push(
    `💼 Portefeuille : ${formatCurrency(brief.positions.equity)} · ` +
      `${brief.positions.count} position(s) · P&L latent ${brief.positions.unrealizedPnl} · ` +
      `aujourd'hui ${brief.positions.pnlToday}`,
  );
  if (brief.risks.length) {
    lines.push("");
    lines.push("⚠️ Risques : " + brief.risks.slice(0, 3).join(" · "));
  }
  lines.push("");
  lines.push("— Scénarios, pas des conseils. Simulation uniquement.");
  return lines.join("\n");
}
