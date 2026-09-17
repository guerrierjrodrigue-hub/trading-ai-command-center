import { authUserId, fail, ok } from "@/lib/api";
import { openDemoTrade } from "@/services/bot/runner";

/**
 * DEMO trade: force-opens ONE paper position so the user can watch the bot's
 * mechanics (trailing stop, partial take-profit, exit) live. PAPER only — no
 * real broker order is ever sent.
 */
export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  let symbol = "BTC";
  let side: "LONG" | "SHORT" = "LONG";
  try {
    const body = await req.json();
    if (typeof body?.symbol === "string" && body.symbol.trim()) symbol = body.symbol.trim().toUpperCase();
    if (body?.side === "SHORT" || body?.side === "LONG") side = body.side;
  } catch {
    // no body -> defaults (BTC long)
  }

  try {
    const result = await openDemoTrade(auth.userId, symbol, side);
    if (!result.ok) return fail(result.message, 422);
    return ok(result);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
