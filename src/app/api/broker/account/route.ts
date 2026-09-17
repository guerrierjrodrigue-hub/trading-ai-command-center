import { authUserId, fail, ok } from "@/lib/api";
import { getBrokerConnector, realTradingEnabled } from "@/services/broker";
import { BrokerNotConfiguredError } from "@/services/broker/types";

export async function GET() {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;

  const broker = getBrokerConnector();
  try {
    const [account, positions] = await Promise.all([
      broker.getAccount(auth.userId),
      broker.getPositions(auth.userId),
    ]);
    return ok({
      account,
      positions,
      capabilities: broker.capabilities(),
      realTradingEnabled: realTradingEnabled(),
    });
  } catch (e) {
    if (e instanceof BrokerNotConfiguredError) {
      return ok({
        account: {
          provider: broker.name,
          mode: broker.mode,
          currency: "USD",
          cash: 0,
          equity: 0,
          buyingPower: 0,
          tradingEnabled: false,
          connected: false,
          note: (e as Error).message,
        },
        positions: [],
        capabilities: broker.capabilities(),
        realTradingEnabled: realTradingEnabled(),
      });
    }
    return fail((e as Error).message, 502);
  }
}
