import { PrismaClient } from "@prisma/client";
import { CATALOG } from "../src/services/market/catalog";

const prisma = new PrismaClient();

/**
 * Seed = REAL-only, NON-DESTRUCTIVE baseline. It only ensures the real asset
 * catalog exists — it never creates a login account (each user registers
 * their own; the first registration becomes ADMIN) and never deletes existing
 * data, so it is safe to run on every container start.
 */
async function main() {
  console.log("Seeding database (asset catalog only, non-destructive)…");

  for (const a of CATALOG) {
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: { name: a.name, assetClass: a.assetClass, exchange: a.exchange, quoteCurrency: a.quoteCurrency },
      create: { symbol: a.symbol, name: a.name, assetClass: a.assetClass, exchange: a.exchange, quoteCurrency: a.quoteCurrency },
    });
  }

  console.log("Seed done (asset catalog only).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
