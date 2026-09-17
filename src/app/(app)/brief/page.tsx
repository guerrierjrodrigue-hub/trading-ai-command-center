"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  AiBadge,
  Badge,
  Card,
  Empty,
  ErrorNote,
  ScoreBar,
  SectionTitle,
  Spinner,
  Stat,
  TrendBadge,
} from "@/components/ui";
import { useFetch } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { MarketBrief } from "@/services/brief/market-brief";

export default function BriefPage() {
  const b = useFetch<MarketBrief>("/api/brief");
  const brief = b.data;

  const sentimentTone =
    brief?.sentiment === "Risk-On" ? "pos" : brief?.sentiment === "Risk-Off" ? "neg" : "warn";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Today&apos;s Market Brief</h1>
          <AiBadge />
        </div>
        <button onClick={() => b.refetch()} className="btn-ghost text-xs" disabled={b.loading}>
          <RefreshCw className={cn("h-4 w-4", b.loading && "animate-spin")} /> Régénérer
        </button>
      </div>

      {b.error && <ErrorNote message={b.error} />}
      {b.loading && !brief && <Spinner label="Génération du briefing…" />}

      {brief && (
        <>
          <Card className="border-accent/30 bg-gradient-to-br from-bg-card to-accent/5">
            <div className="mb-3 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-accent-soft" />
              <div>
                <div className="text-xs uppercase tracking-wide text-faint">
                  {new Date(brief.generatedAt).toLocaleString("fr-CA")}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-white">Sentiment : {brief.sentiment}</span>
                  <Badge tone={sentimentTone as any}>score moyen {brief.avgScore}/100</Badge>
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted">{brief.overview}</p>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Equity" value={formatCurrency(brief.positions.equity)} />
            <Stat label="Positions ouvertes" value={`${brief.positions.count}`} hint={`expo ${brief.positions.exposurePct}%`} />
            <Stat label="P&L latent" value={formatCurrency(brief.positions.unrealizedPnl)} />
            <Stat label="P&L du jour" value={formatCurrency(brief.positions.pnlToday)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title="Meilleures opportunités" action={<Link href="/scanner" className="btn-ghost text-xs">Scanner</Link>} />
              {brief.topOpportunities.length === 0 ? (
                <Empty message="Aucune opportunité notable." />
              ) : (
                <div className="space-y-1">
                  {brief.topOpportunities.map((o) => (
                    <Link
                      key={o.symbol}
                      href={`/copilot?symbol=${encodeURIComponent(o.symbol)}`}
                      className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-bg-hover"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{o.symbol}</span>
                        <Badge tone={o.direction === "LONG" ? "pos" : o.direction === "SHORT" ? "neg" : "neutral"}>{o.direction}</Badge>
                        <span className="text-xs text-faint">{o.setup}</span>
                      </div>
                      <ScoreBar score={o.score} />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle title="Plus fortes variations (24h)" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-pos">Hausses</div>
                  {brief.gainers.map((m) => (
                    <div key={m.symbol} className="flex justify-between py-1 text-sm">
                      <span className="text-white">{m.symbol}</span>
                      <span className="tnum text-pos">{formatPct(m.changePct24h)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-neg">Baisses</div>
                  {brief.losers.map((m) => (
                    <div key={m.symbol} className="flex justify-between py-1 text-sm">
                      <span className="text-white">{m.symbol}</span>
                      <span className="tnum text-neg">{formatPct(m.changePct24h)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title="Ta watchlist" action={<Link href="/markets" className="btn-ghost text-xs">Gérer</Link>} />
              {brief.watchlist.length === 0 ? (
                <Empty message="Watchlist vide." />
              ) : (
                <div className="space-y-1">
                  {brief.watchlist.map((w) => (
                    <div key={w.symbol} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{w.symbol}</span>
                        <TrendBadge trend={w.trend} />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn("tnum text-sm", w.changePct24h >= 0 ? "text-pos" : "text-neg")}>{formatPct(w.changePct24h)}</span>
                        <ScoreBar score={w.score} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle title="Points de vigilance" />
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                {brief.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Card>
          </div>

          <p className="text-[11px] leading-relaxed text-faint">{brief.disclaimer}</p>
        </>
      )}
    </div>
  );
}
