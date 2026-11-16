"use client";
import Link from "next/link";
import { useMission } from "@/lib/store";
import { isDevice, kindMeta, recordsForSystem, SYSTEMS, type SystemId } from "@/lib/crewprofile";
import { Tag } from "@/components/ui";
import type { AstronautId } from "@/lib/types";

/** Optional history and device records for the selected astronaut and body system. Devices are never measurements. */
export function MedicalDeviceOverlay({ system, astronautId }: { system: SystemId; astronautId?: AstronautId }) {
  const { medRecords, selectedId: sel } = useMission();
  const selectedId = astronautId ?? sel;
  const recs = recordsForSystem(medRecords, selectedId, system);
  const devices = recs.filter(isDevice), history = recs.filter((r) => !isDevice(r));
  const sys = SYSTEMS.find((s) => s.id === system)!.label;
  const list = (items: typeof recs, empty: string) => items.length === 0 ? <p className="text-[12px] text-mute">{empty}</p> : (
    <ul className="divide-y divide-line border border-line bg-panel">{items.map((r) => (
      <li key={r.id} className="px-3 py-2 text-[13px]" data-record-astronaut={r.astronautId}>
        <div className="flex flex-wrap items-center gap-1.5 text-ink">{r.title}<Tag>{kindMeta(r.kind).label}</Tag></div>
        {(r.detail || r.date) && <div className="text-[11px] text-mute">{[r.date, r.detail].filter(Boolean).join(" · ")}</div>}
      </li>))}</ul>);
  return (
    <section aria-label="Medical history and devices" data-astronaut={selectedId}>
      <h3 className="text-[13px] font-semibold text-ink">Devices and history · {sys}</h3>
      <div className="meta mb-1 mt-2">Implants and devices</div>
      {list(devices, "No device records for this astronaut and system.")}
      <p className="mt-1 text-[11px] text-mute">Device records are not measurements. Wearable and CGM streams are shown only as wearable data, never as analyzer results.</p>
      <div className="meta mb-1 mt-3">Conditions, surgeries, allergies, medications</div>
      {list(history, "No history recorded. Records are optional and none are assigned by default.")}
      <Link href="/demo/crew" className="mt-2 inline-block text-[12px] text-accent hover:underline">Manage records →</Link>
    </section>
  );
}
