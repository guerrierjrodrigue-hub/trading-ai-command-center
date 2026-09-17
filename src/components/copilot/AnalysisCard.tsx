"use client";

import { AiBadge, Badge, Card } from "@/components/ui";
import { cn, formatNumber } from "@/lib/utils";
import type { AssetAnalysis } from "@/services/ai/types";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}

export function AnalysisCard({ a }: { a: AssetAnalysis }) {
  const conf = a.confidenceScore;
  const confTone = conf >= 65 ? "pos" : conf <= 35 ? "neg" : "warn";
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-white">{a.symbol}</h3>
          <AiBadge />
        </div>
        <Badge tone={confTone as any}>Confiance {conf}/100</Badge>
      </div>

      <p className="text-sm text-muted">{a.marketOverview}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="Tendance" value={a.trend} />
        <Field label="Momentum" value={a.momentum} />
        <Field label="Volatilité" value={a.volatility} />
        <Field label="Support" value={a.support !== null ? formatNumber(a.support, 4) : "—"} />
        <Field label="Résistance" value={a.resistance !== null ? formatNumber(a.resistance, 4) : "—"} />
        <Field label="Volume" value={a.volume} />
      </div>

      <div className="rounded-lg border border-border bg-bg-soft p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Setup possible</div>
        <div className="mb-3 text-sm font-medium text-white">{a.possibleSetup}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field
            label="Zone d'entrée"
            value={a.entryZone ? `${formatNumber(a.entryZone[0], 4)} – ${formatNumber(a.entryZone[1], 4)}` : "—"}
          />
          <Field label="Stop-loss" value={a.stopLoss !== null ? formatNumber(a.stopLoss, 4) : "—"} />
          <Field label="Take-profit" value={a.takeProfit !== null ? formatNumber(a.takeProfit, 4) : "—"} />
          <Field label="Risk / Reward" value={a.riskReward !== null ? `${a.riskReward}` : "—"} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-pos/30 bg-pos/5 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-pos">Scénario haussier</div>
          <div className="text-sm text-white">{a.bullScenario}</div>
        </div>
        <div className="rounded-lg border border-neg/30 bg-neg/5 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neg">Scénario baissier</div>
          <div className="text-sm text-white">{a.bearScenario}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Risques</div>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          {a.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-warn">Invalidation</div>
        <div className="text-sm text-white">{a.invalidationScenario}</div>
      </div>

      <p className={cn("text-[11px] leading-relaxed text-faint")}>{a.disclaimer}</p>
    </Card>
  );
}
