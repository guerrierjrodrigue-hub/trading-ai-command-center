"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Badge, Card, SectionTitle, Spinner } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";

export function TelegramCard() {
  const s = useFetch<{ configured: boolean; connected: boolean }>("/api/telegram/status");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await apiSend("/api/telegram/connect", "POST");
      setMsg("Connecté ! Un message de confirmation vient de t'être envoyé sur Telegram.");
      await s.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await apiSend("/api/telegram/test", "POST");
      setMsg("Message de test envoyé sur Telegram ✅");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Notifications Telegram"
        subtitle="Recevoir tes alertes sur ton téléphone"
        action={<Send className="h-5 w-5 text-accent-soft" />}
      />
      {s.loading && <Spinner />}
      {s.data && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={s.data.configured ? "pos" : "neutral"}>
              bot {s.data.configured ? "configuré" : "non configuré"}
            </Badge>
            <Badge tone={s.data.connected ? "pos" : "warn"}>
              {s.data.connected ? "connecté" : "non connecté"}
            </Badge>
          </div>

          {!s.data.configured ? (
            <p className="text-sm text-faint">
              Ajoute <code className="text-accent-soft">TELEGRAM_BOT_TOKEN</code> dans le fichier{" "}
              <code className="text-accent-soft">.env</code> puis redémarre l&apos;app.
            </p>
          ) : !s.data.connected ? (
            <div className="space-y-3 text-sm">
              <ol className="list-inside list-decimal space-y-1 text-muted">
                <li>Ouvre ton bot dans Telegram et envoie-lui <code className="text-accent-soft">/start</code>.</li>
                <li>Reviens ici et clique « Connecter ».</li>
              </ol>
              <button onClick={connect} disabled={busy} className="btn-primary text-sm">
                {busy ? "Connexion…" : "Connecter"}
              </button>
            </div>
          ) : (
            <button onClick={test} disabled={busy} className="btn-ghost text-sm">
              {busy ? "Envoi…" : "Envoyer un message de test"}
            </button>
          )}

          {msg && <p className="mt-3 text-sm text-pos">{msg}</p>}
          {error && <p className="mt-3 text-sm text-neg">{error}</p>}
        </>
      )}
    </Card>
  );
}
