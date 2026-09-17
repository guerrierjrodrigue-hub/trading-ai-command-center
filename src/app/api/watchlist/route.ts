import { authUserId, fail, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { watchlistAddSchema } from "@/lib/validation";
import { getMarketDataProvider } from "@/services/market";
import { getCatalogAsset } from "@/services/market/catalog";
import { detectTrend } from "@/services/market/indicators";

async function defaultWatchlist(userId: string) {
  let wl = await prisma.watchlist.findFirst({ where: { userId } });
  if (!wl) wl = await prisma.watchlist.create({ data: { userId, name: "My Watchlist" } });
  return wl;
}

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const wl = await defaultWatchlist(auth.userId);
  const items = await prisma.watchlistItem.findMany({
    where: { watchlistId: wl.id },
    include: { asset: true },
    orderBy: { sortOrder: "asc" },
  });

  const provider = getMarketDataProvider();
  const enriched = await Promise.all(
    items.map(async (it) => {
      const [quote, candles] = await Promise.all([
        provider.getQuote(it.asset.symbol),
        provider.getCandles(it.asset.symbol, "1D", 120),
      ]);
      return {
        id: it.id,
        symbol: it.asset.symbol,
        name: it.asset.name,
        assetClass: it.asset.assetClass,
        price: quote.price,
        changePct24h: quote.changePct24h,
        volume24h: quote.volume24h,
        trend: detectTrend(candles.map((c) => c.close)),
        sortOrder: it.sortOrder,
      };
    }),
  );

  return ok({ watchlistId: wl.id, items: enriched });
}

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, watchlistAddSchema);
  if ("response" in parsed) return parsed.response;

  const symbol = parsed.data.symbol.trim();
  const cat = getCatalogAsset(symbol);
  // Ensure the asset exists (create from catalog if unknown class defaults to CRYPTO).
  const asset = await prisma.asset.upsert({
    where: { symbol: cat?.symbol ?? symbol },
    update: {},
    create: {
      symbol: cat?.symbol ?? symbol,
      name: cat?.name ?? symbol,
      assetClass: cat?.assetClass ?? "CRYPTO",
      quoteCurrency: cat?.quoteCurrency ?? "USD",
      exchange: cat?.exchange,
    },
  });

  const wl = await defaultWatchlist(auth.userId);
  const count = await prisma.watchlistItem.count({ where: { watchlistId: wl.id } });
  try {
    const item = await prisma.watchlistItem.create({
      data: { watchlistId: wl.id, assetId: asset.id, sortOrder: count },
    });
    return ok({ id: item.id, symbol: asset.symbol }, { status: 201 });
  } catch {
    return fail("Asset already in watchlist", 409);
  }
}
