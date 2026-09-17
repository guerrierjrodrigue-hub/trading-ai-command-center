import { authUserId, fail, ok } from "@/lib/api";
import { runBotCycle } from "@/services/bot/runner";

export async function POST() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  try {
    const result = await runBotCycle(auth.userId);
    return ok(result);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
