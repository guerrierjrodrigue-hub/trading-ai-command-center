import { env } from "@/lib/env";
import {
  BrokerNotConfiguredError,
  BrokerTradingDisabledError,
  type BrokerAccount,
  type BrokerCapabilities,
  type BrokerConnector,
  type BrokerOrder,
  type BrokerOrderInput,
  type BrokerPosition,
} from "./types";

/**
 * Alpaca broker connector.
 *
 * Defaults to Alpaca's PAPER endpoint (demo money) — reads the account and
 * positions AND places/closes orders there. Real (live-money) execution is
 * only possible if the user deliberately points BROKER_BASE_URL at the live
 * host AND sets BROKER_TRADING_ENABLED=true; otherwise trading stays scoped to
 * the paper account. All calls are server-side; keys come from env only.
 */
const CRYPTO = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"]);

function toAlpaca(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes("/")) return s; // already pair form
  if (CRYPTO.has(s)) return `${s}/USD`;
  return s; // stock/ETF ticker
}
function fromAlpaca(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.endsWith("/USD")) return s.slice(0, -4); // "BTC/USD" -> "BTC"
  const base = s.replace(/USD$/, ""); // "BTCUSD" -> "BTC" (crypto positions)
  if (s !== base && CRYPTO.has(base)) return base;
  return s; // stock/ETF ticker unchanged
}

export class AlpacaBrokerConnector implements BrokerConnector {
  readonly name = "alpaca";

  get mode() {
    // Paper unless the base URL is the live trading host.
    const b = env.broker.baseUrl || "";
    return b.includes("paper-api") || !b ? ("paper" as const) : ("live" as const);
  }

  private base = env.broker.baseUrl || "https://paper-api.alpaca.markets";

  private headers(json = false): HeadersInit {
    return {
      "APCA-API-KEY-ID": env.broker.apiKey,
      "APCA-API-SECRET-KEY": env.broker.apiSecret,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  private ensureConfigured() {
    if (!env.broker.apiKey || !env.broker.apiSecret) {
      throw new BrokerNotConfiguredError(
        "Alpaca non configuré : renseigne BROKER_API_KEY et BROKER_API_SECRET (clés paper).",
      );
    }
  }

  /** Paper mode can always trade (demo). Live mode requires the master switch. */
  private canTrade(): boolean {
    return this.mode === "paper" || env.broker.tradingEnabled === true;
  }

  capabilities(): BrokerCapabilities {
    return { provider: this.name, mode: this.mode, canTrade: this.canTrade(), assetClass: "STOCK", sampleSymbols: ["AAPL", "MSFT", "SPY"] };
  }

  async getAccount(): Promise<BrokerAccount> {
    this.ensureConfigured();
    const res = await fetch(`${this.base}/v2/account`, { headers: this.headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Alpaca ${res.status}`);
    const d = (await res.json()) as any;
    return {
      provider: "alpaca",
      mode: this.mode,
      currency: d.currency ?? "USD",
      cash: Number(d.cash ?? 0),
      equity: Number(d.equity ?? 0),
      buyingPower: Number(d.buying_power ?? 0),
      tradingEnabled: this.mode === "live" && env.broker.tradingEnabled === true,
      connected: true,
      note: this.mode === "paper" ? "Compte paper Alpaca — argent fictif." : "Compte réel Alpaca.",
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    this.ensureConfigured();
    const res = await fetch(`${this.base}/v2/positions`, { headers: this.headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Alpaca ${res.status}`);
    const rows = (await res.json()) as any[];
    return rows.map((p) => ({
      symbol: fromAlpaca(p.symbol),
      side: p.side === "short" ? "SHORT" : "LONG",
      quantity: Number(p.qty),
      entryPrice: Number(p.avg_entry_price),
      currentPrice: Number(p.current_price ?? p.avg_entry_price),
      marketValue: Number(p.market_value ?? 0),
      unrealizedPnl: Number(p.unrealized_pl ?? 0),
    }));
  }

  async getOrders(): Promise<BrokerOrder[]> {
    this.ensureConfigured();
    const res = await fetch(`${this.base}/v2/orders?status=all&limit=50&direction=desc`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Alpaca ${res.status}`);
    const rows = (await res.json()) as any[];
    return rows.map((o) => ({
      id: o.id,
      symbol: fromAlpaca(o.symbol),
      side: o.side === "sell" ? "SELL" : "BUY",
      quantity: Number(o.qty ?? o.notional ?? 0),
      type: o.type ?? "market",
      status: o.status ?? "unknown",
      filledPrice: o.filled_avg_price ? Number(o.filled_avg_price) : null,
      createdAt: o.created_at ?? new Date().toISOString(),
    }));
  }

  async submitOrder(_userId: string, input: BrokerOrderInput): Promise<BrokerOrder> {
    this.ensureConfigured();
    if (!this.canTrade()) {
      throw new BrokerTradingDisabledError(
        "Exécution réelle désactivée (BROKER_TRADING_ENABLED=false).",
      );
    }
    const sym = toAlpaca(input.symbol);
    const body = {
      symbol: sym,
      qty: input.quantity,
      side: input.side.toLowerCase(),
      type: "market",
      time_in_force: sym.includes("/") ? "gtc" : "day",
    };
    const res = await fetch(`${this.base}/v2/orders`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Alpaca ${res.status}: ${await res.text()}`);
    const o = (await res.json()) as any;
    return {
      id: o.id,
      symbol: fromAlpaca(o.symbol),
      side: input.side,
      quantity: Number(o.qty ?? input.quantity),
      type: o.type ?? "market",
      status: o.status ?? "accepted",
      filledPrice: o.filled_avg_price ? Number(o.filled_avg_price) : null,
      createdAt: o.created_at ?? new Date().toISOString(),
    };
  }

  async closePosition(userId: string, symbol: string): Promise<void> {
    this.ensureConfigured();
    if (!this.canTrade()) {
      throw new BrokerTradingDisabledError("Exécution réelle désactivée.");
    }
    // Close by submitting the opposite market order for the held quantity —
    // works uniformly for stocks and crypto without endpoint quirks.
    const positions = await this.getPositions();
    const pos = positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());
    if (!pos) throw new Error(`Aucune position ouverte pour ${symbol}`);
    await this.submitOrder(userId, {
      symbol,
      side: pos.side === "LONG" ? "SELL" : "BUY",
      quantity: pos.quantity,
    });
  }
}
