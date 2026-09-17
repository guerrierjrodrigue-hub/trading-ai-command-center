import { authUserId, fail, ok } from "@/lib/api";
import { getBrokerConnector } from "@/services/broker";
import {
  BrokerNotConfiguredError,
  BrokerTradingDisabledError,
} from "@/services/broker/types";

export async function POST(_req: Request, { params }: { params: { symbol: string } }) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const broker = getBrokerConnector();
  if (!broker.closePosition) {
    return fail("Ce courtier ne permet pas de clôturer ici.", 400);
  }
  try {
    await broker.closePosition(auth.userId, decodeURIComponent(params.symbol));
    return ok({ closed: params.symbol });
  } catch (e) {
    if (e instanceof BrokerNotConfiguredError) return fail((e as Error).message, 400);
    if (e instanceof BrokerTradingDisabledError) return fail((e as Error).message, 403);
    return fail((e as Error).message, 502);
  }
}
