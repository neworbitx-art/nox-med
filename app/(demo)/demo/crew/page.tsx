"use client";
import React, { useMemo, useState } from "react";
import { useMission } from "@/lib/store";
import { astronauts, labsFor, mission } from "@/lib/data";
import { CREW_IDENTITY, PHASE_LABEL, RECORD_KINDS, SYSTEMS, episodesFor, isDevice, kindMeta, type RecordKind, type SystemId } from "@/lib/crewprofile";
import { Btn, Card, PageHeader, Tag } from "@/components/ui";
import { CrewPortrait } from "@/components/crewportrait";
import Link from "next/link";
import { missionById, ROUTE_LABEL, type MissionRecord } from "@/lib/missions";
import { assignmentsOf, crewOf } from "@/lib/crewregistry";

function CrewData() {
  const { selectedId, select, labs, currentDay, medRecords, addRecord, removeRecord, loadDemoRecords, clearRecords } = useMission();
  const a = astronauts.find((x) => x.id === selectedId)!;
  const mine = medRecords.filter((r) => r.astronautId === selectedId);
  const eps = useMemo(() => episodesFor(selectedId, labsFor(labs, selectedId).length, currentDay, mission.totalDays), [selectedId, labs, currentDay]);
  const [kind, setKind] = useState<RecordKind>("condition");
  const [title, setTitle] = useState(""); const [detail, setDetail] = useState(""); const [date, setDate] = useState("");
  const [systems, setSystems] = useState<SystemId[]>([]);
  const add = () => { if (!title.trim()) return; addRecord({ astronautId: selectedId, kind, title: title.trim(), detail: detail.trim() || undefined, date: date || undefined, systems }); setTitle(""); setDetail(""); setDate(""); setSystems([]); };
  const input = "w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent";

  const last = labsFor(labs, selectedId).slice(-1)[0];
  const nLabs = labsFor(labs, selectedId).length;
  const bmi = a.massKg / Math.pow(a.heightCm / 100, 2);
  const fact = (k: string, v: React.ReactNode) => (<div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0"><dt className="text-[11px] uppercase tracking-wide text-mute">{k}</dt><dd className="num text-[13px] font-semibold text-ink">{v}</dd></div>);

  return (
    <>
      <PageHeader title="Crew profiles" desc="Crew identities, medical history and device records, and the longitudinal record per astronaut." />
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Crew">
        {astronauts.map((x) => (
          <button key={x.id} onClick={() => select(x.id)} aria-pressed={x.id === selectedId} data-crew={x.id}
            className={`flex items-center gap-3 border p-2 text-left ${x.id === selectedId ? "border-accent bg-accent/5" : "border-line bg-panel hover:bg-bg2"}`}>
            <CrewPortrait id={x.id} size={44} />
            <span><span className="block text-[13px] font-semibold text-ink">{x.id} · {x.role}</span><span className="block text-[11px] text-mute">{CREW_IDENTITY[x.id].persistentId}</span></span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-sm border border-line bg-panel lg:sticky lg:top-24" data-testid="profile-card" data-crew={selectedId}>
          <CrewPortrait id={selectedId} size={298} className="!w-full !rounded-none !border-0 border-b" />
          <div className="p-4">
            <div className="meta mono text-accent">{CREW_IDENTITY[selectedId].persistentId}</div>
            <h2 className="mt-0.5 text-lg font-semibold leading-tight text-ink">{a.role}</h2>
            <div className="text-[12px] text-mute">{a.id} · {mission.id} {mission.name}</div>
            <dl className="mt-3">
              {fact("Age", `${a.age} y`)}
              {fact("Sex", a.sex === "M" ? "Male" : "Female")}
              {fact("Height", `${a.heightCm} cm`)}
              {fact("Weight", `${a.massKg} kg`)}
              {fact("BMI", bmi.toFixed(1))}
              {fact("Gas samples", nLabs)}
              {fact("Last sample", last ? `Day ${last.missionDay}` : "—")}
            </dl>
            {a.note && <p className="mt-3 border-t border-line pt-2 text-[12px] leading-snug text-ink2">{a.note}</p>}
          </div>
        </aside>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Longitudinal record" subtitle="Observations by mission phase.">
            <ol className="space-y-2.5" data-testid="episodes">
              {eps.map((e) => (
                <li key={e.phase} className="border-l-2 border-line pl-3" data-phase={e.phase}>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">{PHASE_LABEL[e.phase]}<Tag tone={e.status === "in-progress" ? "ok" : "neutral"}>{e.status}</Tag></div>
                  <div className="text-[11px] text-mute">{e.label} · {e.period}</div>
                  <div className="text-[12px] leading-snug text-ink2">{e.note}</div>
                </li>))}
            </ol>
          </Card>
          <div className="grid content-start gap-3">
            <Card title={`Records · ${a.id}`} subtitle="History, devices, allergies and medications.">
              {mine.length === 0 ? <p className="text-[13px] text-mute" data-testid="no-records">No records for this astronaut.</p> : (
                <ul className="divide-y divide-line border border-line bg-panel" data-testid="records">{mine.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 px-3 py-2" data-record-astronaut={r.astronautId}>
                    <div className="text-[13px]"><div className="flex flex-wrap items-center gap-1.5 text-ink">{r.title}<Tag>{kindMeta(r.kind).label}</Tag>{isDevice(r) && <Tag tone="calc">device</Tag>}</div>
                      <div className="text-[11px] text-mute">{[r.date, r.detail, r.systems.join(", ")].filter(Boolean).join(" · ")}</div></div>
                    <button onClick={() => removeRecord(r.id)} className="text-[12px] text-crit hover:underline" aria-label={`Remove ${r.title}`}>Remove</button>
                  </li>))}</ul>)}
            </Card>
            <Card title="Add record" subtitle="Nothing is assigned by default.">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[12px] text-mute">Type
                  <select value={kind} onChange={(e) => setKind(e.target.value as RecordKind)} className={input}>{RECORD_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}{k.device ? " (device)" : ""}</option>)}</select></label>
                <label className="block text-[12px] text-mute">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
                <label className="block text-[12px] text-mute sm:col-span-2">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="e.g. Penicillin allergy" /></label>
                <label className="block text-[12px] text-mute sm:col-span-2">Detail<input value={detail} onChange={(e) => setDetail(e.target.value)} className={input} /></label>
                <div className="flex flex-wrap gap-1.5 sm:col-span-2" role="group" aria-label="Relevant systems">{SYSTEMS.map((s) => (
                  <button key={s.id} onClick={() => setSystems((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])} aria-pressed={systems.includes(s.id)}
                    className={`rounded-sm border px-2 py-0.5 text-[12px] ${systems.includes(s.id) ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line bg-panel text-ink2"}`}>{s.label}</button>))}</div>
                <div className="flex gap-2 sm:col-span-2"><Btn onClick={add} disabled={!title.trim()}>Add record</Btn><Btn variant="ghost" onClick={loadDemoRecords}>Load sample records</Btn><Btn variant="danger" onClick={clearRecords} disabled={medRecords.length === 0}>Clear all</Btn></div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

/** Crew profiles for a mission with no clinical records: identity and assignments only. Nothing from another mission is shown. */
function RosterOnly({ m }: { m: MissionRecord }) {
  const roster = crewOf(m);
  return (
    <div data-testid="crew-roster" data-mission={m.id}>
      <PageHeader title="Crew profiles" desc={`${m.code} · ${m.name} · ${ROUTE_LABEL[m.route]}. Identity and assignments only; no medical records are loaded for this mission.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roster.map((c) => (
          <Card key={c.code} title={`${c.code} · ${c.role}`} subtitle={c.persistentId}>
            <div className="flex gap-3" data-crew={c.code}>
              <CrewPortrait id={c.code} size={72} />
              <div className="text-[12px]">
                <div className="meta">Assignments</div>
                <ul>{assignmentsOf(c.persistentId).map((a) => <li key={a.missionId}><span className="num font-semibold">{a.missionId}</span> · {a.role} <Tag>{a.status}</Tag></li>)}</ul>
                <p className="mt-2 text-mute">Age, height, weight, history and devices: not available. No clinical records.</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-mute"><Link href={`/demo/mission/${m.id}`} className="text-accent hover:underline">Open {m.code} overview</Link></p>
    </div>
  );
}

export default function Crew() {
  const { missionId } = useMission();
  const m = missionById(missionId)!;
  return m.hasCrewData ? <CrewData /> : <RosterOnly m={m} />;
}
