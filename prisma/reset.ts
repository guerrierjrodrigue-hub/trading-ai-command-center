import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ONE-TIME PURGE of all trading data — use it once to wipe old seeded/fictitious
 * rows so the app runs on a clean, real-only slate. It removes every position,
 * order, trade, journal entry, alert, AI analysis and bot log, and resets each
 * portfolio's cash back to its starting capital. It does NOT delete accounts,
 * settings, the asset catalog or watchlists.
 *
 * Run:  npm run db:reset   (or, in Docker:  docker compose exec app npm run db:reset)
 */
async function main() {
  console.log("Purging trading data (positions, orders, trades, journal, alerts, AI analyses, bot logs)…");

  await prisma.trade.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.position.deleteMany({});
  await prisma.journalEntry.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.aiAnalysis.deleteMany({});
  await prisma.botLog.deleteMany({});

  // Reset each portfolio to its starting capital (empty book).
  const portfolios = await prisma.portfolio.findMany({ select: { id: true, startingCapital: true } });
  for (const p of portfolios) {
    await prisma.portfolio.update({ where: { id: p.id }, data: { cash: p.startingCapital } });
  }

  console.log(`Done. ${portfolios.length} portfolio(s) reset to starting capital. The app now shows only live/real data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
