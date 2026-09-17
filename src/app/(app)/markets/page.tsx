"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Star, Trash2 } from "lucide-react";
import { Badge, Card, ErrorNote, SectionTitle, Spinner } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import { CATALOG } from "@/services/market/catalog";
import type { Quote } from "@/services/market/types";

interface WatchItem {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePct24h: number;
  trend: string;
}

const ALL_SYMBOLS = CATALOG.map((a) => a.symbol).join(",");
const CLASS_BY_SYMBOL = new Map(CATALOG.map((a) => [a.symbol, a.assetClass]));
const NAME_BY_SYMBOL = new Map(CATALOG.map((a) => [a.symbol, a.name]));

export default function MarketsPage() {
  const wl = useFetch<{ items: WatchItem[] }>("/api/watchlist");
  const quotes = useFetch<Quote[]>(`/api/market/quote?symbols=${encodeURIComponent(ALL_SYMBOLS)}`);
  const [filter, setFilter] = useState<string>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const watchedSymbols = useMemo(
    () => new Set(wl.data?.items.map((i) => i.symbol) ?? []),
    [wl.data],
  );

  async function add(symbol: string) {
    setBusy(symbol);
    setErr(null);
    try {
      await apiSend("/api/watchlist", "POST", { symbol });
      await wl.refetch();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await apiSend(`/api/watchlist/${id}`, "DELETE");
      await wl.refetch();
    } finally {
      setBusy(null);
    }
  }

  const filtered = (quotes.data ?? []).filter(
    (q) => filter === "ALL" || CLASS_BY_SYMBOL.get(q.symbol) === filter,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Markets</h1>
      {err && <ErrorNote message={err} />}

      <Card>
        <SectionTitle title="Ma watchlist" subtitle="Suivi personnalisé" />
        {wl.loading ? (
          <Spinner />
        ) : !wl.data?.items.length ? (
          <p className="text-sm text-faint">Aucun actif suivi — ajoute-en depuis la liste ci-dessous.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {wl.data.items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2">
                <Link href={`/charts?symbol=${encodeURIComponent(it.symbol)}`} className="tnum text-sm">
                  <span className="font-medium text-white">{it.symbol}</span>{" "}
                  <span className={it.changePct24h >= 0 ? "text-pos" : "text-neg"}>
                    {formatPct(it.changePct24h)}
                  </span>
                </Link>
                <button onClick={() => remove(it.id)} disabled={busy === it.id} className="text-faint hover:text-neg">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Tous les marchés"
          action={
            <div className="flex gap-1">
              {["ALL", "CRYPTO", "STOCK", "ETF", "FOREX"].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    filter === c ? "bg-accent/20 text-accent-soft" : "text-muted hover:bg-bg-hover",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          }
        />
        {quotes.loading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="pb-2">Actif</th>
                  <th className="pb-2">Classe</th>
                  <th className="pb-2 text-right">Prix</th>
                  <th className="pb-2 text-right">24h</th>
                  <th className="pb-2 text-right">Volume 24h</th>
                  <th className="pb-2 text-right">Suivi</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {filtered.map((q) => (
                  <tr key={q.symbol} className="border-t border-border hover:bg-bg-hover">
                    <td className="py-2">
                      <Link href={`/charts?symbol=${encodeURIComponent(q.symbol)}`} className="font-medium text-white hover:text-accent-soft">
                        {q.symbol}
                      </Link>
                      <div className="text-xs text-faint">{NAME_BY_SYMBOL.get(q.symbol)}</div>
                    </td>
                    <td className="py-2">
                      <Badge>{CLASS_BY_SYMBOL.get(q.symbol)}</Badge>
                    </td>
                    <td className="py-2 text-right text-white">{formatCurrency(q.price)}</td>
                    <td className={cn("py-2 text-right", q.changePct24h >= 0 ? "text-pos" : "text-neg")}>
                      {formatPct(q.changePct24h)}
                    </td>
                    <td className="py-2 text-right text-muted">{Math.round(q.volume24h).toLocaleString("en-US")}</td>
                    <td className="py-2 text-right">
                      {watchedSymbols.has(q.symbol) ? (
                        <Star className="ml-auto h-4 w-4 fill-accent text-accent" />
                      ) : (
                        <button onClick={() => add(q.symbol)} disabled={busy === q.symbol} className="text-faint hover:text-accent-soft">
                          <Plus className="ml-auto h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
