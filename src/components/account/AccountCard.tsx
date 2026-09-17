"use client";

import { useState } from "react";
import { KeyRound, UserCircle } from "lucide-react";
import { Badge, Card, SectionTitle, Spinner } from "@/components/ui";
import { apiSend, useFetch } from "@/lib/client";

interface Me {
  email: string;
  name: string | null;
  role: string;
}

export function AccountCard() {
  const me = useFetch<Me>("/api/auth/me");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await apiSend("/api/auth/password", "PATCH", {
        currentPassword: current,
        newPassword: next,
      });
      setMsg("Mot de passe mis à jour.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Compte"
        subtitle="Identité et sécurité"
        action={<UserCircle className="h-5 w-5 text-accent-soft" />}
      />
      {me.loading && <Spinner />}
      {me.data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{me.data.email}</span>
            <Badge tone={me.data.role === "ADMIN" ? "accent" : "neutral"}>{me.data.role}</Badge>
          </div>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-faint">
              <KeyRound className="h-3.5 w-3.5" /> Changer le mot de passe
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Mot de passe actuel</label>
                <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </div>
              <div>
                <label className="label">Nouveau (min. 8)</label>
                <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
              </div>
            </div>
            {msg && <p className="text-sm text-pos">{msg}</p>}
            {error && <p className="text-sm text-neg">{error}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </form>
        </>
      )}
    </Card>
  );
}
