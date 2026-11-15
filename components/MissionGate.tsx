"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Compass } from "lucide-react";
import { ACTIVE_MISSION_ID, ROUTE_LABEL, missionById, missionDate } from "@/lib/missions";
import { crewOf } from "@/lib/crewregistry";
import { useMission } from "@/lib/store";
import { ShipHealthPanel } from "@/components/navigator/ShipHealth";

/** Renders clinical NOX-01 modules only for the mission that owns the data. Any other mission gets an honest empty state, never borrowed results. */
export function MissionGate({ module, children }: { module: string; children: ReactNode }) {
  const { missionId, selectMission } = useMission();
  const m = missionById(missionId)!;
  if (m.hasCrewData) return <>{children}</>;
  return (
    <div data-testid="no-mission-data" data-mission={m.id} className="mx-auto max-w-5xl space-y-4">
      <section className="border border-line bg-panel p-5">
        <div className="meta text-accent">{m.code} · {module}</div>
        <h1 className="mt-1 text-xl font-semibold text-ink">No clinical records for {m.code} {m.name}</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink2">
          This module shows blood gas, vital-sign, wearable, laboratory and environmental records. None have been loaded for {m.code}, so nothing is displayed here. Results from {ACTIVE_MISSION_ID} are deliberately not shown under another mission.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => selectMission(ACTIVE_MISSION_ID)} className="rounded-sm border border-accent bg-accent px-3 py-1.5 text-[12px] font-semibold text-bg" data-testid="switch-active">Switch to {ACTIVE_MISSION_ID} (data loaded)</button>
          <Link href={`/mission/${m.id}`} className="rounded-sm border border-line px-3 py-1.5 text-[12px] text-ink2 hover:border-accent/60">Open {m.code} overview</Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-sm border border-line px-3 py-1.5 text-[12px] text-ink2 hover:border-accent/60"><Compass size={13} /> Mission Navigator</Link>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink">{m.code} crew roster</h2>
          <ul className="divide-y divide-line text-[13px]">{crewOf(m).map((c) => <li key={c.code} className="flex justify-between py-1.5"><span><span className="num font-semibold">{c.code}</span> · {c.role}</span><span className="text-mute">No clinical records</span></li>)}</ul>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]"><dt className="text-mute">Route</dt><dd>{ROUTE_LABEL[m.route]}</dd><dt className="text-mute">Mission day</dt><dd className="num">{m.vehicle.day}/{m.vehicle.totalDays} · {missionDate(m, m.vehicle.day)}</dd></dl>
        </section>
        <section className="border border-line bg-panel p-4"><ShipHealthPanel m={m} compact /><p className="mt-2 text-[11px] text-mute">Source: {m.dataSource}. Ship measurements are not clinical values.</p></section>
      </div>
      <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] text-mute hover:text-ink"><ArrowLeft size={13} /> Back to Mission Navigator</Link>
    </div>
  );
}
