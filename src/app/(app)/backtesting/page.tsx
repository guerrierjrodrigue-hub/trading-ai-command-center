"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Badge, Card, ErrorNote, SectionTitle, Spinner, Stat } from "@/components/ui";
import { EquityCurveChart } from "@/components/charts/PortfolioCharts";
import { apiSend } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { BacktestResult, StrategyType } from "@/services/backtest/engine";
import { strategyFingerprint } from "@/services/bot/strategies/v2h4-gold";
import { TIMEFRAME_SECONDS } from "@/services/market/types";

type PeriodKey = "1m" | "3m" | "6m" | "1y";
const PERIODS: { value: PeriodKey; label: string; days: number }[] = [
  { value: "1m", label: "1 mois", days: 30 },
  { value: "3m", label: "3 mois", days: 90 },
  { value: "6m", label: "6 mois", days: 180 },
  { value: "1y", label: "1 an", days: 365 },
];

/** How many candles a period represents at a given timeframe, clamped to the
 * OANDA pagination hard cap (MAX_PAGINATED_CANDLES in oanda-provider.ts). */
function candlesForPeriod(days: number, timeframe: string): number {
  const seconds = TIMEFRAME_SECONDS[timeframe as keyof typeof TIMEFRAME_SECONDS] ?? 86_400;
  return Math.min(40_000, Math.max(50, Math.ceil((days * 86_400) / seconds)));
}

const STRATEGIES: { value: StrategyType; label: string; hint: string }[] = [
  { value: "EMA_CROSS", label: "EMA Crossover", hint: "Long quand EMA rapide > EMA lente" },
  { value: "MACD", label: "MACD", hint: "Long quand l'histogramme MACD > 0" },
  { value: "RSI", label: "RSI (mean reversion)", hint: "Entrée en survente, sortie en surachat" },
  { value: "BREAKOUT", label: "Breakout (Donchian)", hint: "Cassure du plus haut sur N périodes" },
  { value: "TREND_FOLLOWING", label: "Trend Following", hint: "Long quand prix > SMA longue" },
  { value: "FIB_CONFLUENCE", label: "📘 Fibonacci (livre)", hint: "Retracement Fib + confluence · SL/TP du livre" },
  { value: "BIG_BOUNCE", label: "📘 Big Bounce (livre)", hint: "Rejet sur confluence de support · SL/TP du livre" },
  { value: "BREAK_HOOK_GO", label: "📘 Break-Hook-Go (livre)", hint: "Cassure + retest qui tient · SL/TP du livre" },
  { value: "DIVERGENCE", label: "📘 Divergence (livre)", hint: "Divergence haussière confirmée · SL/TP du livre" },
  { value: "V2H4_GOLD", label: "📘 V2-H4 Or (Donchian 55 H4)", hint: "Cassure Donchian 55 sur H4 (agrégé depuis M15, or) · SL 1,5×ATR · TP 3R" },
];

export default function BacktestingPage() {
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState("1D");
  const [period, setPeriod] = useState<PeriodKey>("3m");
  const [strategy, setStrategy] = useState<StrategyType>("EMA_CROSS");
  const [capital, setCapital] = useState("10000");
  const [fast, setFast] = useState("12");
  const [slow, setSlow] = useState("26");
  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [oversold, setOversold] = useState("30");
  const [overbought, setOverbought] = useState("70");
  const [lookback, setLookback] = useState("20");
  const [smaPeriod, setSmaPeriod] = useState("200");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [v2h4Fingerprint, setV2h4Fingerprint] = useState<string | null>(null);

  useEffect(() => {
    void strategyFingerprint().then((h) => setV2h4Fingerprint(h.slice(0, 12)));
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        symbol: symbol.toUpperCase(),
        timeframe,
        strategy,
        startingCapital: Number(capital) || 10000,
        limit: candlesForPeriod(PERIODS.find((p) => p.value === period)?.days ?? 90, timeframe),
      };
      if (strategy === "EMA_CROSS" || strategy === "MACD") {
        body.fast = Number(fast);
        body.slow = Number(slow);
      }
      if (strategy === "RSI") {
        body.rsiPeriod = Number(rsiPeriod);
        body.oversold = Number(oversold);
        body.overbought = Number(overbought);
      }
      if (strategy === "BREAKOUT") body.lookback = Number(lookback);
      if (strategy === "TREND_FOLLOWING") body.smaPeriod = Number(smaPeriod);

      setResult(await apiSend<BacktestResult>("/api/backtest", "POST", body));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const m = result?.metrics;
  const curve = result?.equityCurve.map((p) => ({
    time: new Date(p.time * 1000).toISOString().slice(0, 10),
    equity: p.equity,
  }));
  const beatsBuyHold = m ? m.totalReturnPct > m.buyHoldReturnPct : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Strategy Backtesting</h1>
        <Badge tone="accent">simulation historique</Badge>
      </div>
      <p className="text-sm text-muted">
        Teste une stratégie sur l'historique d'un actif. Résultat passé ≠ performance future :
        c'est une étude du comportement de la règle, pas une prédiction.
      </p>

      <Card>
        <form onSubmit={run} className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="label">Actif</label>
            <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Timeframe</label>
            <select className="input" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {["15m", "1h", "4h", "1D", "1W"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Période d'historique</label>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Stratégie</label>
            <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyType)}>
              {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Capital</label>
            <input className="input" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </div>

          {(strategy === "EMA_CROSS" || strategy === "MACD") && (
            <>
              <div><label className="label">EMA rapide</label><input className="input" value={fast} onChange={(e) => setFast(e.target.value)} /></div>
              <div><label className="label">EMA lente</label><input className="input" value={slow} onChange={(e) => setSlow(e.target.value)} /></div>
            </>
          )}
          {strategy === "RSI" && (
            <>
              <div><label className="label">Période RSI</label><input className="input" value={rsiPeriod} onChange={(e) => setRsiPeriod(e.target.value)} /></div>
              <div><label className="label">Survente</label><input className="input" value={oversold} onChange={(e) => setOversold(e.target.value)} /></div>
              <div><label className="label">Surachat</label><input className="input" value={overbought} onChange={(e) => setOverbought(e.target.value)} /></div>
            </>
          )}
          {strategy === "BREAKOUT" && (
            <div><label className="label">Lookback (N)</label><input className="input" value={lookback} onChange={(e) => setLookback(e.target.value)} /></div>
          )}
          {strategy === "TREND_FOLLOWING" && (
            <div><label className="label">Période SMA</label><input className="input" value={smaPeriod} onChange={(e) => setSmaPeriod(e.target.value)} /></div>
          )}

          <p className="col-span-2 text-xs text-faint md:col-span-4">
            La période choisie est pleinement respectée pour le forex et l'or (via OANDA, avec pagination
            jusqu'à ~1 an d'historique) ; pour les autres actifs (crypto, actions/ETF), elle reste plafonnée
            à l'historique déjà disponible en un seul appel (≈1000 bougies).
          </p>

          <div className="col-span-2 flex items-end md:col-span-4">
            <button type="submit" className="btn-primary" disabled={loading}>
              <FlaskConical className="h-4 w-4" /> {loading ? "Backtest en cours…" : "Lancer le backtest"}
            </button>
            <span className="ml-3 self-center text-xs text-faint">
              {STRATEGIES.find((s) => s.value === strategy)?.hint}
              {strategy === "V2H4_GOLD" && v2h4Fingerprint && (
                <span className="font-mono"> · empreinte #{v2h4Fingerprint}</span>
              )}
            </span>
          </div>
        </form>
      </Card>

      {error && <ErrorNote message={error} />}
      {loading && <Spinner label="Calcul de la stratégie…" />}

      {m && curve && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Rendement total" value={formatPct(m.totalReturnPct)} changePct={m.totalReturnPct} hint={`vs Buy&Hold ${formatPct(m.buyHoldReturnPct)}`} />
            <Stat label="Capital final" value={formatCurrency(m.finalEquity)} />
            <Stat label="Win rate" value={`${m.winRate}%`} hint={`${m.totalTrades} trades`} />
            <Stat label="Profit factor" value={`${m.profitFactor}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Max drawdown" value={`${m.maxDrawdownPct}%`} />
            <Stat label="Gain moyen" value={formatCurrency(m.avgWin)} />
            <Stat label="Perte moyenne" value={formatCurrency(m.avgLoss)} />
            <Stat label="Durée moy. (barres)" value={`${m.avgHoldingBars}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Expectancy / trade" value={formatCurrency(m.expectancy)} changePct={m.expectancy} hint="gain moyen espéré par trade" />
            <Stat label="Sharpe (annualisé)" value={`${m.sharpe}`} hint="> 1 = bon rendement/risque" />
            <Stat label="Sortino (annualisé)" value={`${m.sortino}`} hint="risque baissier uniquement" />
            <Stat label="Pire série de pertes" value={`${m.worstLossStreak}`} hint={`CAGR ${formatPct(m.cagr)}`} />
          </div>

          {m && result?.inSample && result?.outOfSample && (
            <Card>
              <SectionTitle
                title="Apprentissage vs Test (in-sample / out-of-sample)"
                subtitle="La fenêtre est coupée en deux et backtestée séparément — chaque moitié calcule ses propres indicateurs, sans fuite de l'une vers l'autre."
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-faint">
                    <tr>
                      <th className="pb-2">Segment</th>
                      <th className="pb-2 text-right">Espérance / trade</th>
                      <th className="pb-2 text-right">Profit factor</th>
                      <th className="pb-2 text-right">Trades</th>
                    </tr>
                  </thead>
                  <tbody className="tnum">
                    <tr className="border-t border-border">
                      <td className="py-2 text-muted">Apprentissage ({Math.round((result.splitRatio ?? 0.7) * 100)}% du début)</td>
                      <td className={cn("py-2 text-right font-medium", result.inSample.expectancy >= 0 ? "text-pos" : "text-neg")}>
                        {formatCurrency(result.inSample.expectancy)}
                      </td>
                      <td className="py-2 text-right">{result.inSample.profitFactor}</td>
                      <td className="py-2 text-right text-muted">{result.inSample.totalTrades}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="py-2 text-muted">Test ({Math.round((1 - (result.splitRatio ?? 0.7)) * 100)}% de la fin, jamais vu)</td>
                      <td className={cn("py-2 text-right font-medium", result.outOfSample.expectancy >= 0 ? "text-pos" : "text-neg")}>
                        {formatCurrency(result.outOfSample.expectancy)}
                      </td>
                      <td className="py-2 text-right">{result.outOfSample.profitFactor}</td>
                      <td className="py-2 text-right text-muted">{result.outOfSample.totalTrades}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="py-2 font-medium text-white">Complet</td>
                      <td className={cn("py-2 text-right font-medium", m.expectancy >= 0 ? "text-pos" : "text-neg")}>
                        {formatCurrency(m.expectancy)}
                      </td>
                      <td className="py-2 text-right">{m.profitFactor}</td>
                      <td className="py-2 text-right text-muted">{m.totalTrades}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {m.expectancyCILow != null && m.expectancyCIHigh != null && (
                <div className="mt-4 rounded-lg border border-border bg-bg-hover p-3 text-sm">
                  <div className="font-medium text-white">
                    Espérance (période complète) : {formatCurrency(m.expectancy)} — intervalle de confiance 95 % [{formatCurrency(m.expectancyCILow)}, {formatCurrency(m.expectancyCIHigh)}]
                  </div>
                  <div className="mt-1 text-xs text-faint">
                    P(espérance &gt; 0) ≈ {Math.round((m.expectancyProbPositive ?? 0) * 100)}% sur {m.bootstrapResamples} tirages bootstrap (graine {m.bootstrapSeed}).
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    Si la marge d'erreur de l'espérance inclut 0, l'avantage n'est pas prouvé statistiquement.
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card>
            <SectionTitle
              title="Courbe de capital"
              action={<Badge tone={beatsBuyHold ? "pos" : "neg"}>{beatsBuyHold ? "Bat le Buy & Hold" : "Sous le Buy & Hold"}</Badge>}
            />
            <EquityCurveChart data={curve} />
          </Card>

          <Card>
            <SectionTitle title="Trades" subtitle={`${result.trades.length} opérations simulées`} />
            {result.trades.length === 0 ? (
              <p className="text-sm text-faint">Aucun trade généré sur cette période avec cette stratégie.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-bg-card text-left text-xs uppercase tracking-wide text-faint">
                    <tr>
                      <th className="pb-2">Entrée</th>
                      <th className="pb-2">Sortie</th>
                      <th className="pb-2 text-right">Prix entrée</th>
                      <th className="pb-2 text-right">Prix sortie</th>
                      <th className="pb-2 text-right">Barres</th>
                      <th className="pb-2 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="tnum">
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-2 text-muted">{new Date(t.entryTime * 1000).toLocaleDateString("fr-CA")}</td>
                        <td className="py-2 text-muted">{new Date(t.exitTime * 1000).toLocaleDateString("fr-CA")}</td>
                        <td className="py-2 text-right">{formatCurrency(t.entryPrice)}</td>
                        <td className="py-2 text-right">{formatCurrency(t.exitPrice)}</td>
                        <td className="py-2 text-right text-muted">{t.bars}</td>
                        <td className={cn("py-2 text-right font-medium", t.pnl >= 0 ? "text-pos" : "text-neg")}>
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
