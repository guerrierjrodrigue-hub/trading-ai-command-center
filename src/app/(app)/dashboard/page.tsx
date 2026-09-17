"use client";

import Link from "next/link";
import {
  AiBadge,
  Badge,
  Card,
  Empty,
  ErrorNote,
  PaperBadge,
  ScoreBar,
  SectionTitle,
  Spinner,
  Stat,
  TrendBadge,
} from "@/components/ui";
import { useFetch } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { PortfolioState } from "@/services/trading/state";
import type { ScanResult } from "@/services/scanner/scanner";

interface WatchItem {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePct24h: number;
  trend: string;
}

export default function DashboardPage() {
  const pf = useFetch<PortfolioState>("/api/portfolio");
  const wl = useFetch<{ items: WatchItem[] }>("/api/watchlist");
  const scan = useFetch<{ results: ScanResult[] }>("/api/scanner?minScore=0");

  const m = pf.data?.metrics;
  const avgScore =
    scan.data?.results.length
      ? Math.round(
          scan.data.results.reduce((s, r) => s + r.score, 0) / scan.data.results.length,
        )
      : null;
  const sentiment =
    avgScore === null ? "—" : avgScore >= 60 ? "Risk-On" : avgScore <= 45 ? "Risk-Off" : "Neutre";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <PaperBadge />
      </div>

      {pf.error && <ErrorNote message={pf.error} />}
      {pf.loading && <Spinner />}

      {m && m.trades === 0 && m.openPositions === 0 && (
        <Link
          href="/onboarding"
          className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 p-4 transition-colors hover:bg-accent/15"
        >
          <div>
            <div className="font-medium text-white">Première visite ? Commence par le guide 👋</div>
            <div className="text-sm text-muted">Un parcours en 6 étapes pour prendre l&apos;outil en main, sans risque (simulation).</div>
          </div>
          <span className="btn-primary text-xs">Ouvrir le guide</span>
        </Link>
      )}

      {m && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Valeur du portefeuille" value={formatCurrency(m.equity, pf.data!.currency)} changePct={m.totalReturnPct} />
          <Stat label="P&L du jour (réalisé)" value={formatCurrency(m.pnlToday)} hint="trades clôturés aujourd'hui" />
          <Stat label="P&L total" value={formatCurrency(m.totalPnl)} changePct={m.totalReturnPct} />
          <Stat label="Capital disponible" value={formatCurrency(m.cash)} hint={`exposition ${m.exposurePct}%`} />
        </div>
      )}

      {m && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="P&L latent" value={formatCurrency(m.unrealizedPnl)} />
          <Stat label="P&L réalisé" value={formatCurrency(m.realizedPnl)} />
          <Stat label="Win rate" value={`${m.winRate}%`} hint={`${m.trades} trades`} />
          <Stat label="Max drawdown" value={`${m.maxDrawdownPct}%`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Open positions */}
        <Card className="lg:col-span-2">
          <SectionTitle
            title="Positions ouvertes"
            action={<Link href="/paper-trading" className="btn-ghost">Trader</Link>}
          />
          {!pf.data?.positions.length ? (
            <Empty message="Aucune position ouverte. Passe un ordre dans Paper Trading." />
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
                      <td className="py-2">
                        <Badge tone={p.side === "LONG" ? "pos" : "neg"}>{p.side}</Badge>
                      </td>
                      <td className="py-2 text-right">{p.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(p.entryPrice)}</td>
                      <td className="py-2 text-right">{formatCurrency(p.currentPrice)}</td>
                      <td className={cn("py-2 text-right font-medium", p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>
                        {formatCurrency(p.unrealizedPnl)} ({formatPct(p.unrealizedPnlPct)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Market sentiment + AI brief */}
        <Card>
          <SectionTitle title="Sentiment marché" action={<AiBadge />} />
          <div className="mb-4 flex items-center gap-3">
            <div className="text-3xl font-semibold text-white">{sentiment}</div>
            {avgScore !== null && <Badge tone={avgScore >= 60 ? "pos" : avgScore <= 45 ? "neg" : "warn"}>score moyen {avgScore}</Badge>}
          </div>
          <p className="text-sm text-muted">
            {scan.data?.results.length
              ? `${scan.data.results.filter((r) => r.direction === "LONG").length} actifs en biais long, ${scan.data.results.filter((r) => r.direction === "SHORT").length} en biais short sur ${scan.data.results.length} scannés.`
              : "Scanner en cours…"}
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Résumé automatique basé sur des règles techniques. Scénario, pas une garantie.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Watchlist */}
        <Card>
          <SectionTitle title="Watchlist" action={<Link href="/markets" className="btn-ghost">Gérer</Link>} />
          {wl.loading && <Spinner />}
          {!wl.data?.items.length && !wl.loading ? (
            <Empty message="Watchlist vide." />
          ) : (
            <div className="space-y-1">
              {wl.data?.items.map((it) => (
                <Link
                  key={it.id}
                  href={`/charts?symbol=${encodeURIComponent(it.symbol)}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-bg-hover"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{it.symbol}</div>
                    <div className="text-xs text-faint">{it.name}</div>
                  </div>
                  <div className="flex items-center gap-3 tnum">
                    <TrendBadge trend={it.trend} />
                    <span className="text-sm text-white">{formatCurrency(it.price)}</span>
                    <span className={cn("w-16 text-right text-sm", it.changePct24h >= 0 ? "text-pos" : "text-neg")}>
                      {formatPct(it.changePct24h)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Opportunities */}
        <Card>
          <SectionTitle title="Opportunités détectées" action={<Link href="/scanner" className="btn-ghost">Scanner</Link>} />
          {scan.loading && <Spinner />}
          <div className="space-y-1">
            {scan.data?.results.slice(0, 6).map((r) => (
              <Link
                key={r.symbol}
                href={`/copilot?symbol=${encodeURIComponent(r.symbol)}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-bg-hover"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{r.symbol}</span>
                  <Badge tone={r.direction === "LONG" ? "pos" : r.direction === "SHORT" ? "neg" : "neutral"}>
                    {r.direction}
                  </Badge>
                </div>
                <ScoreBar score={r.score} />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
