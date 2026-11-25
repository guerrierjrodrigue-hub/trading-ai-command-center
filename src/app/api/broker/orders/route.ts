import { authUserId, fail, ok, parseBody } from "@/lib/api";
import { brokerOrderSchema } from "@/lib/validation";
import { getBrokerConnector, realTradingEnabled } from "@/services/broker";
import {
  BrokerNotConfiguredError,
  BrokerTradingDisabledError,
} from "@/services/broker/types";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const broker = getBrokerConnector();
  if (!broker.getOrders) return ok({ orders: [] });
  try {
    return ok({ orders: await broker.getOrders(auth.userId) });
  } catch (e) {
    if (e instanceof BrokerNotConfiguredError) return ok({ orders: [] });
    return fail((e as Error).message, 502);
  }
}

export async function POST(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, brokerOrderSchema);
  if ("response" in parsed) return parsed.response;

  const broker = getBrokerConnector();
  if (!broker.submitOrder) {
    return fail(
      "Ce courtier ne permet pas de passer des ordres ici. Utilise la page Paper Trading (simulateur interne).",
      400,
    );
  }
  // Defense-in-depth gate at the route level: a LIVE (real-money) connector may
  // only trade when the master switch is explicitly on. This covers every
  // connector uniformly, even one whose own submitOrder forgets to check.
  if (broker.capabilities().mode === "live" && !realTradingEnabled()) {
    return fail(
      "Exécution réelle désactivée (BROKER_TRADING_ENABLED=false). Aucun ordre réel n'est passé.",
      403,
    );
  }
  try {
    const order = await broker.submitOrder(auth.userId, parsed.data);
    return ok({ order }, { status: 201 });
  } catch (e) {
    if (e instanceof BrokerNotConfiguredError) return fail((e as Error).message, 400);
    if (e instanceof BrokerTradingDisabledError) return fail((e as Error).message, 403);
    return fail((e as Error).message, 502);
  }
}
