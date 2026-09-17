"use client";

import { useEffect } from "react";
import { apiGet } from "@/lib/client";

const SEEN_KEY = "tacc_notified_alerts";
const POLL_MS = 60_000;

interface AlertRow {
  id: string;
  symbol: string;
  metric: string;
  operator: string;
  threshold: number;
  status: string;
  currentValue?: number | null;
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Background poller mounted app-wide. It fetches /api/alerts (which evaluates
 * rules server-side and flips matching alerts to TRIGGERED), then fires a
 * browser notification the first time it sees each triggered alert.
 * No delivery for email/telegram/discord yet — the architecture is ready.
 */
export function AlertNotifier() {
  useEffect(() => {
    let stop = false;

    async function poll() {
      try {
        const data = await apiGet<{ alerts: AlertRow[] }>("/api/alerts");
        if (stop) return;
        const seen = readSeen();
        const canNotify =
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted";

        for (const a of data.alerts) {
          if (a.status !== "TRIGGERED" || seen.has(a.id)) continue;
          if (canNotify) {
            const op = a.operator === "LT" ? "<" : ">";
            new Notification(`Alerte ${a.symbol}`, {
              body: `${a.metric} ${op} ${a.threshold}${a.currentValue != null ? ` — actuel ${a.currentValue}` : ""}`,
              tag: a.id,
            });
          }
          seen.add(a.id);
        }
        writeSeen(seen);
      } catch {
        /* silent — dashboard shows alert state anyway */
      }
    }

    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return null;
}
