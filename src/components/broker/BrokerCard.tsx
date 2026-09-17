"use client";

import { Landmark, ShieldCheck } from "lucide-react";
import { Badge, Card, SectionTitle, Spinner } from "@/components/ui";
import { useFetch } from "@/lib/client";
import { cn, formatCurrency } from "@/lib/utils";

interface BrokerAccount {
  provider: string;
  mode: string;
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  tradingEnabled: boolean;
  connected: boolean;
  note?: string;
}
interface BrokerPosition {
  symbol: string;
  side: string;
  quantity: number;
  marketValue: number;
  unrealizedPnl: number;
}

export function BrokerCard() {
  const b = useFetch<{ account: BrokerAccount; positions: BrokerPosition[]; realTradingEnabled: boolean }>(
    "/api/broker/account",
  );
  const acc = b.data?.account;

  return (
    <Card>
      <SectionTitle
        title="Connexion courtier"
        subtitle="Lecture seule — fondation Phase 3"
        action={<Landmark className="h-5 w-5 text-accent-soft" />}
      />

      {b.loading && <Spinner />}
      {acc && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="accent">Courtier : {acc.provider}</Badge>
            <Badge tone={acc.mode === "live" ? "warn" : "cyan"}>mode {acc.mode}</Badge>
            <Badge tone={acc.connected ? "pos" : "neutral"}>{acc.connected ? "connecté" : "non configuré"}</Badge>
            <Badge tone={b.data?.realTradingEnabled ? "neg" : "pos"}>
              <ShieldCheck className="mr-1 h-3 w-3" />
              trading réel : {b.data?.realTradingEnabled ? "ACTIVÉ" : "DÉSACTIVÉ"}
            </Badge>
          </div>

          {acc.connected ? (
            <div className="grid grid-cols-3 gap-3 tnum text-sm">
              <div><div className="text-faint">Capital (equity)</div><div className="text-white">{formatCurrency(acc.equity, acc.currency)}</div></div>
              <div><div className="text-faint">Cash</div><div className="text-white">{formatCurrency(acc.cash, acc.currency)}</div></div>
              <div><div className="text-faint">Pouvoir d'achat</div><div className="text-white">{formatCurrency(acc.buyingPower, acc.currency)}</div></div>
            </div>
          ) : (
            <p className="text-sm text-faint">{acc.note}</p>
          )}

          {acc.connected && b.data && b.data.positions.length > 0 && (
            <div className="mt-4 space-y-1">
              <div className="text-xs uppercase tracking-wide text-faint">Positions (lecture seule)</div>
              {b.data.positions.map((p) => (
                <div key={p.symbol} className="flex items-center justify-between text-sm">
                  <span className="text-white">{p.symbol} <span className="text-faint">· {p.side}</span></span>
                  <span className={cn("tnum", p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>
                    {formatCurrency(p.marketValue, acc.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 rounded-lg bg-bg-hover p-3 text-[11px] leading-relaxed text-faint">
            Cette section <span className="font-semibold text-accent-soft">lit</span> un compte
            courtier ; elle n&apos;envoie <span className="font-semibold">jamais</span> d&apos;ordre réel.
            L&apos;exécution réelle est verrouillée derrière l&apos;interrupteur{" "}
            <code className="text-accent-soft">BROKER_TRADING_ENABLED</code> (éteint). Par défaut, le
            courtier est <span className="font-semibold text-accent-soft">Paper</span> (ta simulation).
          </p>
        </>
      )}
    </Card>
  );
}
