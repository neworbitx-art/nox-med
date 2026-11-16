"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Compass, Minus } from "lucide-react";
import { useMission } from "@/lib/store";
import { astronauts } from "@/lib/data";
import { CREW_IDENTITY, OVERVIEW_SYSTEMS, isDevice, kindMeta, type SystemId } from "@/lib/crewprofile";
import { ACTIVE_MISSION_ID, LEVEL_LABEL, ROUTE_LABEL, missionById, missionDate, shipHealthFor, worst, type MissionStatusLevel } from "@/lib/missions";
import { assignmentsOf, crewOf } from "@/lib/crewregistry";
import { BINDINGS, boundRows, type BoundSystem, type Quality } from "@/lib/systembind";
import { checkpointStatus, trajectoryFor } from "@/lib/trajectory";
import { statusFor } from "@/lib/alerts";
import { Card, Tag } from "@/components/ui";
import { CrewPortrait } from "@/components/crewportrait";
import dynamic from "next/dynamic";
import { ATLAS_SYSTEMS } from "@/components/anatomy/BodyAtlas";
import { GasPanel, VitalsPanel } from "@/components/anatomy/CrewVitalsGas";
import { vitalsFor } from "@/lib/data";
import type { Picked } from "@/components/anatomy/CinematicBody";
import { MedicalDeviceOverlay } from "@/components/anatomy/MedicalDeviceOverlay";
import { LEVEL_COLOR, StatusDot } from "@/components/navigator/ShipHealth";

const CinematicBody = dynamic(() => import("@/components/anatomy/CinematicBody"), { ssr: false, loading: () => <div className="flex h-full items-center justify-center font-mono text-[11px] text-mute">Loading anatomy…</div> });
const KIND_TEXT = { artery: "Artery · carries oxygenated blood away from the heart (pulmonary arteries carry deoxygenated blood)", vein: "Vein · returns blood toward the heart (pulmonary veins carry oxygenated blood)", heart: "Heart · myocardium and chambers", valve: "Heart valve or papillary apparatus" } as const;
const QUALITY: Record<Quality, { label: string; tone: "ok" | "warn" | "neutral" | "calc" }> = {
  valid: { label: "QC clean", tone: "ok" }, flagged: { label: "QC flag", tone: "warn" }, "not-interpreted": { label: "Not interpreted", tone: "neutral" },
  "device-reported": { label: "Device", tone: "calc" }, "ship-sensor": { label: "Ship sensor", tone: "calc" }, "recorded-with-sample": { label: "With sample", tone: "calc" }, unavailable: { label: "Unavailable", tone: "neutral" },
};
const DEEP: Record<BoundSystem, { href: string; label: string }[]> = {
  cardiovascular: [{ href: "/demo/blood-gas", label: "Blood Gas Intelligence" }, { href: "/demo/wearables", label: "Wearables" }],
  respiratory: [{ href: "/demo/blood-gas", label: "Blood Gas Intelligence" }, { href: "/demo/environment", label: "Environmental Monitoring" }, { href: "/demo/emergency", label: "Emergency Simulator" }],
  blood: [{ href: "/demo/blood-gas", label: "Blood Gas Intelligence" }, { href: "/demo/lab-import", label: "Laboratory Import" }, { href: "/demo/timeline", label: "Integrated Timeline" }],
};
const Trend = ({ t }: { t: "up" | "down" | "flat" | null }) => t === null ? <span className="text-mute" aria-label="Trend not available">—</span> : t === "up" ? <ArrowUpRight size={14} aria-label="Rising" /> : t === "down" ? <ArrowDownRight size={14} aria-label="Falling" /> : <Minus size={14} aria-label="Stable" />;
const lvl = (l: MissionStatusLevel) => <span className="inline-flex items-center gap-1.5 text-[12px]" data-level={l}><StatusDot level={l} />{LEVEL_LABEL[l]}</span>;

export default function MissionOverview() {
  const { missionId } = useParams<{ missionId: string }>();
  const m = missionById(decodeURIComponent(missionId ?? ""));
  const { selectedId, select, medRecords, selectMission, labs, alerts, currentDay, missionId: storeMission } = useMission();
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [system, setSystem] = useState<SystemId>("cardiovascular");
  const [tab, setTab] = useState<"vitals" | "gas">("vitals");
  const [pickedPart, setPickedPart] = useState<Picked | null>(null);
  const [hoverPart, setHoverPart] = useState<(Picked & { x: number; y: number }) | null>(null);
  const [focusHeart, setFocusHeart] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const mid = m?.id;
  useEffect(() => { if (mid) selectMission(mid); }, [mid, selectMission]);
  useEffect(() => { setLocalCode(null); }, [mid]);

  const roster = useMemo(() => (m ? crewOf(m) : []), [m]);
  if (!m) return <><h1 className="text-xl font-semibold">Mission not found</h1><p className="text-mute">This mission code is not in the mission list.</p><Link href="/demo" className="text-accent hover:underline">← Back to Mission Navigator</Link></>;

  const ship = shipHealthFor(m), tr = trajectoryFor(m.id), active = m.hasCrewData && m.id === storeMission;
  const crew = roster.find((c) => (c.astronaut && active ? c.astronaut.id === selectedId : c.code === (localCode ?? roster[0].code))) ?? roster[0];
  const aid = crew.astronaut?.id, hasData = active && !!aid && crew.hasClinicalRecords;
  const atlasOn = ATLAS_SYSTEMS.includes(system as never);
  const bound = (atlasOn ? system : "cardiovascular") as BoundSystem;
  const sysDef = OVERVIEW_SYSTEMS.find((s) => s.id === system)!;
  const rows = hasData && aid && atlasOn ? boundRows(aid, labs, bound) : [];
  const mine = aid ? medRecords.filter((r) => r.astronautId === aid) : [];
  const history = mine.filter((r) => !isDevice(r) && r.kind !== "medication"), meds = mine.filter((r) => r.kind === "medication"), devices = mine.filter(isDevice);
  const keys = new Set(BINDINGS[bound].map((b) => b.key ?? b.vital ?? b.id));
  const obs = hasData && aid ? alerts.filter((a) => (a.astronautId === aid || a.astronautId === "CREW") && a.missionDay > currentDay - 14 && (a.metric ? keys.has(a.metric as never) : false)).slice(-6).reverse() : [];
  const crewStatus = (() => { if (!active) return null; const c = { nominal: 0, watch: 0, attention: 0, critical: 0 }; astronauts.forEach((a) => { c[statusFor(alerts, a.id, currentDay)]++; }); return c; })();
  const envLevel = worst(ship.readings.map((r) => r.status)), engLevel = worst(ship.subsystems.map((s) => s.status));
  const assigns = assignmentsOf(crew.persistentId);
  const restingHr = useMemo(() => { const v = aid ? vitalsFor(aid) : []; return v.length ? v[v.length - 1].restingHr : 60; }, [aid]);
  const list = (items: typeof mine, none: string) => items.length === 0 ? <span className="text-mute">{none}</span> : <ul className="space-y-0.5">{items.map((r) => <li key={r.id} data-record-astronaut={r.astronautId}>{r.title} <Tag>{kindMeta(r.kind).label}</Tag></li>)}</ul>;
  const pick = (code: string, astroId?: string) => { if (astroId && active) select(astroId as never); else setLocalCode(code); };

  return (
    <div data-testid="mission-overview" data-mission={m.id}>
      <div className="mb-1"><Link href="/demo" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline" data-testid="back-to-navigator"><Compass size={12} /> Mission Navigator</Link></div>
      {/* header */}
      <header className="mb-3 border-b border-line pb-3">
        <div className="meta mono text-accent">{m.code} · Crew Health Overview</div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{m.name}</h1>
        <p className="mt-0.5 text-[13px] text-mute">{ROUTE_LABEL[m.route]} · {m.destinationLabel} · {m.vehicle.phaseLabel} · day {m.vehicle.day} of {m.vehicle.totalDays} ({missionDate(m, m.vehicle.day)} UTC)</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" data-testid="three-statuses">
          <div className="border border-line bg-panel px-3 py-2" data-status="crew"><div className="meta">Astronaut health</div><div className="text-[12px]">{crewStatus ? [crewStatus.nominal && `${crewStatus.nominal} nominal`, crewStatus.watch && `${crewStatus.watch} watch`, crewStatus.attention && `${crewStatus.attention} attention`, crewStatus.critical && `${crewStatus.critical} critical`].filter(Boolean).join(" · ") : <span className="text-mute">No clinical records</span>}</div></div>
          <div className="border border-line bg-panel px-3 py-2" data-status="environment"><div className="meta">Spacecraft environment</div>{lvl(envLevel)}</div>
          <div className="border border-line bg-panel px-3 py-2" data-status="engineering"><div className="meta">Spacecraft engineering</div>{lvl(engLevel)}</div>
        </div>
        <p className="mt-1 text-[11px] text-mute">These are three separate assessments: a healthy ship does not imply healthy crew.</p>
      </header>

      <section className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.14] bg-black lg:h-[calc(100dvh-15rem)] lg:min-h-[640px]" data-testid="viewer" data-system={system} data-functional="true" aria-label="Cinematic cardiovascular body view">
        <div className="relative h-[58dvh] min-h-[420px] lg:absolute lg:inset-0 lg:h-auto">
          <CinematicBody hr={restingHr} reduced={reduced} picked={pickedPart} onPick={setPickedPart} onHover={(p, e) => setHoverPart(p ? { ...p, x: e?.x ?? 0, y: e?.y ?? 0 } : null)} focusHeart={focusHeart} />
          <div className="pointer-events-none absolute bottom-2 left-1/2 w-[min(92%,640px)] -translate-x-1/2 text-center font-mono text-[9px] leading-snug text-white/45">Generic adult anatomy (BodyParts3D © DBCLS, CC BY 4.0 · Z-Anatomy, CC BY-SA 4.0). Not the astronaut&apos;s own anatomy and not a measurement. Heartbeat pulse rate = latest recorded resting heart rate.</div>
        </div>
        {hoverPart && <div className="pointer-events-none fixed z-50 rounded-lg border border-accent/40 bg-black/85 px-2 py-1 font-mono text-[11px] text-ink" style={{ left: hoverPart.x + 14, top: hoverPart.y + 12 }}>{hoverPart.name}</div>}

        {/* left-middle: crew member */}
        <div className="glass-curve relative z-10 m-3 lg:absolute lg:left-3 lg:top-1/2 lg:m-0 lg:max-h-[calc(100%-1.5rem)] lg:w-[330px] lg:-translate-y-1/2 lg:overflow-y-auto" data-testid="crew-panel">
          <div className="p-sec">
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Crew" data-testid="crew-switch">
              {roster.map((c) => { const on = c.code === crew.code; return (
                <button key={c.code} onClick={() => pick(c.code, c.astronaut?.id)} aria-pressed={on} data-crew={c.code} className="g-btn num !rounded-full px-2.5 py-1 text-[11px]" data-on={on}>{c.code}</button>); })}
            </div>
            <div className="flex gap-3" data-testid="profile" data-crew={crew.code}>
              {crew.portraitId ? <CrewPortrait id={crew.portraitId} size={64} /> : <div className="num flex h-[90px] w-[72px] items-center justify-center rounded-sm border border-line bg-bg2 text-[11px] text-ink2" title="Portrait placeholder">{crew.code}</div>}
              <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                <dt className="text-ink2">Crew ID</dt><dd className="text-ink">{crew.persistentId}</dd>
                <dt className="text-ink2">Role</dt><dd className="text-ink">{crew.role}</dd>
                <dt className="text-ink2">Mission</dt><dd className="text-ink">{m.code}</dd>
                <dt className="text-ink2">Age</dt><dd className="text-ink">{crew.astronaut ? `${crew.astronaut.age} y` : "Not available"}</dd>
                <dt className="text-ink2">Height</dt><dd className="text-ink">{crew.astronaut ? `${crew.astronaut.heightCm} cm` : "Not available"}</dd>
                <dt className="text-ink2">Weight</dt><dd className="text-ink">{crew.astronaut ? `${crew.astronaut.massKg} kg` : "Not available"}</dd>
              </dl>
            </div>
                        <div className="p-lab mt-2.5">Assignments</div>
            <ul className="text-[12px]" data-testid="assignments">{assigns.map((a) => <li key={a.missionId}><span className="num font-semibold">{a.missionId}</span> · {a.role} <Tag>{a.status}</Tag></li>)}</ul>
            <p className="mt-1.5 text-[11px] text-ink2">{crew.astronaut?.note ?? "Not available"}</p>
          </div>
          <div className="p-sec">
            <div className="mb-1.5 flex gap-1.5" role="tablist" aria-label="Crew measurements">
              {(["vitals", "gas"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-tab={t} className="g-btn !rounded-full px-3 py-1 font-mono text-[11px]" data-on={tab === t}>{t === "vitals" ? "VITAL SIGNS" : "GASOMETRY"}</button>)}
            </div>
            {!hasData || !aid ? <p className="text-[12px] text-mute" data-testid="not-available">No clinical records for this crew member.</p> : tab === "vitals" ? <VitalsPanel id={aid} /> : <GasPanel id={aid} labs={labs} />}
          </div>
          <div className="p-sec text-[11px]"><div className="p-lab">History / devices</div>
            <div className="mt-1 text-ink2">Relevant history: {list(history, "none recorded")}</div><div className="text-ink2">Implants / devices: {list(devices, "none recorded")}</div><div className="text-ink2">Medications: {list(meds, "none recorded")}</div></div>
        </div>

        {/* right: system selector + selected structure */}
        <div className="glass-curve relative z-10 m-3 lg:absolute lg:right-3 lg:top-3 lg:m-0 lg:w-[290px]" data-testid="system-panel">
          <div className="p-sec">
            <div className="p-lab mb-1.5">Body system</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Body system">
              {OVERVIEW_SYSTEMS.map((sy) => { const on = sy.id === "cardiovascular", fut = !on;
                return <button key={sy.id} onClick={() => on && setSystem(sy.id)} disabled={fut} aria-pressed={on && system === sy.id} data-system-option={sy.id} className="g-btn !rounded-full px-2.5 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40" data-on={on && system === sy.id}>{sy.label}{fut && <span className="ml-1 text-[8px] tracking-wide text-mute">FUTURE</span>}</button>; })}
            </div>
            <p className="mt-1.5 text-[10px] text-mute">Only the cardiovascular system is analysed in this version.</p>
          </div>
          <div className="p-sec" data-testid="structure-info">
            <div className="p-lab">Selected structure</div>
            {pickedPart ? (<><div className="mt-1 text-[14px] font-semibold text-ink" data-testid="picked-name">{pickedPart.name}</div><div className="text-[11px] text-ink2">{KIND_TEXT[pickedPart.kind]}</div></>) : <p className="mt-1 text-[12px] text-mute">Click any vessel or the heart. Drag to rotate, scroll to zoom.</p>}
            <div className="mt-2 flex gap-1.5"><button onClick={() => setFocusHeart((v) => !v)} aria-pressed={focusHeart} data-testid="focus-heart" className="g-btn !rounded-full px-3 py-1 font-mono text-[11px]" data-on={focusHeart}>{focusHeart ? "FULL BODY" : "FOCUS HEART"}</button>{pickedPart && <button onClick={() => setPickedPart(null)} className="g-btn !rounded-full px-3 py-1 font-mono text-[11px]">CLEAR</button>}</div>
            <ul className="mt-2 flex gap-3 text-[10px] text-ink2"><li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#c2161f]" />Arteries</li><li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#2a56c4]" />Veins</li><li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#a8323a]" />Heart</li></ul>
          </div>
        </div>
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Card title="Spacecraft environment and engineering" subtitle={`${m.code} · ${m.dataSource}`}>
            <div className="grid grid-cols-3 gap-1.5" data-testid="cabin-summary">
              {ship.readings.map((r) => <div key={r.key} className="border border-line bg-bg2/60 px-2 py-1" data-reading={r.key}><div className="meta">{r.label}</div><div className="num text-[13px] font-semibold">{r.value === null ? <span className="text-[11px] font-normal text-mute">No telemetry</span> : <>{r.value.toFixed(r.decimals)} <span className="text-[10px] font-normal text-mute">{r.unit}</span></>}</div></div>)}
            </div>
            <ul className="mt-2 divide-y divide-line border border-line text-[12px]">{ship.subsystems.map((s) => <li key={s.key} className="flex items-center justify-between px-2 py-1.5" data-subsystem={s.key}><span className="text-ink2">{s.label}</span>{lvl(s.status)}</li>)}</ul>
          </Card>
          <Card title={`${sysDef.label}: physiological measurements`} subtitle={hasData ? `Latest value per measurement for ${crew.code} · mission ${m.code}` : atlasOn ? `No clinical records for ${crew.code} on ${m.code}` : "Future module"}>
            {!atlasOn ? <p className="text-[12px] text-mute">Not yet modeled.</p> : !hasData ? <p className="border border-line bg-bg2/50 px-3 py-3 text-[13px] text-mute" data-testid="not-available">No clinical records. Nothing is shown for this crew member, and results from {ACTIVE_MISSION_ID} are not substituted.</p> : (
              <ul className="divide-y divide-line border border-line" data-testid="bound-rows">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-3 py-2" data-metric={r.id} data-quality={r.quality}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">{r.label}<Tag tone={QUALITY[r.quality].tone}>{QUALITY[r.quality].label}</Tag>{r.sampleType && <Tag>{r.sampleType}</Tag>}{r.provenance.map((p) => <Tag key={p} tone={p === "calculated" ? "calc" : "neutral"}>{p}</Tag>)}</div>
                      <div className="text-[11px] text-mute">{r.collected ?? "no collection time"} · {r.qualityNote}{r.note ? ` · ${r.note}` : ""}</div>
                    </div>
                    <div className="num flex items-center gap-1 text-right text-[15px] font-semibold text-ink">{r.value === null ? <span className="text-[12px] font-normal text-mute">Not available</span> : <>{r.value}<span className="text-[10px] font-normal text-mute">{r.unit}</span></>}<span className="ml-1 text-mute"><Trend t={r.trend} /></span></div>
                    <Link href={r.href} className="inline-flex items-center gap-0.5 pt-0.5 text-[12px] text-accent hover:underline" aria-label={`Open ${r.label} detail`}>Detail <ArrowRight size={11} /></Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-mute">Arterial and venous samples are not interchangeable: oxygenation values are interpreted only for arterial or capillary samples. Trends show only between comparable samples.</p>
          </Card>

      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Card title="Clinical observations" subtitle="Recent flagged items related to this system (last 14 mission days)">
            {!hasData ? <p className="text-[12px] text-mute">No observations. No clinical records for this crew member.</p> : obs.length === 0 ? <p className="text-[12px] text-mute" data-testid="no-observations">Nothing flagged for this system.</p> : (
              <ul className="space-y-1.5 text-[12px]" data-testid="observations">{obs.map((a) => <li key={a.id}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: a.severity === "critical" ? LEVEL_COLOR.critical : a.severity === "warning" ? LEVEL_COLOR.warning : LEVEL_COLOR.watch }} />{a.title} <span className="text-mute">· day {a.missionDay}</span><span className="block pl-3.5 text-[11px] text-mute">{a.detail}</span></li>)}</ul>
            )}
          </Card>
          <Card>{aid ? <MedicalDeviceOverlay system={system} astronautId={aid} /> : <p className="text-[12px] text-mute">Devices and history: Not available for this crew member.</p>}</Card>
      </div>

      <Card title="Mission timeline and detailed modules" className="mt-3" subtitle={active ? "Open the full analytical pages for this mission." : "Clinical modules open only for a mission with loaded records."}>
        <ul className="mb-3 flex flex-wrap gap-2 text-[11px]" data-testid="mission-checkpoints">{tr.checkpoints.map((c) => <li key={c.id} className="border border-line bg-bg2/60 px-2 py-1"><span className="font-semibold text-ink">{c.label}</span> <span className="num text-mute">T+{(c.plannedDay - 1).toFixed(1)} d · {checkpointStatus(m, c)}</span></li>)}</ul>
        <div className="flex flex-wrap gap-2" data-testid="module-nav">
          {(atlasOn ? DEEP[bound] : DEEP.cardiovascular).map((x) => active
            ? <Link key={x.href} href={x.href} className="rounded-sm border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink2 hover:border-accent/60 hover:text-ink">{x.label}</Link>
            : <span key={x.href} aria-disabled className="cursor-not-allowed rounded-sm border border-line bg-bg2 px-3 py-1.5 text-[13px] text-mute">{x.label}</span>)}
          <Link href="/demo" className="rounded-sm border border-accent/50 px-3 py-1.5 text-[13px] text-accent hover:bg-accent/10">Back to Mission Navigator</Link>
        </div>
      </Card>
    </div>
  );
}
