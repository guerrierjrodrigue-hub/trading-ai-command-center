"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { Card, ErrorNote, Spinner } from "@/components/ui";
import { CandleChart } from "@/components/charts/CandleChart";
import { apiGet } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { Candle, Quote } from "@/services/market/types";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"] as const;

export default function ChartsPage() {
  const [symbol, setSymbol] = useState("BTC");
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("1D");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("symbol");
    if (s) setSymbol(s.toUpperCase());
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ candles: Candle[] }>(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&limit=300`),
      apiGet<Quote>(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`),
    ])
      .then(([c, q]) => {
        if (cancel) return;
        setCandles(c.candles);
        setQuote(q);
      })
      .catch((e) => !cancel && setError((e as Error).message))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [symbol, tf]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            className="input w-40"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          {quote && (
            <div className="tnum">
              <span className="text-xl font-semibold text-white">{formatCurrency(quote.price)}</span>{" "}
              <span className={cn("text-sm", quote.changePct24h >= 0 ? "text-pos" : "text-neg")}>
                {formatPct(quote.changePct24h)}
              </span>
            </div>
          )}
        </div>
        <Link href={`/copilot?symbol=${encodeURIComponent(symbol)}`} className="btn-primary text-xs">
          <Bot className="h-4 w-4" /> Analyse IA
        </Link>
      </div>

      <div className="flex flex-wrap gap-1">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium",
              tf === t ? "bg-accent/20 text-accent-soft" : "text-muted hover:bg-bg-hover",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} />}

      <Card>
        {loading && !candles ? (
          <Spinner label="Chargement du graphique…" />
        ) : candles && candles.length ? (
          <CandleChart candles={candles} />
        ) : (
          <p className="text-sm text-faint">Aucune donnée.</p>
        )}
        <p className="mt-2 text-[11px] text-faint">
          Chandeliers + EMA20 (violet) / EMA50 (cyan) + volume + RSI(14). Source : {quote?.source ?? "—"}.
        </p>
      </Card>
    </div>
  );
}
