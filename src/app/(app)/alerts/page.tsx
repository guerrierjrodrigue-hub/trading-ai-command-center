"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, BellPlus } from "lucide-react";
import { Badge, Card, Empty, ErrorNote, SectionTitle, Spinner } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";
import { formatNumber } from "@/lib/utils";

interface Alert {
  id: string;
  symbol: string;
  metric: string;
  operator: string;
  threshold: number;
  status: string;
  note: string | null;
  currentValue?: number | null;
  lastTriggeredAt?: string | null;
}

const OP_LABEL: Record<string, string> = {
  GT: ">",
  LT: "<",
  CROSS_ABOVE: "croise ↑",
  CROSS_BELOW: "croise ↓",
};

export default function AlertsPage() {
  const a = useFetch<{ alerts: Alert[] }>("/api/alerts");
  const [form, setForm] = useState({ symbol: "BTC", metric: "PRICE", operator: "GT", threshold: "" });
  const [error, setError] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<string>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === "granted") {
      new Notification("Notifications activées ✅", {
        body: "Tu seras prévenu quand une alerte se déclenche.",
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiSend("/api/alerts", "POST", {
        symbol: form.symbol.toUpperCase(),
        metric: form.metric,
        operator: form.operator,
        threshold: Number(form.threshold),
      });
      setForm({ ...form, threshold: "" });
      await a.refetch();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Alerts</h1>
        {notifPerm === "granted" ? (
          <Badge tone="pos">Notifications navigateur activées</Badge>
        ) : (
          <button onClick={enableNotifications} className="btn-primary text-xs">
            <BellPlus className="h-4 w-4" />
            {notifPerm === "denied" ? "Notifications bloquées (voir réglages navigateur)" : "Activer les notifications navigateur"}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Les règles sont évaluées côté serveur. Une fois les notifications activées, tu reçois une
        alerte dans le navigateur dès qu&apos;une condition est atteinte (email / Telegram / Discord
        viendront plus tard — l&apos;architecture est prête).
      </p>
      {error && <ErrorNote message={error} />}

      <Card>
        <SectionTitle title="Nouvelle alerte" />
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div><label className="label">Actif</label><input className="input w-28" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} /></div>
          <div>
            <label className="label">Métrique</label>
            <select className="input" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
              <option value="PRICE">Prix</option>
              <option value="RSI">RSI</option>
              <option value="VOLUME">Volume</option>
            </select>
          </div>
          <div>
            <label className="label">Opérateur</label>
            <select className="input" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
              <option value="GT">&gt;</option>
              <option value="LT">&lt;</option>
            </select>
          </div>
          <div><label className="label">Seuil</label><input className="input w-32" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} required /></div>
          <button type="submit" className="btn-primary">Créer</button>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Mes alertes" />
        {a.loading ? (
          <Spinner />
        ) : !a.data?.alerts.length ? (
          <Empty message="Aucune alerte." />
        ) : (
          <div className="space-y-2">
            {a.data.alerts.map((al) => (
              <div key={al.id} className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-3">
                <div className="flex items-center gap-3">
                  {al.status === "TRIGGERED" ? (
                    <BellRing className="h-4 w-4 text-warn" />
                  ) : (
                    <Bell className="h-4 w-4 text-faint" />
                  )}
                  <div>
                    <div className="text-sm text-white">
                      {al.symbol} · {al.metric} {OP_LABEL[al.operator]} {formatNumber(al.threshold, 2)}
                    </div>
                    <div className="tnum text-xs text-faint">
                      {al.currentValue != null ? `actuel : ${formatNumber(al.currentValue, 2)}` : "—"}
                    </div>
                  </div>
                </div>
                <Badge tone={al.status === "TRIGGERED" ? "warn" : al.status === "ACTIVE" ? "pos" : "neutral"}>
                  {al.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
