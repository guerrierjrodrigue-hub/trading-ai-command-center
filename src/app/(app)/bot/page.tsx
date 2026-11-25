"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Play, Power } from "lucide-react";
import { Badge, Card, Empty, ErrorNote, PaperBadge, ScoreBar, SectionTitle, Spinner, TrendBadge } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";
import { cn, formatCurrency } from "@/lib/utils";
import { strategyFingerprint } from "@/services/bot/strategies/v2h4-gold";

interface BotConfig {
  enabled: boolean;
  mode: string;
  riskProfile: string;
  strategy: string;
  timeframe: string;
  symbols: string[];
  riskPerTradePct: number;
  stopPct: number;
  takeProfitRR: number;
  maxOpenPositions: number;
  intervalMinutes: number;
  lastRunAt: string | null;
}
interface Profile {
  label: string;
  riskPerTradePct: number;
  maxOpenPositions: number;
  maxExposurePct: number;
  entryScore: number;
  atrMult: number;
  rr: number;
  timeframe: string;
  maxDrawdownPct: number;
  trailPct: number;
  maxHoldMinutes: number;
}
interface BotLog {
  id: string;
  action: string;
  symbol: string | null;
  message: string;
  createdAt: string;
}
interface BotPosition {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}
interface BotInsight {
  symbol: string;
  price: number;
  trend: string;
  regime: string;
  side: "LONG" | "SHORT" | null;
  strategy: string | null;
  quality: number; // unified Trade Score (0..100)
  threshold: number; // Trade Score threshold
  held: boolean;
  willEnter: boolean;
  reason: string;
}
interface StrategyStat {
  strategy: string;
  trades: number;
  winRate: number;
  totalPnl: number;
  expectancy: number;
  disabled: boolean;
}
interface BotStatus {
  enabled: boolean;
  mode: string;
  running: boolean;
  lastRunAt: string | null;
  canOpen: boolean;
  blockReason: string | null;
  openPositions: number;
  maxOpenPositions: number;
  drawdownPct: number;
  maxDrawdownPct: number;
  weeklyLossPct: number;
  maxWeeklyLossPct: number;
  lossStreak: number;
  maxConsecutiveLosses: number;
  dailyLossPct: number;
  maxDailyLossPct: number;
  forexMarketOpen: boolean | null;
}

const STRATEGIES = [
  "EMA_CROSS",
  "MACD",
  "RSI",
  "BREAKOUT",
  "TREND_FOLLOWING",
  "FIB_CONFLUENCE",
  "BIG_BOUNCE",
  "BREAK_HOOK_GO",
  "DIVERGENCE",
  "V2H4_GOLD",
];
const TIMEFRAMES = ["15m", "1h", "4h", "1D", "1W"];

const actionTone: Record<string, "pos" | "neg" | "warn" | "cyan" | "neutral"> = {
  OPEN: "pos",
  CLOSE: "neg",
  HOLD: "neutral",
  SKIP: "warn",
  INFO: "cyan",
  ERROR: "neg",
  HALT: "neg",
  TRAIL: "cyan",
  PARTIAL: "pos",
};

export default function BotPage() {
  const data = useFetch<{ config: BotConfig; profiles: Record<string, Profile>; status: BotStatus; logs: BotLog[]; positions: BotPosition[]; strategies: StrategyStat[]; insight: BotInsight[] }>("/api/bot");
  const [form, setForm] = useState<BotConfig | null>(null);
  const [symbolsText, setSymbolsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoSymbol, setDemoSymbol] = useState("BTC");
  const [demoSide, setDemoSide] = useState<"LONG" | "SHORT">("LONG");
  const [v2h4Fingerprint, setV2h4Fingerprint] = useState<string | null>(null);

  useEffect(() => {
    void strategyFingerprint().then((h) => setV2h4Fingerprint(h.slice(0, 12)));
  }, []);

  useEffect(() => {
    if (data.data?.config && !form) {
      setForm(data.data.config);
      setSymbolsText(data.data.config.symbols.join(", "));
    }
  }, [data.data, form]);

  async function patch(partial: Partial<BotConfig>) {
    setError(null);
    try {
      const res = await apiSend<{ config: BotConfig }>("/api/bot", "PATCH", partial);
      setForm(res.config);
      await data.refetch();
      return res.config;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggle() {
    if (!form) return;
    setBusy(true);
    await patch({ enabled: !form.enabled });
    setBusy(false);
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const symbols = symbolsText.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const res = await patch({
      mode: form.mode,
      riskProfile: form.riskProfile,
      strategy: form.strategy,
      timeframe: form.timeframe,
      symbols,
      riskPerTradePct: Number(form.riskPerTradePct),
      stopPct: Number(form.stopPct),
      takeProfitRR: Number(form.takeProfitRR),
      maxOpenPositions: Number(form.maxOpenPositions),
      intervalMinutes: Number(form.intervalMinutes),
    });
    if (res) setMsg("Configuration enregistrée.");
    setBusy(false);
  }

  async function panic() {
    if (typeof window !== "undefined" && !window.confirm("Arrêt d'urgence : fermer TOUTES les positions ouvertes (simulation) et arrêter le robot ?")) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await apiSend<{ closed: number; message: string }>("/api/bot/panic", "POST");
      setMsg(r.message);
      await data.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await apiSend<{ opened: number; closed: number; message: string }>("/api/bot/run", "POST");
      setMsg(r.message);
      await data.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function demoTrade() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await apiSend<{ message: string }>("/api/bot/demo", "POST", { symbol: demoSymbol, side: demoSide });
      setMsg(r.message);
      await data.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof BotConfig>(k: K, v: BotConfig[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Auto-Pilot</h1>
        <Bot className="h-5 w-5 text-accent-soft" />
        <PaperBadge />
      </div>

      <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
        Le robot applique des stratégies techniques avec gestion du risque et un <b>stop suiveur</b>
        (qui remonte le stop pour protéger les gains), <b>en simulation uniquement</b>. Ce n&apos;est pas un
        conseil financier et il peut subir des pertes (fictives). Aucun ordre réel n&apos;est passé.
      </div>

      {data.error && <ErrorNote message={data.error} />}
      {data.loading && !form && <Spinner />}
      {error && <ErrorNote message={error} />}

      {form && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button onClick={toggle} disabled={busy} className={cn("flex items-center gap-2", form.enabled ? "btn-neg" : "btn-pos")}>
                  <Power className="h-4 w-4" />
                  {form.enabled ? "Arrêter le robot" : "Démarrer le robot"}
                </button>
                <Badge tone={form.enabled ? "pos" : "neutral"}>{form.enabled ? "EN MARCHE" : "ARRÊTÉ"}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-faint">
                  {form.lastRunAt ? `Dernier cycle : ${new Date(form.lastRunAt).toLocaleString("fr-CA")}` : "Jamais exécuté"}
                  {" · "}toutes les {form.intervalMinutes} min
                </span>
                <button onClick={runNow} disabled={busy} className="btn-ghost text-xs">
                  <Play className="h-4 w-4" /> Lancer un cycle maintenant
                </button>
                <button onClick={panic} disabled={busy} className="btn-neg text-xs" title="Ferme toutes les positions (simulation) et arrête le robot">
                  <AlertTriangle className="h-4 w-4" /> Arrêt d&apos;urgence
                </button>
              </div>
            </div>
            {msg && <p className="mt-3 text-sm text-pos">{msg}</p>}

            <div className="mt-4 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-medium text-white">🧪 Trade de démonstration</p>
                  <p className="text-xs text-faint">Ouvre une position tout de suite (simulation) pour VOIR le robot réagir : stop suiveur, profit partiel, sortie. Stop ~1 % / objectif ~2 % pour que ça évolue vite.</p>
                </div>
                <select className="input w-auto" value={demoSymbol} onChange={(e) => setDemoSymbol(e.target.value)}>
                  {["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"].map((s) => <option key={s}>{s}</option>)}
                </select>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setDemoSide("LONG")} className={cn("text-xs", demoSide === "LONG" ? "btn-pos" : "btn-ghost")}>Achat</button>
                  <button type="button" onClick={() => setDemoSide("SHORT")} className={cn("text-xs", demoSide === "SHORT" ? "btn-neg" : "btn-ghost")}>Vente</button>
                </div>
                <button onClick={demoTrade} disabled={busy} className="btn-primary text-xs">Ouvrir le trade démo</button>
              </div>
              <p className="mt-2 text-[11px] text-faint">Le robot doit être <b>en marche</b> pour gérer ensuite la position. C&apos;est de la simulation — aucun ordre réel.</p>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title="Configuration" />
              <form onSubmit={saveConfig} className="space-y-3">
                <div>
                  <label className="label">Mode</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => set("mode", "AUTO")} className={cn("flex-1 text-xs", form.mode === "AUTO" ? "btn-primary" : "btn-ghost")}>🤖 Autonome</button>
                    <button type="button" onClick={() => set("mode", "MANUAL")} className={cn("flex-1 text-xs", form.mode === "MANUAL" ? "btn-primary" : "btn-ghost")}>Manuel</button>
                  </div>
                </div>

                {form.mode === "AUTO" ? (
                  <>
                    <div>
                      <label className="label">Niveau de risque</label>
                      <select className="input" value={form.riskProfile} onChange={(e) => set("riskProfile", e.target.value)}>
                        <option value="CONSERVATIVE">Prudent</option>
                        <option value="BALANCED">Équilibré</option>
                        <option value="AGGRESSIVE">Agressif</option>
                        <option value="INTRADAY">Court terme (intraday)</option>
                      </select>
                    </div>
                    {(() => {
                      const prof = data.data?.profiles?.[form.riskProfile];
                      if (!prof) return null;
                      return (
                        <div className="space-y-1 rounded-lg border border-border bg-bg-soft p-3 text-xs text-muted">
                          <div className="uppercase tracking-wide text-faint">Le robot décide tout, calibré « {prof.label} » :</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 tnum">
                            <span>Risque / trade</span><span className="text-right text-white">{prof.riskPerTradePct}%</span>
                            <span>Positions max</span><span className="text-right text-white">{prof.maxOpenPositions}</span>
                            <span>Exposition max</span><span className="text-right text-white">{prof.maxExposurePct}%</span>
                            <span>Seuil d&apos;entrée (score IA)</span><span className="text-right text-white">≥ {prof.entryScore}</span>
                            <span>Stop-loss</span><span className="text-right text-white">ATR × {prof.atrMult}</span>
                            <span>Objectif R/R</span><span className="text-right text-white">{prof.rr}</span>
                            <span>Coupe-circuit (drawdown)</span><span className="text-right text-white">{prof.maxDrawdownPct}%</span>
                            <span>Stop suiveur (trailing)</span><span className="text-right text-white">{(prof.trailPct * 100).toFixed(0)}%</span>
                            <span>Timeframe</span><span className="text-right text-white">{prof.timeframe}</span>
                            {prof.maxHoldMinutes > 0 ? (
                              <>
                                <span>Sortie sur le temps</span>
                                <span className="text-right text-white">{prof.maxHoldMinutes} min</span>
                              </>
                            ) : null}
                          </div>
                          <div className="text-faint">Actifs choisis automatiquement par le scanner.</div>
                          <div className="text-faint">Stratégie choisie par actif parmi : Fibonacci, Big Bounce, Break-Hook-Go, Divergence — le robot retient le meilleur setup.</div>
                          <div className="text-faint">Entrées confirmées par la tendance de l&apos;horizon supérieur (filtre multi-timeframe), et les stratégies perdantes sont mises en pause automatiquement.</div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Stratégie</label>
                      <select className="input" value={form.strategy} onChange={(e) => set("strategy", e.target.value)}>
                        {STRATEGIES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Timeframe</label>
                      <select className="input" value={form.timeframe} onChange={(e) => set("timeframe", e.target.value)}>
                        {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Risque / trade (%)</label><input className="input" value={form.riskPerTradePct} onChange={(e) => set("riskPerTradePct", e.target.value as unknown as number)} /></div>
                    <div><label className="label">Stop (%)</label><input className="input" value={form.stopPct} onChange={(e) => set("stopPct", e.target.value as unknown as number)} /></div>
                    <div><label className="label">Ratio R/R (take-profit)</label><input className="input" value={form.takeProfitRR} onChange={(e) => set("takeProfitRR", e.target.value as unknown as number)} /></div>
                    <div><label className="label">Positions max</label><input className="input" value={form.maxOpenPositions} onChange={(e) => set("maxOpenPositions", e.target.value as unknown as number)} /></div>
                    <div className="col-span-2">
                      <label className="label">Actifs (vide = ta watchlist)</label>
                      <input className="input" value={symbolsText} onChange={(e) => setSymbolsText(e.target.value)} placeholder="ex. BTC, ETH, SOL" />
                    </div>
                    {["FIB_CONFLUENCE", "BIG_BOUNCE", "BREAK_HOOK_GO", "DIVERGENCE", "V2H4_GOLD"].includes(form.strategy) && (
                      <div className="col-span-2 rounded-lg border border-accent/30 bg-accent/10 p-2 text-xs text-muted">
                        📘 Stratégie du livre : elle calcule elle-même son <b>stop-loss</b> et son <b>take-profit</b>
                        {" "}(Fibonacci : SL 88,6/113 %, TP ext. 127,2 % ; Big Bounce/BHG/Divergence : SL sous le niveau, TP résistance/≈2R ; V2-H4 Or : SL 1,5×ATR, TP 3R).
                        {form.strategy === "V2H4_GOLD" && (
                          <>
                            {" "}Choisis le timeframe 15m (or, XAU/USD) pour qu'elle ait assez d'historique H4.
                            {v2h4Fingerprint && (
                              <>
                                {" "}<span className="font-mono text-faint">empreinte #{v2h4Fingerprint}</span>
                              </>
                            )}
                          </>
                        )}
                        Les champs « Stop (%) » et « R/R » sont alors ignorés.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="label">Intervalle (min)</label>
                  <input className="input" value={form.intervalMinutes} onChange={(e) => set("intervalMinutes", e.target.value as unknown as number)} />
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>Enregistrer</button>
              </form>
            </Card>

            <Card>
              <SectionTitle title="Positions gérées par le robot" />
              {!data.data?.positions.length ? (
                <Empty message="Aucune position ouverte par le robot." />
              ) : (
                <div className="space-y-2">
                  {data.data.positions.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border bg-bg-soft p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{p.symbol}</span>
                          <Badge tone={p.side === "SHORT" ? "cyan" : "pos"}>{p.side === "SHORT" ? "▼ Vente" : "▲ Achat"}</Badge>
                        </div>
                        {p.unrealizedPnl != null ? (
                          <span className={cn("tnum text-sm font-semibold", p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>
                            {p.unrealizedPnl >= 0 ? "+" : ""}{formatCurrency(p.unrealizedPnl)}
                            {p.unrealizedPnlPct != null && <span className="ml-1 text-xs font-normal">({p.unrealizedPnlPct >= 0 ? "+" : ""}{p.unrealizedPnlPct}%)</span>}
                          </span>
                        ) : (
                          <span className="tnum text-faint">{p.quantity} @ {formatCurrency(p.entryPrice)}</span>
                        )}
                      </div>
                      <div className="tnum mt-1 text-xs text-faint">
                        {p.quantity} @ {formatCurrency(p.entryPrice)}
                        {p.currentPrice != null && <> · prix {formatCurrency(p.currentPrice)}</>}
                        {" · "}stop {p.stopLoss ? formatCurrency(p.stopLoss) : "—"} · TP {p.takeProfit ? formatCurrency(p.takeProfit) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {data.data?.status && (
            <Card>
              {(() => {
                const s = data.data.status;
                const tone = !s.enabled ? "warn" : s.blockReason ? "warn" : s.running ? "pos" : "warn";
                const border = tone === "pos" ? "border-pos/40" : "border-warn/40";
                const bg = tone === "pos" ? "bg-pos/5" : "bg-warn/5";
                const title = !s.enabled
                  ? "⏹️ Robot arrêté"
                  : s.blockReason
                    ? "⏸️ Le robot est en pause d'entrées"
                    : s.running
                      ? "✅ Robot actif — il peut ouvrir des positions"
                      : "⚠️ Robot activé mais aucun cycle récent";
                const lastRun = s.lastRunAt ? new Date(s.lastRunAt).toLocaleString("fr-CA") : "jamais";
                return (
                  <div className={cn("rounded-lg border p-3", border, bg)}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white">{title}</span>
                      <button onClick={() => data.refetch()} disabled={data.loading} className="btn-ghost text-xs">
                        Rafraîchir
                      </button>
                    </div>
                    {s.blockReason && <p className="mt-1.5 text-xs text-warn">{s.blockReason}</p>}
                    {s.enabled && !s.running && !s.blockReason && (
                      <p className="mt-1.5 text-xs text-warn">
                        Le robot est activé mais n&apos;a pas tourné depuis plus de 15 min — le planificateur est peut-être en attente de redémarrage du conteneur.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
                      <span>Positions : {s.openPositions}/{s.maxOpenPositions}</span>
                      <span>Pertes consécutives : {s.lossStreak}/{s.maxConsecutiveLosses}</span>
                      <span>Perte 7 j : {s.weeklyLossPct}% / {s.maxWeeklyLossPct}%</span>
                      <span>Perte du jour : {s.dailyLossPct}% / {s.maxDailyLossPct}%</span>
                      <span>Drawdown : {s.drawdownPct}% / {s.maxDrawdownPct}%</span>
                      <span>
                        Marché forex/or :{" "}
                        {s.forexMarketOpen == null ? "—" : s.forexMarketOpen ? "🟢 ouvert" : "🔴 fermé"}
                      </span>
                      <span>Crypto : 🟢 24/7</span>
                      <span>Dernier cycle : {lastRun}</span>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}

          {data.data?.insight && data.data.insight.length > 0 && (
            <Card>
              <SectionTitle
                title="Analyse en direct — pourquoi le robot agit (ou non)"
                subtitle="Pour chaque crypto : la meilleure configuration trouvée, sa qualité, et si c'est assez solide pour entrer"
                action={
                  <button onClick={() => data.refetch()} disabled={data.loading} className="btn-ghost text-xs">
                    Rafraîchir
                  </button>
                }
              />
              <div className="space-y-2">
                {data.data.insight.map((i) => (
                  <div key={i.symbol} className="rounded-lg border border-border bg-bg-soft p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{i.symbol}</span>
                        <TrendBadge trend={i.trend} />
                        <span className="text-[11px] text-faint">{i.regime}</span>
                        {i.side && (
                          <Badge tone={i.side === "SHORT" ? "cyan" : "pos"}>{i.side === "SHORT" ? "config vente" : "config achat"}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {i.strategy && <span className="text-xs text-muted">{i.strategy}</span>}
                        {i.strategy && (
                          <span className={cn("tnum text-xs font-semibold", i.quality >= i.threshold ? "text-pos" : "text-faint")}>
                            score {i.quality}/{i.threshold}
                          </span>
                        )}
                        {i.held ? (
                          <Badge tone="accent">En position</Badge>
                        ) : i.willEnter && data.data?.status && !data.data.status.canOpen ? (
                          <Badge tone="warn">Prêt — robot en pause</Badge>
                        ) : i.willEnter ? (
                          <Badge tone="pos">Prêt à entrer</Badge>
                        ) : (
                          <Badge tone="neutral">En attente</Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-faint">{i.reason}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-faint">
                « En attente » est normal : le robot ne prend une position que lorsqu&apos;une vraie configuration du livre
                atteint le seuil de qualité, dans le sens de la tendance. Il ne force jamais un trade.
              </p>
            </Card>
          )}

          {data.data?.strategies && data.data.strategies.length > 0 && (
            <Card>
              <SectionTitle title="Performance par stratégie" subtitle="Le robot met en pause (auto) les stratégies à espérance négative" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm tnum">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                      <th className="py-2 pr-3">Stratégie</th>
                      <th className="py-2 pr-3 text-right">Trades</th>
                      <th className="py-2 pr-3 text-right">Réussite</th>
                      <th className="py-2 pr-3 text-right">Espérance</th>
                      <th className="py-2 pr-3 text-right">P&L total</th>
                      <th className="py-2 pr-3">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.strategies.map((s) => (
                      <tr key={s.strategy} className="border-b border-border/50">
                        <td className="py-2 pr-3 font-medium text-white">{s.strategy}</td>
                        <td className="py-2 pr-3 text-right text-muted">{s.trades}</td>
                        <td className="py-2 pr-3 text-right text-white">{s.winRate}%</td>
                        <td className={cn("py-2 pr-3 text-right", s.expectancy >= 0 ? "text-pos" : "text-neg")}>{formatCurrency(s.expectancy)}</td>
                        <td className={cn("py-2 pr-3 text-right", s.totalPnl >= 0 ? "text-pos" : "text-neg")}>{formatCurrency(s.totalPnl)}</td>
                        <td className="py-2 pr-3">
                          <Badge tone={s.disabled ? "neg" : "pos"}>{s.disabled ? "En pause" : "Active"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <SectionTitle title="Journal du robot" subtitle="Chaque décision est expliquée" />
            {!data.data?.logs.length ? (
              <Empty message="Aucune activité pour l'instant. Démarre le robot ou lance un cycle." />
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {data.data.logs.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 border-b border-border/60 py-1.5 text-sm">
                    <span className="w-32 shrink-0 text-xs text-faint">{new Date(l.createdAt).toLocaleString("fr-CA")}</span>
                    <Badge tone={actionTone[l.action] ?? "neutral"}>{l.action}</Badge>
                    <span className="text-muted">{l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
