"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { apiSend } from "@/lib/client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiSend("/api/auth/register", "POST", {
        name,
        email,
        password,
        inviteCode: inviteCode || undefined,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 ring-1 ring-accent/40">
            <Activity className="h-5 w-5 text-accent-soft" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Créer un compte</h1>
            <p className="text-sm text-muted">Cockpit personnel · mode simulation</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label">Nom (optionnel)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Mot de passe (min. 8 caractères)</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label">Code d&apos;invitation (si requis)</label>
            <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="laisser vide si non demandé" />
          </div>
          {error && <p className="text-sm text-neg">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Création…" : "Créer mon compte"}
          </button>
          <p className="text-center text-sm text-muted">
            Déjà inscrit ?{" "}
            <Link href="/login" className="text-accent-soft hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
