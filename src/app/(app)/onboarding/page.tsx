"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Compass } from "lucide-react";
import { Badge, Card, SectionTitle, Spinner } from "@/components/ui";
import { useFetch } from "@/lib/client";

interface Providers {
  ai: string;
  aiModel: string | null;
  market: string;
}
interface Metrics {
  trades: number;
  openPositions: number;
}

/** A single guided step. `state`: done / todo / active(info). */
function Step({
  n,
  title,
  children,
  done,
  href,
  cta,
  badge,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  done: boolean;
  href: string;
  cta: string;
  badge?: string;
}) {
  return (
    <Card className="flex gap-3">
      <div className="pt-0.5">
        {done ? <CheckCircle2 className="h-5 w-5 text-pos" /> : <Circle className="h-5 w-5 text-faint" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-faint">Étape {n}</span>
          <span className="font-medium text-white">{title}</span>
          {badge && <Badge tone={done ? "pos" : "neutral"}>{badge}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">{children}</p>
        <Link href={href} className="btn-ghost mt-2 inline-flex text-xs">{cta}</Link>
      </div>
    </Card>
  );
}

export default function OnboardingPage() {
  const settings = useFetch<{ providers: Providers }>("/api/settings");
  const tg = useFetch<{ configured: boolean; connected: boolean }>("/api/telegram/status");
  const broker = useFetch<{ account: { provider: string; connected: boolean } }>("/api/broker/account");
  const pf = useFetch<{ metrics: Metrics }>("/api/portfolio");
  const bot = useFetch<{ config: { enabled: boolean } }>("/api/bot");

  const loading = settings.loading && !settings.data;

  const aiReal = !!settings.data && settings.data.providers.ai !== "mock";
  const marketReal = !!settings.data && settings.data.providers.market !== "mock";
  const tgOn = !!tg.data?.connected;
  const brokerOn = !!broker.data?.account && broker.data.account.connected && broker.data.account.provider !== "paper";
  const traded = !!pf.data && (pf.data.metrics.trades > 0 || pf.data.metrics.openPositions > 0);
  const botOn = !!bot.data?.config?.enabled;

  const steps = [aiReal, marketReal, tgOn, brokerOn, traded, botOn];
  const done = steps.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Bienvenue 👋</h1>
        <Compass className="h-5 w-5 text-accent-soft" />
      </div>
      <p className="max-w-2xl text-sm text-muted">
        Ce cockpit réunit données de marché réelles, un co-pilote IA, un carnet en simulation, un scanner,
        un robot autonome et un courtier démo — le tout <b>sans argent réel</b>. Voici comment le prendre en main,
        étape par étape. Tu peux tout explorer sans rien risquer.
      </p>

      {loading ? (
        <Spinner label="Chargement de ta configuration…" />
      ) : (
        <>
          <Card>
            <SectionTitle title={`Progression : ${done}/6`} subtitle="Rien d'obligatoire — c'est un guide, pas une contrainte." />
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg-soft">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / 6) * 100}%` }} />
            </div>
          </Card>

          <div className="grid gap-3">
            <Step n={1} title="Le co-pilote IA" done={aiReal} href="/copilot" cta="Ouvrir le co-pilote" badge={aiReal ? "IA locale active" : "Mode démo (mock)"}>
              Pose une question ou demande « Analyse BTC ». L&apos;IA raisonne en <b>scénarios</b> (jamais de garantie) et
              s&apos;appuie sur ta base de connaissances. {aiReal ? "Ton IA locale (Ollama) est branchée." : "Active une vraie IA dans Réglages (AI_PROVIDER=ollama)."}
            </Step>
            <Step n={2} title="Données de marché réelles" done={marketReal} href="/markets" cta="Voir les marchés" badge={marketReal ? "Live" : "Simulation"}>
              Cotations et graphiques en direct pour la crypto, les actions, les ETF et le forex.
              {marketReal ? " Tes sources réelles sont actives." : " Passe en source réelle dans Réglages."}
            </Step>
            <Step n={3} title="Essaie un trade en simulation" done={traded} href="/paper-trading" cta="Passer un ordre simulé">
              Le cœur de l&apos;apprentissage : achète en simulation avec un stop-loss et un take-profit, sans risque.
              Tout est fictif.
            </Step>
            <Step n={4} title="Reçois les alertes sur Telegram" done={tgOn} href="/settings" cta="Connecter Telegram" badge={tgOn ? "Connecté" : "Optionnel"}>
              Alertes de prix, notifications du robot et brief quotidien directement sur ton téléphone.
            </Step>
            <Step n={5} title="Connecte un courtier démo" done={brokerOn} href="/broker" cta="Configurer le courtier" badge={brokerOn ? "Connecté" : "Optionnel"}>
              Branche un vrai courtier en <b>mode démo</b> (argent fictif, ex. Binance testnet). Le trading réel reste verrouillé.
            </Step>
            <Step n={6} title="Configure et démarre le robot" done={botOn} href="/bot" cta="Ouvrir l'Auto-Pilot" badge={botOn ? "En marche" : "À l'arrêt"}>
              Choisis un niveau de risque et laisse le robot trader à ta place (en simulation). Il choisit la stratégie,
              gère les stops et t&apos;explique chaque décision. Bouton d&apos;arrêt d&apos;urgence à tout moment.
            </Step>
          </div>

          <p className="text-xs text-faint">
            Rappel : cet outil produit des scénarios éducatifs, pas des conseils financiers. Simulation uniquement tant que le trading réel n&apos;est pas explicitement activé.
          </p>
        </>
      )}
    </div>
  );
}
