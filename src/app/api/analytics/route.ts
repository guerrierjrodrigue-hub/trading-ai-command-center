import { authUserId, fail, ok } from "@/lib/api";
import { computePerformanceAnalytics } from "@/services/analytics/performance";

export async function GET(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const benchmark = (url.searchParams.get("benchmark") || "BTC").toUpperCase().slice(0, 20);
  try {
    const analytics = await computePerformanceAnalytics(auth.userId, benchmark);
    return ok(analytics);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
