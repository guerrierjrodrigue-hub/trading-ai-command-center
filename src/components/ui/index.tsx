import { cn, formatPct } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("card p-4", className)}>{children}</div>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  changePct,
  hint,
}: {
  label: string;
  value: string;
  changePct?: number;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-faint">{label}</span>
      <span className="tnum text-2xl font-semibold text-white">{value}</span>
      {changePct !== undefined && (
        <span
          className={cn(
            "tnum text-sm font-medium",
            changePct > 0 ? "text-pos" : changePct < 0 ? "text-neg" : "text-muted",
          )}
        >
          {formatPct(changePct)}
        </span>
      )}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "pos" | "neg" | "accent" | "warn" | "cyan";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-bg-hover text-muted",
    pos: "bg-pos/15 text-pos",
    neg: "bg-neg/15 text-neg",
    accent: "bg-accent/20 text-accent-soft",
    warn: "bg-warn/15 text-warn",
    cyan: "bg-cyan/15 text-cyan",
  };
  return <span className={cn("badge", tones[tone])}>{children}</span>;
}

export function PaperBadge() {
  return <Badge tone="accent">PAPER</Badge>;
}

export function AiBadge() {
  return <Badge tone="cyan">AI · scénario</Badge>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label ?? "Chargement…"}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-neg/40 bg-neg/10 p-3 text-sm text-neg">
      {message}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-faint">
      {message}
    </div>
  );
}

export function TrendBadge({ trend }: { trend: string }) {
  const tone = trend === "UP" ? "pos" : trend === "DOWN" ? "neg" : "neutral";
  const label = trend === "UP" ? "▲ UP" : trend === "DOWN" ? "▼ DOWN" : "→ FLAT";
  return <Badge tone={tone as any}>{label}</Badge>;
}

export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 65 ? "bg-pos" : score <= 35 ? "bg-neg" : "bg-warn";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-bg-hover">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </div>
      <span className="tnum text-xs font-semibold text-white">{score}</span>
    </div>
  );
}
