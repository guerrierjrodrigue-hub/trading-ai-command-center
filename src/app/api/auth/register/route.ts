import { prisma } from "@/lib/prisma";
import { createSessionToken, hashPassword, setSessionCookie } from "@/lib/auth";
import { fail, ok, parseBody, rateLimit } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  if (!rateLimit(`register:${req.headers.get("x-forwarded-for") ?? "local"}`, 5, 60_000)) {
    return fail("Too many attempts, slow down", 429);
  }
  const parsed = await parseBody(req, registerSchema);
  if ("response" in parsed) return parsed.response;
  const { email, password, name, inviteCode } = parsed.data;

  // Registration gate (multi-user controls).
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;
  if (!isFirstUser) {
    if (!env.allowRegistration) {
      return fail("Registration is closed", 403);
    }
    if (env.signupInviteCode && inviteCode !== env.signupInviteCode) {
      return fail("Invalid or missing invite code", 403);
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("Email already registered", 409);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      // The very first account becomes the administrator.
      role: isFirstUser ? "ADMIN" : "USER",
      setting: { create: { startingCapital: env.paper.startingCapital, feeBps: env.paper.feeBps } },
      portfolios: {
        create: {
          name: "Paper Portfolio",
          startingCapital: env.paper.startingCapital,
          cash: env.paper.startingCapital,
          isPaper: true,
        },
      },
      watchlists: { create: { name: "My Watchlist" } },
    },
  });

  const token = await createSessionToken({ sub: user.id, email: user.email });
  await setSessionCookie(token);
  return ok({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
