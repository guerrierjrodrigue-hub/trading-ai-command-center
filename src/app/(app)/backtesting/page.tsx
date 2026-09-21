"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Badge, Card, ErrorNote, SectionTitle, Spinner, Stat } from "@/components/ui";
import { EquityCurveChart } from "@/components/charts/PortfolioCharts";
import { apiSend } from "@/lib/client";
import { cn, formatCurrency, formatPct } from "@/lib/utils";
import type { BacktestResult, StrategyType } from "@/services/backtest/engine";

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
        limit: 300,
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
              {["1h", "4h", "1D", "1W"].map((t) => <option key={t}>{t}</option>)}
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

          <div className="col-span-2 flex items-end md:col-span-4">
            <button type="submit" className="btn-primary" disabled={loading}>
              <FlaskConical className="h-4 w-4" /> {loading ? "Backtest en cours…" : "Lancer le backtest"}
            </button>
            <span className="ml-3 self-center text-xs text-faint">
              {STRATEGIES.find((s) => s.value === strategy)?.hint}
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
