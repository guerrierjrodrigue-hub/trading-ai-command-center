"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { AiBadge, Badge, Card, Empty, ErrorNote, SectionTitle, Spinner } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { JournalInsight } from "@/services/ai/types";

interface Entry {
  id: string;
  symbol: string;
  strategy: string | null;
  side: string;
  entryPrice: number | null;
  exitPrice: number | null;
  result: string | null;
  pnl: number | null;
  emotion: string | null;
  reason: string | null;
  tradedAt: string;
}

export default function JournalPage() {
  const j = useFetch<{ entries: Entry[] }>("/api/journal");
  const [form, setForm] = useState({
    symbol: "",
    strategy: "",
    side: "LONG",
    entryPrice: "",
    exitPrice: "",
    result: "OPEN",
    pnl: "",
    emotion: "",
    reason: "",
  });
  const [insight, setInsight] = useState<JournalInsight | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiSend("/api/journal", "POST", {
        symbol: form.symbol.toUpperCase(),
        strategy: form.strategy || undefined,
        side: form.side,
        entryPrice: form.entryPrice ? Number(form.entryPrice) : undefined,
        exitPrice: form.exitPrice ? Number(form.exitPrice) : undefined,
        result: form.result,
        pnl: form.pnl ? Number(form.pnl) : undefined,
        emotion: form.emotion || undefined,
        reason: form.reason || undefined,
      });
      setForm({ ...form, symbol: "", entryPrice: "", exitPrice: "", pnl: "", reason: "" });
      await j.refetch();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      setInsight(await apiSend<JournalInsight>("/api/ai/analyze", "POST", { kind: "JOURNAL" }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Trading Journal</h1>
      {error && <ErrorNote message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionTitle title="Nouvelle entrée" />
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Actif</label><input className="input" value={form.symbol} onChange={set("symbol")} required /></div>
              <div>
                <label className="label">Sens</label>
                <select className="input" value={form.side} onChange={set("side")}>
                  <option>LONG</option><option>SHORT</option>
                </select>
              </div>
              <div><label className="label">Entrée</label><input className="input" value={form.entryPrice} onChange={set("entryPrice")} /></div>
              <div><label className="label">Sortie</label><input className="input" value={form.exitPrice} onChange={set("exitPrice")} /></div>
              <div>
                <label className="label">Résultat</label>
                <select className="input" value={form.result} onChange={set("result")}>
                  <option>OPEN</option><option>WIN</option><option>LOSS</option><option>BREAKEVEN</option>
                </select>
              </div>
              <div><label className="label">P&L</label><input className="input" value={form.pnl} onChange={set("pnl")} /></div>
            </div>
            <div><label className="label">Stratégie</label><input className="input" value={form.strategy} onChange={set("strategy")} placeholder="EMA crossover, breakout…" /></div>
            <div><label className="label">Émotion</label><input className="input" value={form.emotion} onChange={set("emotion")} placeholder="calm, fomo, fear, disciplined…" /></div>
            <div><label className="label">Raison</label><input className="input" value={form.reason} onChange={set("reason")} /></div>
            <button type="submit" className="btn-primary w-full">Enregistrer</button>
          </form>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SectionTitle
              title="Analyse IA du journal"
              action={<button onClick={analyze} disabled={analyzing} className="btn-primary text-xs"><Bot className="h-4 w-4" /> {analyzing ? "Analyse…" : "Analyser mon journal"}</button>}
            />
            {!insight ? (
              <p className="text-sm text-faint">
                Clique pour que le co-pilote analyse tes entrées : erreurs récurrentes, meilleures stratégies, discipline de risque.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2"><AiBadge /></div>
                <p className="text-sm text-white">{insight.summary}</p>
                {insight.patterns.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-faint">Patterns</div>
                    <ul className="list-inside list-disc text-sm text-muted">{insight.patterns.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                {insight.suggestions.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-faint">Suggestions</div>
                    <ul className="list-inside list-disc text-sm text-muted">{insight.suggestions.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                <p className="text-[11px] text-faint">{insight.disclaimer}</p>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle title="Entrées" subtitle={j.data ? `${j.data.entries.length} entrées` : undefined} />
            {j.loading ? (
              <Spinner />
            ) : !j.data?.entries.length ? (
              <Empty message="Journal vide." />
            ) : (
              <div className="space-y-2">
                {j.data.entries.map((e) => (
                  <div key={e.id} className="rounded-lg border border-border bg-bg-soft p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{e.symbol}</span>
                        <Badge tone={e.side === "LONG" ? "pos" : "neg"}>{e.side}</Badge>
                        {e.result && (
                          <Badge tone={e.result === "WIN" ? "pos" : e.result === "LOSS" ? "neg" : "neutral"}>{e.result}</Badge>
                        )}
                        {e.emotion && <Badge tone="warn">{e.emotion}</Badge>}
                      </div>
                      {e.pnl !== null && (
                        <span className={cn("tnum text-sm", e.pnl >= 0 ? "text-pos" : "text-neg")}>{formatCurrency(e.pnl)}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-faint">
                      {new Date(e.tradedAt).toLocaleDateString("fr-CA")} · {e.strategy ?? "—"}
                      {e.reason ? ` · ${e.reason}` : ""}
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
