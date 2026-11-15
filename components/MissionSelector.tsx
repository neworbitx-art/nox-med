"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { ACTIVE_MISSION_ID, MISSIONS, ROUTE_LABEL, missionById, shipHealthFor } from "@/lib/missions";
import { useMission } from "@/lib/store";
import { StatusDot } from "@/components/navigator/ShipHealth";

/** Global mission selector: shows the selected mission, lets the user switch, and persists through the store. "Session" marks the mission whose data this build holds. */
export function MissionSelector({ dark = false, onChange }: { dark?: boolean; onChange?: (id: string) => void }) {
  const { missionId, selectMission } = useMission();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cur = missionById(missionId)!;
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key); };
  }, [open]);
  const pick = (id: string) => { selectMission(id); onChange?.(id); setOpen(false); };
  return (
    <div ref={root} className="relative" data-testid="mission-selector" data-selected={missionId}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Mission: ${cur.code} ${cur.name}. Change mission`}
        className="g-btn flex items-center gap-2 px-3 py-1.5 text-left text-[12px]" data-on={open}>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">Mission</span>
        <span className="num font-semibold">{cur.code}</span><span className="hidden text-mute sm:inline">{cur.name}</span>
        <ChevronDown size={14} className="text-mute" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Select mission" className="g-menu absolute left-0 top-full z-[60] mt-2 w-[330px] max-w-[88vw]">
          {MISSIONS.map((m) => {
            const sel = m.id === missionId, ship = shipHealthFor(m);
            return (
              <li key={m.id} role="option" aria-selected={sel} className="g-item">
                <button type="button" onClick={() => pick(m.id)} data-mission-option={m.id} className="flex w-full items-start gap-2 px-3 py-2.5 text-left">
                  <span className="mt-1"><StatusDot level={ship.overall} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-ink"><span className="num">{m.code}</span>{m.name}{sel && <Check size={13} className="text-accent" />}</span>
                    <span className="block text-[11px] text-mute">{ROUTE_LABEL[m.route]} · day {m.vehicle.day}/{m.vehicle.totalDays} · {m.crew.length} crew</span>
                    <span className="block text-[10px] uppercase tracking-wide text-mute">{m.id === ACTIVE_MISSION_ID ? <span className="text-lime">Session mission · data loaded</span> : "No clinical data loaded"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
