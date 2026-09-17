"use client";

import { useEffect, useState } from "react";
import { Landmark, ShieldCheck } from "lucide-react";
import { Badge, Card, Empty, ErrorNote, SectionTitle, Spinner } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";

interface Account {
  provider: string;
  mode: string;
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  connected: boolean;
  note?: string;
}
interface Position {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}
interface Capabilities {
  provider: string;
  mode: string;
  canTrade: boolean;
  assetClass?: "CRYPTO" | "STOCK" | "MIXED";
  sampleSymbols?: string[];
}
interface Order {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  filledPrice: number | null;
  createdAt: string;
}

export default function BrokerPage() {
  const acc = useFetch<{ account: Account; positions: Position[]; capabilities: Capabilities; realTradingEnabled: boolean }>(
    "/api/broker/account",
  );
  const ord = useFetch<{ orders: Order[] }>("/api/broker/orders");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const a = acc.data?.account;
  const caps = acc.data?.capabilities;
  const isPaperInternal = a?.provider === "paper";
  const canTrade = !!caps?.canTrade && !!a?.connected;
  const samples = caps?.sampleSymbols ?? [];

  // Default the symbol to a valid one for THIS broker (avoids e.g. AAPL on Binance).
  useEffect(() => {
    if (!symbol && samples.length) setSymbol(samples[0]);
  }, [samples, symbol]);

  async function refresh() {
    await Promise.all([acc.refetch(), ord.refetch()]);
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await apiSend<{ order: Order }>("/api/broker/orders", "POST", {
        symbol: symbol.toUpperCase(),
        side,
        quantity: Number(qty),
      });
      setMsg(`Ordre envoyé au courtier : ${res.order.side} ${res.order.quantity} ${res.order.symbol} (${res.order.status}).`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function close(sym: string) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/broker/positions/${encodeURIComponent(sym)}/close`, "POST");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Broker</h1>
        <Landmark className="h-5 w-5 text-accent-soft" />
      </div>

      {acc.error && <ErrorNote message={acc.error} />}
      {acc.loading && <Spinner />}

      {a && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Courtier : {a.provider}</Badge>
              <Badge tone={a.mode === "live" ? "warn" : "cyan"}>mode {a.mode}</Badge>
              <Badge tone={a.connected ? "pos" : "neutral"}>{a.connected ? "connecté" : "non configuré"}</Badge>
              <Badge tone={acc.data?.realTradingEnabled ? "neg" : "pos"}>
                <ShieldCheck className="mr-1 h-3 w-3" />
                trading réel : {acc.data?.realTradingEnabled ? "ACTIVÉ" : "DÉSACTIVÉ"}
              </Badge>
            </div>
            {a.note && <p className="mt-3 text-sm text-muted">{a.note}</p>}
          </Card>

          {isPaperInternal ? (
            <Card>
              <SectionTitle title="Connecter un vrai courtier (démo)" />
              <p className="text-sm text-muted">
                Actuellement, c&apos;est le <span className="text-accent-soft">simulateur interne</span>.
                Pour brancher un <b>vrai courtier en mode démo</b> (argent fictif), mets tes clés
                dans <code className="text-accent-soft">.env</code>. Exemple avec{" "}
                <b>Binance Testnet</b> (crypto, dispo au Canada — clés sur testnet.binance.vision) :
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-bg-soft p-3 text-xs text-white">{`BROKER_PROVIDER=binance
BROKER_API_KEY=ta_cle_testnet
BROKER_API_SECRET=ton_secret_testnet
# (laisse BROKER_BASE_URL vide = endpoint testnet)`}</pre>
              <p className="mt-3 text-[11px] text-faint">Puis redémarre l&apos;app. Le trading en vrai argent reste verrouillé.</p>
            </Card>
          ) : !a.connected ? (
            <ErrorNote message={a.note ?? "Courtier non configuré."} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card><div className="text-xs uppercase tracking-wide text-faint">Equity</div><div className="tnum text-xl font-semibold text-white">{formatCurrency(a.equity, a.currency)}</div></Card>
                <Card><div className="text-xs uppercase tracking-wide text-faint">Cash</div><div className="tnum text-xl font-semibold text-white">{formatCurrency(a.cash, a.currency)}</div></Card>
                <Card><div className="text-xs uppercase tracking-wide text-faint">Pouvoir d&apos;achat</div><div className="tnum text-xl font-semibold text-white">{formatCurrency(a.buyingPower, a.currency)}</div></Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <SectionTitle title="Passer un ordre" subtitle={`via ${a.provider} (${a.mode})`} />
                  <form onSubmit={placeOrder} className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1"><label className="label">Actif</label><input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder={samples[0] ?? "BTC"} /></div>
                      <div className="col-span-1">
                        <label className="label">Sens</label>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setSide("BUY")} className={cn("flex-1 text-xs", side === "BUY" ? "btn-pos" : "btn-ghost")}>BUY</button>
                          <button type="button" onClick={() => setSide("SELL")} className={cn("flex-1 text-xs", side === "SELL" ? "btn-neg" : "btn-ghost")}>SELL</button>
                        </div>
                      </div>
                      <div className="col-span-1"><label className="label">Quantité</label><input className="input" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                    </div>
                    {samples.length > 0 && (
                      <p className="text-xs text-faint">
                        {caps?.assetClass === "CRYPTO" ? "Courtier crypto — " : caps?.assetClass === "STOCK" ? "Courtier actions — " : ""}
                        actifs valides : {samples.join(", ")}.
                      </p>
                    )}
                    {!canTrade && <p className="text-xs text-warn">Exécution désactivée pour ce mode.</p>}
                    {msg && <p className="text-sm text-pos">{msg}</p>}
                    {error && <ErrorNote message={error} />}
                    <button type="submit" className="btn-primary" disabled={busy || !canTrade}>
                      {busy ? "Envoi…" : `Envoyer l'ordre ${side}`}
                    </button>
                  </form>
                </Card>

                <Card>
                  <SectionTitle title="Positions" action={<button onClick={refresh} className="btn-ghost text-xs">Rafraîchir</button>} />
                  {!acc.data?.positions.length ? (
                    <Empty message="Aucune position ouverte chez le courtier." />
                  ) : (
                    <div className="space-y-2">
                      {acc.data.positions.map((p) => (
                        <div key={p.symbol} className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-3">
                          <div>
                            <span className="font-medium text-white">{p.symbol}</span>{" "}
                            <Badge tone={p.side === "LONG" ? "pos" : "neg"}>{p.side}</Badge>
                            <div className="tnum text-xs text-faint">{p.quantity} @ {formatCurrency(p.entryPrice, a.currency)} → {formatCurrency(p.currentPrice, a.currency)}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={cn("tnum text-sm", p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>{formatCurrency(p.unrealizedPnl, a.currency)}</span>
                            <button onClick={() => close(p.symbol)} disabled={busy} className="btn-ghost text-xs">Clôturer</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card>
                <SectionTitle title="Ordres récents" />
                {ord.loading ? (
                  <Spinner />
                ) : !ord.data?.orders.length ? (
                  <Empty message="Aucun ordre." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-faint">
                        <tr><th className="pb-2">Date</th><th className="pb-2">Actif</th><th className="pb-2">Sens</th><th className="pb-2 text-right">Qté</th><th className="pb-2 text-right">Prix</th><th className="pb-2">Statut</th></tr>
                      </thead>
                      <tbody className="tnum">
                        {ord.data.orders.map((o) => (
                          <tr key={o.id} className="border-t border-border">
                            <td className="py-2 text-muted">{new Date(o.createdAt).toLocaleString("fr-CA")}</td>
                            <td className="py-2 font-medium text-white">{o.symbol}</td>
                            <td className="py-2"><Badge tone={o.side === "BUY" ? "pos" : "neg"}>{o.side}</Badge></td>
                            <td className="py-2 text-right">{o.quantity}</td>
                            <td className="py-2 text-right">{o.filledPrice != null ? formatCurrency(o.filledPrice, a.currency) : "—"}</td>
                            <td className="py-2 text-muted">{o.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
