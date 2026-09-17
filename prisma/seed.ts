import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATALOG } from "../src/services/market/catalog";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@trading.ai";
const DEMO_PASSWORD = "demo1234";
const FEE_BPS = 10;
const STARTING_CAPITAL = 10000;

/**
 * Seed = REAL-ONLY, NON-DESTRUCTIVE baseline. It inserts NO fictitious trading
 * data (no fake positions, trades, journal entries or alerts) and NEVER deletes
 * existing data — so it is safe to run on every container start and your real
 * (simulated) activity PERSISTS across restarts. It only ensures, when missing:
 *   - the real asset catalog,
 *   - a login account with default risk settings,
 *   - an EMPTY paper portfolio at the starting capital,
 *   - a watchlist of real tickers.
 * To purge OLD seeded/fake data one time, run:  npm run db:reset
 */
async function main() {
  console.log("Seeding database (real-only, non-destructive)…");

  // ---- Assets (real universe) — upsert is safe/idempotent ----
  for (const a of CATALOG) {
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: { name: a.name, assetClass: a.assetClass, exchange: a.exchange, quoteCurrency: a.quoteCurrency },
      create: { symbol: a.symbol, name: a.name, assetClass: a.assetClass, exchange: a.exchange, quoteCurrency: a.quoteCurrency },
    });
  }
  const assets = await prisma.asset.findMany();
  const bySymbol = new Map(assets.map((a) => [a.symbol, a]));

  // ---- Login account + default settings (create if missing) ----
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Rody",
      role: "ADMIN",
      setting: {
        create: {
          startingCapital: STARTING_CAPITAL,
          riskPerTradePct: 1,
          maxDailyLossPct: 3,
          maxOpenPositions: 5,
          maxPortfolioExposurePct: 60,
          feeBps: FEE_BPS,
        },
      },
    },
  });

  // ---- EMPTY paper portfolio — ONLY if the user has none (never overwrites) ----
  const hasPortfolio = await prisma.portfolio.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!hasPortfolio) {
    await prisma.portfolio.create({
      data: { userId: user.id, name: "Paper Portfolio", startingCapital: STARTING_CAPITAL, cash: STARTING_CAPITAL, isPaper: true },
    });
  }

  // ---- Watchlist of REAL tickers — ONLY if the user has none ----
  const hasWatchlist = await prisma.watchlist.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!hasWatchlist) {
    const watchlist = await prisma.watchlist.create({ data: { userId: user.id, name: "My Watchlist" } });
    const watchSymbols = ["BTC", "ETH", "SOL", "NVDA", "SPY", "EUR/USD"].filter((s) => bySymbol.has(s));
    if (watchSymbols.length) {
      await prisma.watchlistItem.createMany({
        data: watchSymbols.map((s, i) => ({ watchlistId: watchlist.id, assetId: bySymbol.get(s)!.id, sortOrder: i })),
      });
    }
  }

  console.log(`Seed done (real-only). Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
