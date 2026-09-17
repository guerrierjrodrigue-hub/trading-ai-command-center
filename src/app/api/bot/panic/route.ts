import { authUserId, fail, ok } from "@/lib/api";
import { panicCloseAll } from "@/services/bot/runner";

/**
 * EMERGENCY kill-switch. Closes EVERY open position at market and turns the
 * auto-pilot off. PAPER only — no real broker orders are sent.
 */
export async function POST() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  try {
    const result = await panicCloseAll(auth.userId, "Arrêt d'urgence (bouton)");
    return ok(result);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
