"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Activity, Droplet, FlaskConical, LayoutDashboard, Menu, Siren, Wind, Watch, X, Orbit, Box, Users, Compass, HeartPulse, ArrowLeft } from "lucide-react";
import { astronauts } from "@/lib/data";
import { useMission } from "@/lib/store";
import { ACTIVE_MISSION_ID, missionById, missionDate, ROUTE_LABEL } from "@/lib/missions";
import { crewOf } from "@/lib/crewregistry";
import { MissionSelector } from "./MissionSelector";
import { MissionGate } from "./MissionGate";
import { CREW_COLORS } from "./ui";

/** Routes that render NOX-01 clinical datasets; other missions get an explicit empty state. */
const GATED: { prefix: string; label: string }[] = [
  { prefix: "/mission-control", label: "Mission Control" }, { prefix: "/blood-gas", label: "Blood Gas Intelligence" }, { prefix: "/environment", label: "Environmental Monitoring" },
  { prefix: "/wearables", label: "Wearables" }, { prefix: "/timeline", label: "Integrated Timeline" }, { prefix: "/emergency", label: "Emergency Simulator" },
  { prefix: "/twin", label: "Human Digital Twin" }, { prefix: "/lab-import", label: "Laboratory Import" },
];

const NavCtx = createContext<{ openNav: () => void }>({ openNav: () => {} });
/** Lets full-screen pages (the Mission Navigator) open the navigation drawer. */
export const useShellNav = () => useContext(NavCtx);

export const NAV = [
  { href: "/", label: "Mission Navigator", icon: Compass },
  { href: "/mission", label: "Crew Health Overview", icon: HeartPulse },
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
  { href: "/blood-gas", label: "Blood Gas Intelligence", icon: Droplet },
  { href: "/environment", label: "Environmental Monitoring", icon: Wind },
  { href: "/wearables", label: "Wearables", icon: Watch },
  { href: "/timeline", label: "Integrated Timeline", icon: Activity },
  { href: "/emergency", label: "Emergency Simulator", icon: Siren },
  { href: "/twin", label: "Human Digital Twin", icon: Box },
  { href: "/crew", label: "Crew Profiles", icon: Users },
  { href: "/lab-import", label: "Laboratory Import", icon: FlaskConical },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { selectedId, select, alerts, missionId, currentDay } = useMission();
  const m = missionById(missionId)!;
  const crew = crewOf(m);
  const activeCritical = m.hasCrewData ? alerts.filter((a) => a.severity === "critical" && a.missionDay > currentDay - 7).length : 0;
  const gate = GATED.find((g) => path === g.prefix || path.startsWith(g.prefix + "/"));
  const navHref = (href: string) => (href === "/mission" ? `/mission/${missionId}` : href);

  const nav = (
    <nav className="flex flex-col px-2 py-3" aria-label="Primary">
      <div className="meta px-3 pb-1.5">Modules</div>
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : n.href === "/mission" ? path.startsWith("/mission/") : path === n.href || path.startsWith(n.href + "/");
        const Icon = n.icon;
        return (
          <Link key={n.href} href={navHref(n.href)} onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 border-l-2 px-3 py-2 text-[13px] ${active ? "border-accent bg-accent/10 font-semibold text-accent" : "border-transparent text-ink2 hover:bg-white/5"}`}
            aria-current={active ? "page" : undefined}>
            <Icon size={15} /> {n.label}
          </Link>
        );
      })}
    </nav>
  );

  if (path === "/") {
    return (
      <NavCtx.Provider value={{ openNav: () => setOpen(true) }}>
        <div className="relative h-dvh w-screen overflow-hidden bg-black">{children}</div>
        {open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 glass !rounded-none !rounded-r-3xl">
              <div className="flex items-center justify-between pr-3"><Brand /><button aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button></div>
              {nav}
            </div>
          </div>
        )}
      </NavCtx.Provider>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-bg2 lg:block">
        <div className="sticky top-0"><Brand />{nav}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 glass !rounded-none !rounded-r-3xl">
            <div className="flex items-center justify-between pr-3"><Brand /><button aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button></div>
            {nav}
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 glass-bar" data-testid="app-header" data-mission={m.id}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            <button className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
            <Link href="/" className="g-btn flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" data-testid="back-navigator"><ArrowLeft size={13} /> Navigator</Link>
            <MissionSelector />
            <div className="num flex flex-wrap items-center gap-x-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
              <span className="text-accent">Day {m.vehicle.day}/{m.vehicle.totalDays}</span><span className="hidden text-line sm:inline">|</span>
              <span className="hidden text-mute sm:inline">{ROUTE_LABEL[m.route]}</span>
            </div>
            {activeCritical > 0 && <span className="rounded-sm border border-crit/40 bg-crit/10 px-1.5 py-0.5 text-[10px] font-semibold text-crit">{activeCritical} CRITICAL (7 d)</span>}
            <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="Crew of selected mission" data-testid="crew-switch">
              {crew.map((c) => c.astronaut && m.hasCrewData ? (
                <button key={c.code} onClick={() => select(c.astronaut!.id)} aria-pressed={c.astronaut.id === selectedId} title={`${c.code} · ${c.role}`}
                  data-on={c.astronaut.id === selectedId} className="g-btn num flex items-center gap-1.5 px-2.5 py-1 text-xs">
                  <span className="h-2 w-2 rounded-full border border-white/50" style={{ background: CREW_COLORS[c.astronaut.id] }} />{c.code}
                </button>
              ) : (
                <span key={c.code} title={`${c.code} · ${c.role}: no clinical records`} className="num rounded-sm border border-line/70 px-2 py-1 text-xs text-mute">{c.code}</span>
              ))}
            </div>
          </div>
          <div className="num flex gap-4 border-t border-line/70 bg-bg2/70 px-4 py-1 text-[10px] text-mute">
            <span>{missionDate(m, m.vehicle.day)} UTC (mission-elapsed {m.vehicle.day - 1} d)</span>
            <span className="hidden sm:inline">{m.code} · {m.name}</span>
            {m.hasCrewData && <span className="hidden sm:inline">Analyzer: ABL90 FLEX PLUS</span>}
            {m.hasCrewData && m.id !== ACTIVE_MISSION_ID && <span className="text-warn" data-testid="synthetic-banner">SYNTHETIC DEMONSTRATION DATA · simulated crew, not real measurements</span>}
          </div>
        </header>
        <main className="p-4 lg:p-6">{gate ? <MissionGate module={gate.label}>{children}</MissionGate> : children}</main>
        <footer className="border-t border-line bg-bg2 px-6 py-4 text-[11px] text-mute">
          NOX — New Orbit Exploration · NOX MED · <Link href="/about" className="underline hover:text-ink">About / Data Sources</Link>
        </footer>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-accent/40 bg-accent/10 text-accent"><Orbit size={20} /></div>
      <div>
        <div className="text-sm font-bold tracking-wide text-ink">NOX MED</div>
        <div className="meta">Mission Health Intelligence</div>
      </div>
    </div>
  );
}
