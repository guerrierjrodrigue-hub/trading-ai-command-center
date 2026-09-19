"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  LineChart,
  Radar,
  Bot,
  Wallet,
  CandlestickChart,
  BookOpen,
  Bell,
  Settings,
  Activity,
  FlaskConical,
  Newspaper,
  Landmark,
  Cpu,
  BarChart3,
  Compass,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/onboarding", label: "Démarrer", icon: Compass },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brief", label: "Market Brief", icon: Newspaper },
  { href: "/markets", label: "Markets", icon: LineChart },
  { href: "/scanner", label: "Scanner", icon: Radar },
  { href: "/copilot", label: "AI Copilot", icon: Bot },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/paper-trading", label: "Paper Trading", icon: Activity },
  { href: "/broker", label: "Broker", icon: Landmark },
  { href: "/bot", label: "Auto-Pilot", icon: Cpu },
  { href: "/charts", label: "Charts", icon: CandlestickChart },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/backtesting", label: "Backtesting", icon: FlaskConical },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Brand() {
  return (
    <div className="flex h-16 items-center gap-2 border-b border-border px-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
        <Activity className="h-4 w-4 text-accent-soft" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">Command Center</div>
        <div className="text-[10px] uppercase tracking-wider text-faint">Trading AI</div>
      </div>
    </div>
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent/15 text-white ring-1 ring-accent/30"
                : "text-muted hover:bg-bg-hover hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PaperNotice() {
  return (
    <div className="border-t border-border p-3">
      <div className="rounded-lg bg-bg-hover p-3 text-[11px] leading-relaxed text-faint">
        Mode <span className="font-semibold text-accent-soft">PAPER</span> — aucune
        exécution réelle. Les analyses IA sont des scénarios, pas des garanties.
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Mobile nav drawer: toggled by the hamburger button in the Topbar (same
  // window-event pattern as the Command Palette), closed on Escape.
  useEffect(() => {
    function onToggle() {
      setOpen((o) => !o);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("tacc:toggle-nav", onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("tacc:toggle-nav", onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Close the drawer whenever the route changes (link click, back button…).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar — unchanged, md and up */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-soft md:flex">
        <Brand />
        <NavLinks pathname={pathname} />
        <PaperNotice />
      </aside>

      {/* Mobile drawer — below md, opened via the Topbar hamburger button */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex w-72 max-w-[85vw] flex-col bg-bg-soft shadow-glow">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg-hover hover:text-white"
              aria-label="Fermer le menu"
            >
              <X className="h-4 w-4" />
            </button>
            <Brand />
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <PaperNotice />
          </aside>
        </div>
      )}
    </>
  );
}
