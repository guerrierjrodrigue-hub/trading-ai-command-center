import { authUserId, fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildMarketBrief } from "@/services/brief/market-brief";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  try {
    const brief = await buildMarketBrief(auth.userId);
    // Persist for history / future automated (cron) delivery.
    await prisma.aiAnalysis.create({
      data: {
        userId: auth.userId,
        kind: "BRIEF",
        provider: "rule-based",
        prompt: `brief:${brief.date}`,
        response: brief as unknown as object,
      },
    });
    return ok(brief);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
