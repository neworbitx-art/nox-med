"use client";
import { SYSTEMS, type SystemId } from "@/lib/crewprofile";
type Sys = { id: SystemId; label: string; atlas: boolean };

export function BodySystemSelector({ value, onChange, systems = SYSTEMS }: { value: SystemId; onChange: (s: SystemId) => void; systems?: Sys[] }) {
  return (
    <div role="group" aria-label="Body system" className="flex flex-wrap gap-1.5">
      {systems.map((s) => (
        <button key={s.id} onClick={() => onChange(s.id)} aria-pressed={value === s.id} data-system={s.id}
          className={`rounded-sm border px-2.5 py-1 text-[12px] ${value === s.id ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line bg-panel text-ink2 hover:bg-bg2"}`}>
          {s.label}{!s.atlas && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-mute">Future</span>}
        </button>
      ))}
    </div>
  );
}
