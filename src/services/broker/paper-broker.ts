import { loadPortfolioState } from "@/services/trading/state";
import type {
  BrokerAccount,
  BrokerCapabilities,
  BrokerConnector,
  BrokerOrder,
  BrokerPosition,
} from "./types";

/**
 * Default broker: reads the user's existing PAPER portfolio (internal engine).
 * It does NOT expose trading through this interface — the app's own
 * /api/paper endpoints handle the internal simulator. Connect a real broker
 * (e.g. Alpaca paper) to trade through the broker socket instead.
 */
export class PaperBrokerConnector implements BrokerConnector {
  readonly name = "paper";
  readonly mode = "paper" as const;

  capabilities(): BrokerCapabilities {
    return { provider: this.name, mode: this.mode, canTrade: false, assetClass: "MIXED", sampleSymbols: ["BTC", "ETH", "AAPL"] };
  }

  async getAccount(userId: string): Promise<BrokerAccount> {
    const state = await loadPortfolioState(userId);
    return {
      provider: "paper",
      mode: "paper",
      currency: state.currency,
      cash: state.metrics.cash,
      equity: state.metrics.equity,
      buyingPower: state.metrics.cash,
      tradingEnabled: false,
      connected: true,
      note: "Simulateur interne — utilise la page Paper Trading pour trader.",
    };
  }

  async getPositions(userId: string): Promise<BrokerPosition[]> {
    const state = await loadPortfolioState(userId);
    return state.positions.map((p) => ({
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      marketValue: p.entryPrice * p.quantity + p.unrealizedPnl,
      unrealizedPnl: p.unrealizedPnl,
    }));
  }

  async getOrders(): Promise<BrokerOrder[]> {
    return [];
  }
}
