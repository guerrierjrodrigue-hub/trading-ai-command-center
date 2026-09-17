import { authUserId, fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const item = await prisma.watchlistItem.findUnique({
    where: { id: params.id },
    include: { watchlist: true },
  });
  if (!item || item.watchlist.userId !== auth.userId) {
    return fail("Not found", 404);
  }
  await prisma.watchlistItem.delete({ where: { id: params.id } });
  return ok({ deleted: params.id });
}
