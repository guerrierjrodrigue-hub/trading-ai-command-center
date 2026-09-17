"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Search, Send, Sparkles } from "lucide-react";
import { AiBadge, Card, SectionTitle } from "@/components/ui";
import { AnalysisCard } from "@/components/copilot/AnalysisCard";
import { apiGet, apiSend } from "@/lib/client";
import type { AssetAnalysis } from "@/services/ai/types";

interface KnowledgeHit {
  id: string;
  page: number;
  section: string;
  title: string;
  text: string;
  score: number;
}

function KnowledgeSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  const [meta, setMeta] = useState<{ source: string; chunks: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const res = await apiGet<{ meta: { source: string; chunks: number }; hits: KnowledgeHit[] }>(
        `/api/knowledge?q=${encodeURIComponent(q)}&k=5`,
      );
      setHits(res.hits);
      setMeta(res.meta);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Base de connaissances"
        subtitle={meta ? `${meta.source} · ${meta.chunks} passages` : "Cherche dans ton manuel de trading"}
        action={<BookOpen className="h-5 w-5 text-accent-soft" />}
      />
      <form onSubmit={run} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. Fibonacci, gestion du risque, divergence RSI…" className="input" />
        <button type="submit" className="btn-ghost" disabled={busy}>
          <Search className="h-4 w-4" />
        </button>
      </form>
      {hits && (
        <div className="mt-3 space-y-2">
          {hits.length === 0 ? (
            <p className="text-sm text-faint">Aucun passage trouvé pour cette recherche.</p>
          ) : (
            hits.map((h) => (
              <details key={h.id} className="rounded-lg border border-border bg-bg-soft p-3">
                <summary className="cursor-pointer text-sm font-medium text-white">
                  {h.title} <span className="text-xs text-faint">· p.{h.page}</span>
                </summary>
                <p className="mt-2 whitespace-pre-line text-sm text-muted">{h.text}</p>
              </details>
            ))
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-faint">Ces passages nourrissent aussi automatiquement les réponses du co-pilote.</p>
    </Card>
  );
}

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "assistant"; analysis: AssetAnalysis };

const SUGGESTIONS = [
  "Analyse BTC",
  "Analyse ETH",
  "Analyse NVDA",
  "Explique-moi le RSI comme à un débutant",
  "Quels sont les risques d'un trade en tendance ?",
];

/** Loading indicator that counts elapsed seconds and reassures on slow local AI. */
function Thinking() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="max-w-2xl rounded-xl border border-border bg-bg-card p-3 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
        Le co-pilote réfléchit… <span className="tnum text-faint">{secs}s</span>
      </span>
      {secs >= 6 && (
        <p className="mt-1 text-xs text-faint">
          L&apos;IA locale (Ollama) peut prendre 10–40 s selon ta machine. Une analyse de secours s&apos;affiche si elle dépasse le délai.
        </p>
      )}
    </div>
  );
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sym = new URLSearchParams(window.location.search).get("symbol");
    if (sym) void send(`Analyse ${sym}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);
    try {
      const res = await apiSend<
        { type: "analysis"; analysis: AssetAnalysis } | { type: "text"; text: string }
      >("/api/ai/chat", "POST", { message: msg });
      if (res.type === "analysis") {
        setMessages((m) => [...m, { role: "assistant", analysis: res.analysis }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: res.text }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Erreur : ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">AI Copilot</h1>
        <AiBadge />
      </div>
      <p className="text-sm text-muted">
        Demande <span className="text-accent-soft">« Analyse &lt;SYMBOLE&gt; »</span> (ex. « Analyse BTC »)
        pour une analyse structurée, ou pose une question libre.
      </p>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="btn-ghost text-xs">
            <Sparkles className="h-3.5 w-3.5" /> {s}
          </button>
        ))}
      </div>

      <KnowledgeSearch />

      <div className="space-y-4">
        {messages.length === 0 && (
          <Card>
            <p className="text-sm text-muted">
              Le co-pilote raisonne en scénarios probabilistes et ne donne jamais de garantie de profit.
              Commence par une suggestion ci-dessus.
            </p>
          </Card>
        )}
        {messages.map((m, i) =>
          "analysis" in m ? (
            <AnalysisCard key={i} a={m.analysis} />
          ) : (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-2xl rounded-xl bg-accent/15 p-3 text-sm text-white ring-1 ring-accent/25"
                  : "max-w-2xl rounded-xl border border-border bg-bg-card p-3 text-sm text-muted"
              }
            >
              {m.text.split("\n").map((line, j) => (
                <p key={j} className={line.trim() === "" ? "h-2" : ""}>{line}</p>
              ))}
            </div>
          ),
        )}
        {loading && <Thinking />}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-0 flex gap-2 border-t border-border bg-bg py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Analyse BTC, compare ETH et SOL, explique le MACD…"
          className="input"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
