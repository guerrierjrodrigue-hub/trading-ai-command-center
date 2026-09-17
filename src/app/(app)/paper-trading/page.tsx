"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorNote, PaperBadge, SectionTitle, Spinner } from "@/components/ui";
import { apiGet, apiSend, useFetch } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { PortfolioState } from "@/services/trading/state";
import type { PositionSizeResult } from "@/services/risk/position-sizing";

export default function PaperTradingPage() {
  const pf = useFetch<PortfolioState>("/api/portfolio");
  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [mode, setMode] = useState<"risk" | "manual">("risk");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [riskPct, setRiskPct] = useState("1");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PositionSizeResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const capital = pf.data?.metrics.equity ?? 0;

  // Live position-size preview.
  useEffect(() => {
    setViolations(null);
    if (mode !== "risk") {
      setPreview(null);
      return;
    }
    const e = Number(entry);
    const s = Number(stop);
    const r = Number(riskPct);
    if (!e || !s || !r || !capital || e === s) {
      setPreview(null);
      return;
    }
    let cancel = false;
    apiSend<PositionSizeResult>("/api/risk/position-size", "POST", {
      capital,
      riskPct: r,
      entry: e,
      stop: s,
    })
      .then((res) => !cancel && setPreview(res))
      .catch(() => !cancel && setPreview(null));
    return () => {
      cancel = true;
    };
  }, [entry, stop, riskPct, capital, mode]);

  async function fillMarketPrice() {
    try {
      const q = await apiGet<{ price: number }>(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
      setEntry(String(q.price));
    } catch {
      /* ignore */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    setError(null);
    setViolations(null);
    try {
      const body: Record<string, unknown> = { symbol, side, reason: reason || undefined };
      if (mode === "risk") {
        body.stopLoss = Number(stop) || undefined;
        body.riskPct = Number(riskPct) || undefined;
        if (entry) body.entryPrice = Number(entry);
        if (takeProfit) body.takeProfit = Number(takeProfit);
      } else {
        body.quantity = Number(quantity) || undefined;
        if (stop) body.stopLoss = Number(stop);
        if (takeProfit) body.takeProfit = Number(takeProfit);
      }
      const res = await apiSend<{ position: { symbol: string; quantity: number; entryPrice: number } }>(
        "/api/paper/orders",
        "POST",
        body,
      );
      setMsg(`Ordre exécuté : ${side} ${res.position.quantity} ${res.position.symbol} @ ${formatCurrency(res.position.entryPrice)}`);
      await pf.refetch();
    } catch (err) {
      setError((err as Error).message);
      const extra = (err as any).extra;
      if (extra?.violations) setViolations(extra.violations);
    } finally {
      setSubmitting(false);
    }
  }

  async function close(id: string) {
    try {
      await apiSend(`/api/paper/positions/${id}/close`, "POST");
      await pf.refetch();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const potentialProfit = useMemo(() => {
    if (!preview || !takeProfit || !entry) return null;
    const rr = Math.abs(Number(takeProfit) - Number(entry)) * preview.quantity;
    return rr;
  }, [preview, takeProfit, entry]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Paper Trading</h1>
        <PaperBadge />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order ticket */}
        <Card>
          <SectionTitle title="Nouvel ordre (simulé)" subtitle="Aucun argent réel n'est engagé" />
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Actif</label>
                <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="label">Sens</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSide("BUY")} className={cn("flex-1", side === "BUY" ? "btn-pos" : "btn-ghost")}>BUY</button>
                  <button type="button" onClick={() => setSide("SELL")} className={cn("flex-1", side === "SELL" ? "btn-neg" : "btn-ghost")}>SELL</button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("risk")} className={cn("flex-1 text-xs", mode === "risk" ? "btn-primary" : "btn-ghost")}>
                Sizing par risque
              </button>
              <button type="button" onClick={() => setMode("manual")} className={cn("flex-1 text-xs", mode === "manual" ? "btn-primary" : "btn-ghost")}>
                Quantité manuelle
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prix d'entrée</label>
                <div className="flex gap-1">
                  <input className="input" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="marché" />
                  <button type="button" onClick={fillMarketPrice} className="btn-ghost text-xs whitespace-nowrap">Marché</button>
                </div>
              </div>
              <div>
                <label className="label">Stop-loss</label>
                <input className="input" value={stop} onChange={(e) => setStop(e.target.value)} />
              </div>
              <div>
                <label className="label">Take-profit</label>
                <input className="input" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
              </div>
              {mode === "risk" ? (
                <div>
                  <label className="label">Risque (%)</label>
                  <input className="input" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="label">Quantité</label>
                  <input className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
              )}
            </div>

            <div>
              <label className="label">Raison de l'entrée (journal)</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. cassure de résistance + volume" />
            </div>

            {preview && (
              <div className="rounded-lg border border-border bg-bg-soft p-3 text-sm">
                <div className="mb-2 text-xs uppercase tracking-wide text-faint">Calcul de taille de position</div>
                <div className="grid grid-cols-2 gap-2 tnum">
                  <span className="text-muted">Direction</span><span className="text-right text-white">{preview.direction}</span>
                  <span className="text-muted">Risque $</span><span className="text-right text-white">{formatCurrency(preview.riskAmount)}</span>
                  <span className="text-muted">Risque / unité</span><span className="text-right text-white">{preview.riskPerUnit}</span>
                  <span className="text-muted">Quantité</span><span className="text-right font-semibold text-accent-soft">{preview.quantity}</span>
                  <span className="text-muted">Notionnel</span><span className="text-right text-white">{formatCurrency(preview.notional)}</span>
                  <span className="text-muted">Perte potentielle (stop)</span><span className="text-right text-neg">{formatCurrency(preview.potentialLoss)}</span>
                  {potentialProfit !== null && (
                    <>
                      <span className="text-muted">Gain potentiel (TP)</span>
                      <span className="text-right text-pos">{formatCurrency(potentialProfit)}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {msg && <p className="rounded-lg bg-pos/10 p-2 text-sm text-pos">{msg}</p>}
            {error && <ErrorNote message={error} />}
            {violations && (
              <ul className="list-inside list-disc space-y-1 rounded-lg border border-neg/40 bg-neg/10 p-3 text-sm text-neg">
                {violations.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Exécution…" : `Placer l'ordre ${side}`}
            </button>
          </form>
        </Card>

        {/* Open positions + capital */}
        <div className="space-y-6">
          <Card>
            <SectionTitle title="Capital" />
            {pf.loading ? (
              <Spinner />
            ) : pf.data ? (
              <div className="grid grid-cols-2 gap-3 tnum text-sm">
                <div><div className="text-faint">Equity</div><div className="text-lg font-semibold text-white">{formatCurrency(pf.data.metrics.equity)}</div></div>
                <div><div className="text-faint">Cash dispo</div><div className="text-lg font-semibold text-white">{formatCurrency(pf.data.metrics.cash)}</div></div>
                <div><div className="text-faint">Exposition</div><div className="text-white">{pf.data.metrics.exposurePct}%</div></div>
                <div><div className="text-faint">Positions</div><div className="text-white">{pf.data.metrics.openPositions}</div></div>
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionTitle title="Positions ouvertes" />
            {!pf.data?.positions.length ? (
              <Empty message="Aucune position ouverte." />
            ) : (
              <div className="space-y-2">
                {pf.data.positions.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{p.symbol}</span>
                        <Badge tone={p.side === "LONG" ? "pos" : "neg"}>{p.side}</Badge>
                      </div>
                      <div className="tnum text-xs text-faint">
                        {p.quantity} @ {formatCurrency(p.entryPrice)} → {formatCurrency(p.currentPrice)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("tnum text-sm font-medium", p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>
                        {formatCurrency(p.unrealizedPnl)} ({formatPct(p.unrealizedPnlPct)})
                      </span>
                      <button onClick={() => close(p.id)} className="btn-ghost text-xs">Clôturer</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
