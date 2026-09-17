"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  Radar,
  Bot,
  Wallet,
  Activity,
  CandlestickChart,
  BookOpen,
  FlaskConical,
  Bell,
  Settings,
  Newspaper,
  Landmark,
  Cpu,
  BarChart3,
  Compass,
  Search,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { apiSend } from "@/lib/client";
import { cn } from "@/lib/utils";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void | Promise<void>;
}

const NAV: { label: string; href: string; icon: LucideIcon; keywords: string }[] = [
  { label: "Démarrer (guide)", href: "/onboarding", icon: Compass, keywords: "onboarding demarrer guide aide debuter premiers pas" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: "accueil tableau" },
  { label: "Market Brief", href: "/brief", icon: Newspaper, keywords: "briefing quotidien résumé brief" },
  { label: "Markets", href: "/markets", icon: LineChart, keywords: "marché watchlist prix" },
  { label: "Scanner", href: "/scanner", icon: Radar, keywords: "scan opportunités score" },
  { label: "AI Copilot", href: "/copilot", icon: Bot, keywords: "ia analyse assistant" },
  { label: "Portfolio", href: "/portfolio", icon: Wallet, keywords: "portefeuille capital" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, keywords: "performance statistiques expectancy drawdown robot benchmark" },
  { label: "Paper Trading", href: "/paper-trading", icon: Activity, keywords: "ordre trade simuler" },
  { label: "Broker", href: "/broker", icon: Landmark, keywords: "courtier alpaca compte réel démo" },
  { label: "Auto-Pilot", href: "/bot", icon: Cpu, keywords: "robot bot automatique auto trading" },
  { label: "Charts", href: "/charts", icon: CandlestickChart, keywords: "graphique chandelier" },
  { label: "Journal", href: "/journal", icon: BookOpen, keywords: "carnet notes" },
  { label: "Backtesting", href: "/backtesting", icon: FlaskConical, keywords: "backtest stratégie test" },
  { label: "Alerts", href: "/alerts", icon: Bell, keywords: "alerte notification" },
  { label: "Settings", href: "/settings", icon: Settings, keywords: "paramètres risque réglages" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcuts: Cmd/Ctrl+K toggles, Escape closes. Also a custom event
  // so the Topbar button can open it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("tacc:open-command", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tacc:open-command", onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const close = () => setOpen(false);
  const goto = (href: string) => {
    close();
    router.push(href);
  };

  const results: Cmd[] = useMemo(() => {
    const q = query.trim();
    const list: Cmd[] = [];

    // --- Parsed slash / keyword actions (take priority) ---
    const analyze = q.match(/^\/?(?:analyse|analyze)\s+([a-z0-9/]+)/i);
    if (analyze) {
      const sym = analyze[1].toUpperCase();
      list.push({
        id: "analyze",
        label: `Analyser ${sym} (IA)`,
        hint: "Copilot",
        icon: Bot,
        run: () => goto(`/copilot?symbol=${encodeURIComponent(sym)}`),
      });
    }
    const chart = q.match(/^\/?(?:chart|graph|graphique)\s+([a-z0-9/]+)/i);
    if (chart) {
      const sym = chart[1].toUpperCase();
      list.push({
        id: "chart",
        label: `Ouvrir le graphique ${sym}`,
        hint: "Charts",
        icon: CandlestickChart,
        run: () => goto(`/charts?symbol=${encodeURIComponent(sym)}`),
      });
    }
    const alert = q.match(/^\/?alert(?:e)?\s+([a-z0-9/]+)\s*(>|<)?\s*([0-9.]+)/i);
    if (alert) {
      const sym = alert[1].toUpperCase();
      const op = alert[2] === "<" ? "LT" : "GT";
      const threshold = Number(alert[3]);
      list.push({
        id: "alert",
        label: `Créer alerte : ${sym} prix ${op === "LT" ? "<" : ">"} ${threshold}`,
        hint: "Alerts",
        icon: Bell,
        run: async () => {
          close();
          try {
            await apiSend("/api/alerts", "POST", {
              symbol: sym,
              metric: "PRICE",
              operator: op,
              threshold,
            });
          } catch {
            /* ignore — page will show state */
          }
          router.push("/alerts");
        },
      });
    }

    // --- Navigation (filtered) ---
    const nav = NAV.filter((n) => {
      if (!q) return true;
      const hay = `${n.label} ${n.keywords}`.toLowerCase();
      return hay.includes(q.toLowerCase().replace(/^\//, ""));
    }).map<Cmd>((n) => ({
      id: `nav:${n.href}`,
      label: n.label,
      hint: "Aller à",
      icon: n.icon,
      run: () => goto(n.href),
    }));

    return [...list, ...nav];
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void results[active]?.run();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-bg-card shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Tape une commande… ex. /analyze BTC · /alert BTC 100000 · portfolio"
            className="w-full bg-transparent py-3.5 text-sm text-white placeholder:text-faint focus:outline-none"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-faint sm:block">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-faint">Aucune commande.</div>
          ) : (
            results.map((c, i) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void c.run()}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                    i === active ? "bg-accent/15 text-white ring-1 ring-accent/30" : "text-muted hover:bg-bg-hover",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-faint">{c.hint}</span>}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-faint" />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-[11px] text-faint">
          <span>↑↓ naviguer</span>
          <span>⏎ exécuter</span>
          <span className="ml-auto">Astuce : /analyze, /chart, /alert, /scan, /backtest</span>
        </div>
      </div>
    </div>
  );
}
