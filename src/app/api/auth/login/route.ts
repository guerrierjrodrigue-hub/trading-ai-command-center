import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { fail, ok, parseBody, rateLimit } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!rateLimit(`login:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60_000)) {
    return fail("Too many attempts, slow down", 429);
  }
  const parsed = await parseBody(req, loginSchema);
  if ("response" in parsed) return parsed.response;
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return fail("Invalid credentials", 401);
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return fail("Invalid credentials", 401);

  const token = await createSessionToken({ sub: user.id, email: user.email });
  await setSessionCookie(token);
  return ok({ id: user.id, email: user.email, name: user.name });
}
