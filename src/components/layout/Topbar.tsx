"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Command, LogOut, Menu, Search } from "lucide-react";
import { apiSend } from "@/lib/client";

export function Topbar({ userName }: { userName: string }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");

  async function logout() {
    await apiSend("/api/auth/logout", "POST");
    router.push("/login");
    router.refresh();
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    const s = symbol.trim().toUpperCase();
    if (s) router.push(`/charts?symbol=${encodeURIComponent(s)}`);
  }

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-bg-soft px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          onClick={() => window.dispatchEvent(new Event("tacc:toggle-nav"))}
          className="btn-ghost shrink-0 md:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <form onSubmit={go} className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Rechercher un actif (ex. BTC, AAPL, EUR/USD)…"
            className="input pl-9"
          />
        </form>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.dispatchEvent(new Event("tacc:open-command"))}
          className="btn-ghost hidden items-center gap-2 text-xs sm:inline-flex"
          title="Command Center (Ctrl/Cmd + K)"
        >
          <Command className="h-3.5 w-3.5" />
          <kbd className="text-[10px]">⌘K</kbd>
        </button>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-white">{userName}</div>
          <div className="text-[11px] text-faint">Compte personnel</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent-soft ring-1 ring-accent/40">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <button onClick={logout} className="btn-ghost" title="Se déconnecter">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
