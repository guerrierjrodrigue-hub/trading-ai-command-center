"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-soft md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
          <Activity className="h-4 w-4 text-accent-soft" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">Command Center</div>
          <div className="text-[10px] uppercase tracking-wider text-faint">Trading AI</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
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
      <div className="border-t border-border p-3">
        <div className="rounded-lg bg-bg-hover p-3 text-[11px] leading-relaxed text-faint">
          Mode <span className="font-semibold text-accent-soft">PAPER</span> — aucune
          exécution réelle. Les analyses IA sont des scénarios, pas des garanties.
        </div>
      </div>
    </aside>
  );
}
