import { authUserId, fail, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { settingsUpdateSchema } from "@/lib/validation";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  let setting = await prisma.setting.findUnique({ where: { userId: auth.userId } });
  if (!setting) {
    setting = await prisma.setting.create({ data: { userId: auth.userId } });
  }

  return ok({
    setting,
    providers: {
      // Only expose which provider is active — never keys.
      ai: env.ai.provider,
      aiModel: env.ai.model || null,
      market: env.market.provider,
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, settingsUpdateSchema);
  if ("response" in parsed) return parsed.response;

  const setting = await prisma.setting.upsert({
    where: { userId: auth.userId },
    update: parsed.data,
    create: { userId: auth.userId, ...parsed.data },
  });
  return ok({ setting });
}
