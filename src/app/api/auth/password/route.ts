import { authUserId, fail, ok, parseBody, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { passwordChangeSchema } from "@/lib/validation";

export async function PATCH(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`pwd:${auth.userId}`, 5, 60_000)) {
    return fail("Too many attempts, slow down", 429);
  }
  const parsed = await parseBody(req, passwordChangeSchema);
  if ("response" in parsed) return parsed.response;

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return fail("Not found", 404);

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return fail("Current password is incorrect", 403);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  return ok({ updated: true });
}
