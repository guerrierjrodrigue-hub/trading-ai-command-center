"use client";

import { Badge, Card, Empty, ErrorNote, PaperBadge, SectionTitle, Spinner, Stat } from "@/components/ui";
import { AllocationChart, EquityCurveChart } from "@/components/charts/PortfolioCharts";
import { useFetch } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { PortfolioState } from "@/services/trading/state";

interface HistoryRow {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  closedAt: string;
}

export default function PortfolioPage() {
  const pf = useFetch<PortfolioState & { history: HistoryRow[] }>("/api/portfolio");
  const m = pf.data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Portfolio</h1>
        <PaperBadge />
      </div>

      {pf.error && <ErrorNote message={pf.error} />}
      {pf.loading && <Spinner />}

      {m && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Equity" value={formatCurrency(m.equity, pf.data!.currency)} changePct={m.totalReturnPct} />
            <Stat label="Capital de départ" value={formatCurrency(m.startingCapital)} />
            <Stat label="Investi (coût)" value={formatCurrency(m.investedCost)} hint={`${m.exposurePct}% exposé`} />
            <Stat label="Max drawdown" value={`${m.maxDrawdownPct}%`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle title="Equity curve" subtitle="Capital cumulé (réalisé) → valeur actuelle" />
              <EquityCurveChart data={m.equityCurve} />
            </Card>
            <Card>
              <SectionTitle title="Allocation" />
              <AllocationChart data={m.allocation} />
              <div className="mt-3 space-y-1">
                {m.allocation.map((a) => (
                  <div key={a.label} className="flex justify-between text-xs">
                    <span className="text-muted">{a.label}</span>
                    <span className="tnum text-white">{a.pct}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle title="Positions ouvertes" />
            {!pf.data?.positions.length ? (
              <Empty message="Aucune position ouverte." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-faint">
                    <tr>
                      <th className="pb-2">Actif</th>
                      <th className="pb-2">Sens</th>
                      <th className="pb-2 text-right">Qté</th>
                      <th className="pb-2 text-right">Entrée</th>
                      <th className="pb-2 text-right">Prix</th>
                      <th className="pb-2 text-right">P&L latent</th>
                    </tr>
                  </thead>
                  <tbody className="tnum">
                    {pf.data.positions.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-2 font-medium text-white">{p.symbol}</td>
                        <td className="py-2"><Badge tone={p.side === "LONG" ? "pos" : "neg"}>{p.side}</Badge></td>
                        <td className="py-2 text-right">{p.quantity}</td>
                        <td className="py-2 text-right">{formatCurrency(p.entryPrice)}</td>
                        <td className="py-2 text-right">{formatCurrency(p.currentPrice)}</td>
                        <td className={cn("py-2 text-right", p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>
                          {formatCurrency(p.unrealizedPnl)} ({formatPct(p.unrealizedPnlPct)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle title="Historique (trades clôturés)" />
            {!pf.data?.history.length ? (
              <Empty message="Aucun trade clôturé pour l'instant." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-faint">
                    <tr>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Actif</th>
                      <th className="pb-2">Sens</th>
                      <th className="pb-2 text-right">Entrée</th>
                      <th className="pb-2 text-right">Sortie</th>
                      <th className="pb-2 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="tnum">
                    {pf.data.history.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2 text-muted">{new Date(t.closedAt).toLocaleDateString("fr-CA")}</td>
                        <td className="py-2 font-medium text-white">{t.symbol}</td>
                        <td className="py-2"><Badge tone={t.side === "LONG" ? "pos" : "neg"}>{t.side}</Badge></td>
                        <td className="py-2 text-right">{formatCurrency(t.entryPrice)}</td>
                        <td className="py-2 text-right">{formatCurrency(t.exitPrice)}</td>
                        <td className={cn("py-2 text-right", t.pnl >= 0 ? "text-pos" : "text-neg")}>
                          {formatCurrency(t.pnl)} ({formatPct(t.pnlPct)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
