"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { apiSend } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@trading.ai");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiSend("/api/auth/login", "POST", { email, password });
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
            <h1 className="text-xl font-semibold text-white">Trading AI Command Center</h1>
            <p className="text-sm text-muted">Cockpit personnel · mode simulation</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
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
            <label className="label">Mot de passe</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-neg">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
          <p className="text-center text-sm text-muted">
            Pas de compte ?{" "}
            <Link href="/register" className="text-accent-soft hover:underline">
              Créer un compte
            </Link>
          </p>
          <p className="rounded-lg bg-bg-hover p-2 text-center text-xs text-faint">
            Démo : demo@trading.ai / demo1234
          </p>
        </form>
      </div>
    </div>
  );
}
