"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Badge, Card, ErrorNote, ScoreBar, SectionTitle, Spinner, TrendBadge } from "@/components/ui";
import { apiGet } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { ScanResult } from "@/services/scanner/scanner";

export default function ScannerPage() {
  const [assetClass, setAssetClass] = useState("ALL");
  const [direction, setDirection] = useState("ANY");
  const [minScore, setMinScore] = useState(0);
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (assetClass !== "ALL") q.set("assetClass", assetClass);
      if (direction !== "ANY") q.set("direction", direction);
      q.set("minScore", String(minScore));
      const data = await apiGet<{ results: ScanResult[] }>(`/api/scanner?${q}`);
      setResults(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Run once on mount.
  if (results === null && !loading && !error) void run();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Market Scanner</h1>
      <p className="text-sm text-muted">
        Chaque actif reçoit un <span className="text-accent-soft">AI Opportunity Score</span> (0–100)
        basé sur des règles techniques transparentes (tendance, RSI, MACD, supports/résistances).
        <span className="block text-xs text-faint">La plateforme est long-only : les configurations SHORT/NEUTRAL sont affichées à titre informatif.</span>
      </p>

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Classe d'actif</label>
            <select className="input" value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
              {["ALL", "CRYPTO", "STOCK", "ETF", "FOREX"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Direction</label>
            <select className="input" value={direction} onChange={(e) => setDirection(e.target.value)}>
              {["ANY", "LONG", "SHORT"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Score minimum : {minScore}</label>
            <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-40" />
          </div>
          <button onClick={run} className="btn-primary" disabled={loading}>
            {loading ? "Scan…" : "Lancer le scan"}
          </button>
        </div>
      </Card>

      {error && <ErrorNote message={error} />}

      <Card>
        <SectionTitle title="Résultats" subtitle={results ? `${results.length} actifs` : undefined} />
        {loading && <Spinner label="Analyse des marchés…" />}
        {results && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="pb-2">Actif</th>
                  <th className="pb-2">Direction</th>
                  <th className="pb-2">Setup</th>
                  <th className="pb-2 text-right">RSI</th>
                  <th className="pb-2">Trend</th>
                  <th className="pb-2 text-right">24h</th>
                  <th className="pb-2">Risque</th>
                  <th className="pb-2">Score</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="tnum">
                {results.map((r) => (
                  <Fragment key={r.symbol}>
                    <tr className="border-t border-border">
                      <td className="py-2 font-medium text-white">{r.symbol}</td>
                      <td className="py-2">
                        <Badge tone={r.direction === "LONG" ? "pos" : r.direction === "SHORT" ? "neg" : "neutral"}>
                          {r.direction}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted">
                        {r.setup}
                        {r.direction !== "LONG" && (
                          <span className="ml-2 rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint">
                            info seulement · long only
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">{r.rsi ?? "—"}</td>
                      <td className="py-2"><TrendBadge trend={r.trend} /></td>
                      <td className={cn("py-2 text-right", r.changePct24h >= 0 ? "text-pos" : "text-neg")}>
                        {formatPct(r.changePct24h)}
                      </td>
                      <td className="py-2">
                        <Badge tone={r.risk === "HIGH" ? "neg" : r.risk === "MEDIUM" ? "warn" : "pos"}>{r.risk}</Badge>
                      </td>
                      <td className="py-2"><ScoreBar score={r.score} /></td>
                      <td className="py-2 text-right">
                        <button onClick={() => setExpanded(expanded === r.symbol ? null : r.symbol)} className="text-xs text-accent-soft hover:underline">
                          {expanded === r.symbol ? "Masquer" : "Pourquoi ?"}
                        </button>
                      </td>
                    </tr>
                    {expanded === r.symbol && (
                      <tr className="bg-bg-soft">
                        <td colSpan={9} className="px-2 py-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-faint">Explication du score</span>
                            <Link href={`/copilot?symbol=${encodeURIComponent(r.symbol)}`} className="text-xs text-accent-soft hover:underline">
                              → Analyse IA complète
                            </Link>
                          </div>
                          <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                            {r.reasons.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
