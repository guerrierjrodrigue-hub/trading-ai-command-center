"use client";

import { useEffect, useState } from "react";
import { Badge, Card, ErrorNote, SectionTitle, Spinner } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/client";
import { BrokerCard } from "@/components/broker/BrokerCard";
import { AccountCard } from "@/components/account/AccountCard";
import { TelegramCard } from "@/components/telegram/TelegramCard";

interface Setting {
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  maxPortfolioExposurePct: number;
  feeBps: number;
  startingCapital: number;
  currency: string;
}
interface Providers {
  ai: string;
  aiModel: string | null;
  market: string;
}

export default function SettingsPage() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ setting: Setting; providers: Providers }>("/api/settings")
      .then((d) => {
        setSetting(d.setting);
        setProviders(d.providers);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!setting) return;
    setSaved(false);
    setError(null);
    try {
      const d = await apiSend<{ setting: Setting }>("/api/settings", "PATCH", {
        riskPerTradePct: Number(setting.riskPerTradePct),
        maxDailyLossPct: Number(setting.maxDailyLossPct),
        maxOpenPositions: Number(setting.maxOpenPositions),
        maxPortfolioExposurePct: Number(setting.maxPortfolioExposurePct),
        feeBps: Number(setting.feeBps),
      });
      setSetting(d.setting);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const upd = (k: keyof Setting) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSetting((s) => (s ? { ...s, [k]: e.target.value as unknown as number } : s));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>
      {error && <ErrorNote message={error} />}
      {loading && <Spinner />}

      {setting && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle title="Gestion du risque" subtitle="Appliquée à chaque ordre paper" />
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Risque / trade (%)</label><input className="input" value={setting.riskPerTradePct} onChange={upd("riskPerTradePct")} /></div>
                <div><label className="label">Perte quotidienne max (%)</label><input className="input" value={setting.maxDailyLossPct} onChange={upd("maxDailyLossPct")} /></div>
                <div><label className="label">Positions ouvertes max</label><input className="input" value={setting.maxOpenPositions} onChange={upd("maxOpenPositions")} /></div>
                <div><label className="label">Exposition max (%)</label><input className="input" value={setting.maxPortfolioExposurePct} onChange={upd("maxPortfolioExposurePct")} /></div>
                <div><label className="label">Frais simulés (bps)</label><input className="input" value={setting.feeBps} onChange={upd("feeBps")} /></div>
              </div>
              {saved && <p className="text-sm text-pos">Paramètres enregistrés.</p>}
              <button type="submit" className="btn-primary">Enregistrer</button>
            </form>
          </Card>

          <div className="space-y-6">
            <Card>
              <SectionTitle title="Providers" subtitle="Configurés via variables d'environnement" />
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Fournisseur IA</span>
                  <Badge tone="cyan">{providers?.ai ?? "—"}{providers?.aiModel ? ` · ${providers.aiModel}` : ""}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Données de marché</span>
                  <Badge tone="accent">{providers?.market ?? "—"}</Badge>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                Pour changer de provider (OpenAI, Anthropic, Ollama, CoinGecko…), modifie{" "}
                <code className="text-accent-soft">AI_PROVIDER</code> /{" "}
                <code className="text-accent-soft">MARKET_PROVIDER</code> dans le fichier{" "}
                <code className="text-accent-soft">.env</code> puis redémarre. Aucune clé n'est jamais
                exposée au navigateur.
              </p>
            </Card>

            <Card>
              <SectionTitle title="Capital" />
              <div className="text-sm text-muted">
                Capital de départ : <span className="tnum text-white">{setting.startingCapital} {setting.currency}</span>
              </div>
              <p className="mt-3 rounded-lg bg-bg-hover p-3 text-[11px] leading-relaxed text-faint">
                Application en <span className="font-semibold text-accent-soft">mode PAPER</span> :
                simulation uniquement. Aucun ordre réel n'est transmis à un broker. Les analyses IA sont
                des scénarios, pas des garanties de profit.
              </p>
            </Card>
          </div>
        </div>
      )}

      <AccountCard />
      <TelegramCard />
      <BrokerCard />
    </div>
  );
}
