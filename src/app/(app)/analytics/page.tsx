"use client";

import { BarChart3, TrendingDown, Trophy } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Card, Empty, ErrorNote, PaperBadge, SectionTitle, Spinner, Stat } from "@/components/ui";
import { useFetch } from "@/lib/client";
import { cn, formatCurrency, formatNumber, formatPct } from "@/lib/utils";

interface StatsBlock {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  expectancy: number;
  avgPnlPct: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  avgHoldHours: number;
}
interface SymbolBreakdown extends StatsBlock {
  symbol: string;
}
interface DrawdownPoint {
  time: string;
  equity: number;
  drawdownPct: number;
}
interface Benchmark {
  symbol: string;
  periodStart: string;
  strategyReturnPct: number;
  buyHoldReturnPct: number;
  edgePct: number;
}
interface Analytics {
  overall: StatsBlock;
  bySource: { BOT: StatsBlock; USER: StatsBlock };
  bySymbol: SymbolBreakdown[];
  drawdownSeries: DrawdownPoint[];
  maxDrawdownPct: number;
  benchmark: Benchmark | null;
  startingCapital: number;
}

function pnlTone(v: number) {
  return v > 0 ? "text-pos" : v < 0 ? "text-neg" : "text-muted";
}

/** Profit factor is clamped at 999 server-side (no losses) — show ∞ for clarity. */
function pf(v: number): string {
  return v >= 999 ? "∞" : `${v}`;
}

function holdLabel(h: number): string {
  if (h <= 0) return "—";
  if (h < 24) return `${formatNumber(h, 1)} h`;
  return `${formatNumber(h / 24, 1)} j`;
}

function SourceCard({ title, s, accent }: { title: string; s: StatsBlock; accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-soft p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-white">{title}</span>
        <Badge tone={s.totalPnl >= 0 ? "pos" : "neg"}>{s.trades} trade(s)</Badge>
      </div>
      {s.trades === 0 ? (
        <p className="text-sm text-faint">Aucun trade clôturé.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tnum">
          <span className="text-muted">P&L total</span>
          <span className={cn("text-right", pnlTone(s.totalPnl))}>{formatCurrency(s.totalPnl)}</span>
          <span className="text-muted">Espérance / trade</span>
          <span className={cn("text-right", pnlTone(s.expectancy))}>{formatCurrency(s.expectancy)}</span>
          <span className="text-muted">Taux de réussite</span>
          <span className="text-right text-white">{s.winRate}%</span>
          <span className="text-muted">Facteur de profit</span>
          <span className="text-right text-white">{pf(s.profitFactor)}</span>
          <span className="text-muted">Gain moyen</span>
          <span className="text-right text-pos">{formatCurrency(s.avgWin)}</span>
          <span className="text-muted">Perte moyenne</span>
          <span className="text-right text-neg">{formatCurrency(s.avgLoss)}</span>
          <span className="text-muted">Durée moyenne</span>
          <span className="text-right text-white">{holdLabel(s.avgHoldHours)}</span>
        </div>
      )}
      <div className={cn("mt-3 h-1 rounded-full", accent)} />
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, error, loading } = useFetch<Analytics>("/api/analytics");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Analytics de performance</h1>
        <BarChart3 className="h-5 w-5 text-accent-soft" />
        <PaperBadge />
      </div>

      {error && <ErrorNote message={error} />}
      {loading && !data && <Spinner label="Calcul des statistiques…" />}

      {data && data.overall.trades === 0 && (
        <Empty message="Aucun trade clôturé pour l'instant. Lance le robot ou passe des ordres en simulation, puis reviens ici." />
      )}

      {data && data.overall.trades > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="P&L réalisé total" value={formatCurrency(data.overall.totalPnl)} changePct={data.overall.avgPnlPct} hint="rendement moyen / trade" />
            <Stat label="Espérance / trade" value={formatCurrency(data.overall.expectancy)} hint={`${data.overall.trades} trade(s) clôturé(s)`} />
            <Stat label="Taux de réussite" value={`${data.overall.winRate}%`} hint={`${data.overall.wins} gagnants · ${data.overall.losses} perdants`} />
            <Stat label="Facteur de profit" value={pf(data.overall.profitFactor)} hint="gains bruts ÷ pertes brutes" />
          </div>

          {/* Robot vs Buy & Hold */}
          <Card>
            <SectionTitle
              title="Robot vs Acheter-et-garder"
              subtitle={data.benchmark ? `Depuis le ${data.benchmark.periodStart}, comparé à un simple achat de ${data.benchmark.symbol}` : "Comparaison indisponible"}
              action={<Trophy className="h-5 w-5 text-warn" />}
            />
            {!data.benchmark ? (
              <Empty message="Pas assez d'historique de marché pour comparer." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-bg-soft p-4">
                  <div className="text-xs uppercase tracking-wide text-faint">Ta stratégie</div>
                  <div className={cn("tnum text-2xl font-semibold", pnlTone(data.benchmark.strategyReturnPct))}>{formatPct(data.benchmark.strategyReturnPct)}</div>
                </div>
                <div className="rounded-lg border border-border bg-bg-soft p-4">
                  <div className="text-xs uppercase tracking-wide text-faint">Acheter & garder {data.benchmark.symbol}</div>
                  <div className={cn("tnum text-2xl font-semibold", pnlTone(data.benchmark.buyHoldReturnPct))}>{formatPct(data.benchmark.buyHoldReturnPct)}</div>
                </div>
                <div className={cn("rounded-lg border p-4", data.benchmark.edgePct >= 0 ? "border-pos/40 bg-pos/10" : "border-neg/40 bg-neg/10")}>
                  <div className="text-xs uppercase tracking-wide text-faint">Écart (edge)</div>
                  <div className={cn("tnum text-2xl font-semibold", pnlTone(data.benchmark.edgePct))}>{formatPct(data.benchmark.edgePct)}</div>
                  <div className="mt-1 text-xs text-muted">{data.benchmark.edgePct >= 0 ? "Ta stratégie fait mieux que le simple achat." : "Le simple achat aurait fait mieux."}</div>
                </div>
              </div>
            )}
          </Card>

          {/* Drawdown over time */}
          <Card>
            <SectionTitle
              title="Courbe de drawdown"
              subtitle={`Perte depuis le dernier sommet · pire drawdown : ${data.maxDrawdownPct}%`}
              action={<TrendingDown className="h-5 w-5 text-neg" />}
            />
            {data.drawdownSeries.length < 2 ? (
              <Empty message="Pas encore assez de points pour tracer la courbe." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.drawdownSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#5a6178" fontSize={11} tickLine={false} />
                  <YAxis stroke="#5a6178" fontSize={11} tickLine={false} width={48} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: "#141722", border: "1px solid #232838", borderRadius: 8, color: "#e7e9ee" }}
                    formatter={(v: number) => [`${v}%`, "Drawdown"]}
                  />
                  <Area type="monotone" dataKey="drawdownPct" stroke="#f43f5e" strokeWidth={2} fill="url(#dd)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Robot vs Manuel */}
          <div>
            <SectionTitle title="Robot vs Manuel" subtitle="Qui trade le mieux : l'Auto-Pilot ou tes ordres manuels ?" />
            <div className="grid gap-4 sm:grid-cols-2">
              <SourceCard title="🤖 Robot (Auto-Pilot)" s={data.bySource.BOT} accent="bg-accent/60" />
              <SourceCard title="👤 Manuel (toi)" s={data.bySource.USER} accent="bg-cyan/60" />
            </div>
          </div>

          {/* Per-asset */}
          <Card>
            <SectionTitle title="Performance par actif" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm tnum">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pr-3">Actif</th>
                    <th className="py-2 pr-3 text-right">Trades</th>
                    <th className="py-2 pr-3 text-right">Réussite</th>
                    <th className="py-2 pr-3 text-right">P&L total</th>
                    <th className="py-2 pr-3 text-right">Espérance</th>
                    <th className="py-2 pr-3 text-right">Fact. profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySymbol.map((r) => (
                    <tr key={r.symbol} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium text-white">{r.symbol}</td>
                      <td className="py-2 pr-3 text-right text-muted">{r.trades}</td>
                      <td className="py-2 pr-3 text-right text-white">{r.winRate}%</td>
                      <td className={cn("py-2 pr-3 text-right", pnlTone(r.totalPnl))}>{formatCurrency(r.totalPnl)}</td>
                      <td className={cn("py-2 pr-3 text-right", pnlTone(r.expectancy))}>{formatCurrency(r.expectancy)}</td>
                      <td className="py-2 pr-3 text-right text-white">{pf(r.profitFactor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-faint">
            Statistiques calculées sur les trades clôturés en simulation. Passé ne préjuge pas du futur — ce sont des mesures, pas des conseils.
          </p>
        </>
      )}
    </div>
  );
}
