import crypto from "node:crypto";
import { env } from "@/lib/env";
import { round } from "@/lib/utils";
import { getMarketDataProvider } from "@/services/market";
import {
  BrokerNotConfiguredError,
  type BrokerAccount,
  type BrokerCapabilities,
  type BrokerConnector,
  type BrokerOrder,
  type BrokerOrderInput,
  type BrokerPosition,
} from "./types";

/**
 * Binance Spot TESTNET connector — a real exchange sandbox with fictional
 * funds (no KYC, not geo-blocked). Reads the account/positions and places
 * market orders on the testnet. Crypto only. Keys from testnet.binance.vision.
 * All calls are server-side and HMAC-signed; keys come from env only.
 */
const CRYPTO = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"]);
const toPair = (s: string) => `${s.toUpperCase()}USDT`;
const fromPair = (p: string) => p.replace(/USDT$/, "");

export class BinanceTestnetConnector implements BrokerConnector {
  readonly name = "binance";
  readonly mode = "paper" as const;
  private base = env.broker.baseUrl || "https://testnet.binance.vision";

  private ensureConfigured() {
    if (!env.broker.apiKey || !env.broker.apiSecret) {
      throw new BrokerNotConfiguredError(
        "Binance testnet non configuré : renseigne BROKER_API_KEY et BROKER_API_SECRET (clés testnet).",
      );
    }
  }

  capabilities(): BrokerCapabilities {
    return { provider: this.name, mode: "paper", canTrade: true, assetClass: "CRYPTO", sampleSymbols: [...CRYPTO] };
  }

  private async signed(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
    this.ensureConfigured();
    const query = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "5000" });
    const signature = crypto.createHmac("sha256", env.broker.apiSecret).update(query.toString()).digest("hex");
    query.append("signature", signature);
    const res = await fetch(`${this.base}${path}?${query.toString()}`, {
      method,
      headers: { "X-MBX-APIKEY": env.broker.apiKey },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
    return res.json() as Promise<any>;
  }

  private async priceOf(asset: string): Promise<number> {
    try {
      return (await getMarketDataProvider().getQuote(asset)).price;
    } catch {
      return 0;
    }
  }

  async getAccount(): Promise<BrokerAccount> {
    const data = await this.signed("/api/v3/account");
    const balances: { asset: string; amt: number }[] = (data.balances ?? [])
      .map((b: any) => ({ asset: b.asset, amt: Number(b.free) + Number(b.locked) }))
      .filter((b: any) => b.amt > 0);
    const usdt = balances.find((b) => b.asset === "USDT")?.amt ?? 0;
    let holdings = 0;
    for (const b of balances) {
      if (b.asset === "USDT" || !CRYPTO.has(b.asset)) continue;
      holdings += b.amt * (await this.priceOf(b.asset));
    }
    return {
      provider: "binance",
      mode: "paper",
      currency: "USDT",
      cash: round(usdt, 2),
      equity: round(usdt + holdings, 2),
      buyingPower: round(usdt, 2),
      tradingEnabled: false,
      connected: true,
      note: "Binance Testnet — argent fictif (bac à sable).",
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const data = await this.signed("/api/v3/account");
    const out: BrokerPosition[] = [];
    for (const b of data.balances ?? []) {
      const amt = Number(b.free) + Number(b.locked);
      if (amt <= 0 || b.asset === "USDT" || !CRYPTO.has(b.asset)) continue;
      const price = await this.priceOf(b.asset);
      out.push({
        symbol: b.asset,
        side: "LONG",
        quantity: round(amt, 8),
        entryPrice: price, // Binance spot account gives no cost basis
        currentPrice: price,
        marketValue: round(amt * price, 2),
        unrealizedPnl: 0,
      });
    }
    return out;
  }

  async getOrders(): Promise<BrokerOrder[]> {
    const data = await this.signed("/api/v3/openOrders");
    return (data ?? []).map((o: any) => ({
      id: String(o.orderId),
      symbol: fromPair(o.symbol),
      side: o.side === "SELL" ? "SELL" : "BUY",
      quantity: Number(o.origQty),
      type: (o.type ?? "market").toLowerCase(),
      status: o.status ?? "NEW",
      filledPrice: o.price ? Number(o.price) : null,
      createdAt: new Date(o.time ?? Date.now()).toISOString(),
    }));
  }

  async submitOrder(_userId: string, input: BrokerOrderInput): Promise<BrokerOrder> {
    const sym = input.symbol.toUpperCase();
    if (!CRYPTO.has(sym)) {
      throw new Error(`Binance testnet ne gère ici que la crypto : ${[...CRYPTO].join(", ")} (reçu « ${sym} »).`);
    }
    const o = await this.signed(
      "/api/v3/order",
      { symbol: toPair(sym), side: input.side, type: "MARKET", quantity: String(input.quantity) },
      "POST",
    );
    return {
      id: String(o.orderId),
      symbol: sym,
      side: input.side,
      quantity: Number(o.executedQty ?? o.origQty ?? input.quantity),
      type: "market",
      status: o.status ?? "FILLED",
      filledPrice: o.fills?.[0]?.price ? Number(o.fills[0].price) : null,
      createdAt: new Date(o.transactTime ?? Date.now()).toISOString(),
    };
  }

  async closePosition(userId: string, symbol: string): Promise<void> {
    const positions = await this.getPositions();
    const pos = positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());
    if (!pos) throw new Error(`Aucune position ouverte pour ${symbol}`);
    await this.submitOrder(userId, { symbol, side: "SELL", quantity: pos.quantity });
  }
}
