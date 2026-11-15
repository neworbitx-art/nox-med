"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, Pause, Play, RotateCcw, Search, X, ArrowRight, SkipBack, Radio } from "lucide-react";
import { useMission } from "@/lib/store";
import { astronauts } from "@/lib/data";
import { statusFor } from "@/lib/alerts";
import { ACTIVE_MISSION_ID, BODY_LABEL, LEVEL_LABEL, MISSIONS, ROUTE_LABEL, isActiveMission, missionById, missionDate, shipHealthFor, type MissionRecord } from "@/lib/missions";
import { CATEGORY_LABEL, checkpointStatus, trajectoryFor } from "@/lib/trajectory";
import { msOf, type ViewMode } from "@/lib/scene";
import { NET_DISCLOSURE, modelTelemetry } from "@/lib/network";
import { freshness } from "@/lib/telemetry-adapter";
import { useShellNav } from "@/components/Shell";
import { MissionSelector } from "@/components/MissionSelector";
import { LEVEL_COLOR } from "@/components/navigator/ShipHealth";
import { ROUTE_COLOR, type HoverInfo } from "@/components/space/colors";
import type { BodyId } from "@/components/space/Bodies";
import type { ViewRequest } from "@/components/space/OrbitScene";

const OrbitScene = dynamic(() => import("@/components/space/OrbitScene"), { ssr: false });

const glass = "border border-line bg-bg/80 backdrop-blur-md text-ink";
const chip = (on: boolean) => `rounded-sm border px-2 py-1 font-mono text-[11px] tracking-wide transition ${on ? "border-accent bg-accent/15 text-accent" : "border-line bg-bg/50 text-ink2 hover:border-accent/50 hover:text-ink"}`;
const SPEEDS: { label: string; v: number }[] = [{ label: "1 min/s", v: 60 }, { label: "10 min/s", v: 600 }, { label: "1 h/s", v: 3600 }, { label: "6 h/s", v: 21600 }, { label: "1 d/s", v: 86400 }, { label: "5 d/s", v: 432000 }];
const DEFAULT_SPEED: Record<string, number> = { "NOX-01": 86400, "NOX-02": 21600, "NOX-03": 600, "NOX-04": 600 };
const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: "network", label: "OVERVIEW", hint: "Mission network: schematic composition of all missions (visually scaled)" },
  { id: "earth-moon", label: "EARTH–MOON", hint: "Earth-centred Local view with the Moon (visually scaled)" },
  { id: "mars", label: "MARS", hint: "Mars-centred Local view (visually scaled)" },
  { id: "interplanetary", label: "INTERPLANETARY", hint: "Sun-centred physics view from the stored ephemerides (heliocentric distances linear)" },
];

function hasWebGL() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }
function Level({ l }: { l: ReturnType<typeof shipHealthFor>["overall"] }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px]" data-level={l}><span className="inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[l] }} />{LEVEL_LABEL[l]}</span>;
}
const fmtT = (days: number) => { const neg = days < 0, a = Math.abs(days), d = Math.floor(a), h = Math.floor((a - d) * 24), mi = Math.floor(((a - d) * 24 - h) * 60); return `T${neg ? "−" : "+"}${d}d ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`; };
const metOf = (days: number) => { const neg = days < 0, a = Math.abs(days) * 86400, d = Math.floor(a / 86400), h = Math.floor((a % 86400) / 3600), mi = Math.floor((a % 3600) / 60), sec = Math.floor(a % 60); return `T${neg ? "−" : "+"}${d}d ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; };
const fmtKm = (km: number) => km >= 1e6 ? `${(km / 1e6).toFixed(1)}M km` : km >= 1e4 ? `${Math.round(km / 1e3).toLocaleString("en-US")}k km` : `${Math.round(km).toLocaleString("en-US")} km`;
const dateOfDay = (m: MissionRecord, day: number) => new Date(msOf(m, day)).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function MissionPanel({ m, onClose, pickedCp, onPick, onJump, onOpen }: { m: MissionRecord; onClose: () => void; pickedCp: string | null; onPick: (cp: string) => void; onJump: (day: number) => void; onOpen: () => void }) {
  const { alerts, currentDay } = useMission();
  const ship = shipHealthFor(m), active = isActiveMission(m), tr = trajectoryFor(m.id);
  const crew = useMemo(() => {
    if (!active) return null;
    const c = { nominal: 0, watch: 0, attention: 0, critical: 0 };
    astronauts.forEach((a) => { c[statusFor(alerts, a.id, currentDay)]++; });
    return c;
  }, [active, alerts, currentDay]);
  return (
    <aside className={`panel-in pointer-events-auto flex max-h-[calc(100dvh-9rem)] w-[min(370px,calc(100vw-1.5rem))] flex-col rounded-sm ${glass}`} aria-label={`${m.code} mission panel`} data-testid="mission-panel" data-mission={m.id}>
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line p-3">
        <div><div className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">{m.code}{active ? " · session mission" : ""}</div><h2 className="text-[16px] font-semibold text-ink">{m.name}</h2></div>
        <button onClick={onClose} aria-label="Close panel" className="rounded-sm p-1 text-mute hover:text-ink"><X size={15} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line p-3 text-[12px]">
          <dt className="text-mute">Phase</dt><dd>{m.vehicle.phaseLabel}</dd>
          <dt className="text-mute">Destination</dt><dd data-testid="dest">{m.destinationLabel}</dd>
          <dt className="text-mute">Mission day</dt><dd className="num">{m.vehicle.day} / {m.vehicle.totalDays} · started {m.startDate}</dd>
          <dt className="text-mute">Vehicle</dt><dd>{m.vehicle.name} <span className="font-mono text-mute">({m.vehicle.id})</span></dd>
          <dt className="text-mute">Trajectory</dt><dd><span className="mr-1.5 inline-block h-0.5 w-4 align-middle" style={{ background: ROUTE_COLOR[m.route] }} />{CATEGORY_LABEL[tr.category]}</dd>
        </dl>
        <div className="border-b border-line p-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">Crew ({m.crew.length})</div>
          <ul className="text-[12px]" data-testid="crew-list">{m.crew.map((c) => <li key={c.code}><span className="num font-semibold">{c.code}</span> <span className="text-mute">· {c.role}</span></li>)}</ul>
          <div className="mt-2 text-[12px]" data-testid="crew-health">
            <span className="text-mute">Crew health summary: </span>
            {crew ? <span>{[crew.nominal && `${crew.nominal} nominal`, crew.watch && `${crew.watch} watch`, crew.attention && `${crew.attention} attention`, crew.critical && `${crew.critical} critical`].filter(Boolean).join(" · ")}</span> : <span className="text-ink2">No crew health records for this mission</span>}
          </div>
        </div>
        <div className="border-b border-line p-3" data-testid="ship-health" data-overall={ship.overall}>
          <div className="mb-1.5 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">Spacecraft environment</span><Level l={ship.overall} /></div>
          <div className="grid grid-cols-3 gap-1">
            {ship.readings.map((r) => (
              <div key={r.key} className="rounded-sm border border-line bg-panel/70 px-1.5 py-1" data-reading={r.key} data-level={r.status}>
                <div className="text-[9px] uppercase tracking-wide text-mute">{r.label}</div>
                <div className="num text-[12px] font-semibold">{r.value === null ? <span className="font-normal text-mute">No telemetry</span> : <>{r.value.toFixed(r.decimals)} <span className="text-[9px] font-normal text-mute">{r.unit}</span></>}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">Engineering status</div>
          <ul className="mt-1 space-y-0.5 text-[11px]">{ship.subsystems.map((s) => <li key={s.key} className="flex justify-between" data-subsystem={s.key} data-level={s.status}><span className="text-ink2">{s.label}</span><Level l={s.status} /></li>)}</ul>
          <div className="mt-2 text-[11px] text-mute" data-testid="telemetry-time">Last telemetry: {ship.snapshot.timestamp ? <>{ship.snapshot.timestamp} (mission day {ship.snapshot.missionDay}) · <b className="font-medium text-ink2">{freshness(ship.snapshot)}</b></> : "none"} <span className="block">Source: {m.dataSource}</span></div>
        </div>
        <div className="border-b border-line p-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">Environmental warnings</div>
          {ship.warnings.length === 0 ? <p className="text-[12px] text-ink2" data-testid="no-warnings">{ship.overall === "unknown" ? "Unknown. No telemetry received." : "None."}</p> : (
            <ul className="space-y-1 text-[12px]" data-testid="warnings">{ship.warnings.map((w) => <li key={w.id}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[w.level] }} />{w.title}<span className="block pl-3.5 text-[11px] text-mute">{w.detail}</span></li>)}</ul>
          )}
          <p className="mt-1.5 text-[10px] text-mute">A healthy spacecraft does not imply healthy crew, and ship measurements are not astronaut clinical values.</p>
        </div>
        <div className="border-b border-line p-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">Checkpoints (planned vs actual)</div>
          <ul className="space-y-1" data-testid="checkpoint-buttons">
            {tr.checkpoints.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                <button onClick={() => onPick(c.id)} aria-pressed={pickedCp === c.id} data-cp={c.id} className={chip(pickedCp === c.id)}>{c.label}</button>
                <span className="num flex-1 text-right text-mute">{fmtT(c.plannedDay - 1)} · {c.actualDay === null ? "actual —" : `actual ${fmtT(c.actualDay - 1)}`}</span>
                <span className={checkpointStatus(m, c) === "Completed" ? "text-ok" : "text-mute"}>{checkpointStatus(m, c)}</span>
                <button onClick={() => onJump(c.plannedDay)} aria-label={`Jump simulation to ${c.label}`} data-jump={c.id} className="rounded-sm border border-line px-1 text-[10px] text-ink2 hover:border-accent/60">▶ sim</button>
              </li>
            ))}
          </ul>
        </div>
        <details className="border-b border-line p-3 text-[11px]" data-testid="traj-details">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-mute">Trajectory model · modeled, ephemeris-derived</summary>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">{tr.metrics.map((x) => <div key={x.label} className="contents"><dt className="text-mute">{x.label}</dt><dd className="num text-right text-ink2">{x.value}</dd></div>)}</dl>
          <p className="mt-2 text-mute">{tr.method}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-mute">{tr.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <Link href={`/mission/${m.id}`} onClick={onOpen} data-testid="open-mission" className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent bg-accent/15 px-3 py-2 font-mono text-[12px] font-semibold tracking-wide text-accent hover:bg-accent/25">OPEN MISSION <ArrowRight size={14} /></Link>
      </div>
    </aside>
  );
}

export default function MissionNavigatorPage() {
  const { selectMission, missionId } = useMission();
  const { openNav } = useShellNav();
  const m0 = missionById(missionId)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("network");
  const [picked, setPicked] = useState<{ missionId: string; cpId: string } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [view, setView] = useState<ViewRequest>({ kind: "mode", nonce: 0 });
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED[missionId] ?? 3600);
  const [tick, setTick] = useState(0);
  const msRef = useRef(msOf(m0, m0.vehicle.day));
  useEffect(() => { setWebgl(hasWebGL()); setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); setPicked(null); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const m = m0, tr = trajectoryFor(m.id);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const nowMs = msOf(m, m.vehicle.day), minMs = msOf(m, tr.minDay), maxMs = msOf(m, tr.maxDay);
  // Switching mission resets the simulation clock to that mission's current time (paused) and its default speed.
  useEffect(() => { msRef.current = msOf(m, m.vehicle.day); setPlaying(false); setSpeed(DEFAULT_SPEED[m.id] ?? 3600); setPicked(null); setView((v) => ({ kind: "mode", nonce: v.nonce + 1 })); bump(); }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), ui = last;
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      msRef.current = Math.min(maxMs, msRef.current + dt * speed * 1000);
      if (msRef.current >= maxMs) { setPlaying(false); bump(); return; }
      if (t - ui > 100) { ui = t; bump(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, maxMs, bump]);

  const objClick = useRef(0);
  const goMode = useCallback((mm: ViewMode) => { setMode(mm); setHover(null); setView((v) => ({ kind: "mode", nonce: v.nonce + 1 })); }, []);
  const gotoMission = useCallback((id: string) => { setHover(null); setView((v) => ({ kind: "mission", id, nonce: v.nonce + 1 })); }, []);
  const select = useCallback((id: string, focus = false) => { objClick.current = Date.now(); setHover(null); setSelected(id); setPicked(null); selectMission(id); if (focus) gotoMission(id); }, [selectMission, gotoMission]);
  const reset = useCallback(() => { setSelected(null); setPicked(null); goMode(mode); }, [goMode, mode]);
  const onReady = useCallback(() => setReady(true), []);
  const onEmpty = useCallback((dbl: boolean) => { if (dbl) reset(); else setPicked(null); }, [reset]);
  const onFocusBody = useCallback((id: BodyId) => { objClick.current = Date.now(); setHover(null); setView((v) => ({ kind: "body", id, nonce: v.nonce + 1 })); }, []);
  const onHover = useCallback((h: HoverInfo | null) => { setHover(h); if (typeof document !== "undefined") document.body.style.cursor = h && h.kind !== "body" ? "pointer" : h ? "zoom-in" : ""; }, []);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);

  const setDay = useCallback((day: number) => { msRef.current = Math.min(maxMs, Math.max(minMs, msOf(m, day))); bump(); }, [m, minMs, maxMs, bump]);

  const day = (msRef.current - msOf(m, 1)) / 86400000 + 1;
  const point = tr.at(Math.min(tr.maxDay, Math.max(tr.minDay, day)));
  const atNow = Math.abs(msRef.current - nowMs) < 60000;
  const tele = useMemo(() => modelTelemetry(m.id, Math.min(tr.maxDay, Math.max(tr.minDay, day))), [m.id, day, tr]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelM = selected ? missionById(selected) ?? null : null;
  const session = missionById(ACTIVE_MISSION_ID)!;
  const matches = q.trim() ? MISSIONS.filter((x) => `${x.code} ${x.name} ${x.destinationLabel} ${x.crew.map((c) => c.role).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const hm = hover?.missionId ? missionById(hover.missionId) : null;
  const hcp = hm && hover?.cpId ? trajectoryFor(hm.id).checkpoints.find((c) => c.id === hover.cpId) : null;
  const pm = picked ? missionById(picked.missionId) : null;
  const pcp = pm && picked ? trajectoryFor(pm.id).checkpoints.find((c) => c.id === picked.cpId) ?? null : null;
  const simState = atNow ? "AT CURRENT MISSION TIME" : msRef.current < nowMs ? "SIMULATED · PAST" : "SIMULATED · PLANNED FUTURE";

  return (
    <div className="absolute inset-0 text-ink" onPointerMove={(e) => { if (hover) setMouse({ x: e.clientX, y: e.clientY }); }} data-testid="navigator-root" data-selected={selected ?? ""} data-store-mission={missionId} data-mode={mode}>
      <div className="absolute inset-0" data-testid="scene" data-ready={ready} onDoubleClick={() => { if (Date.now() - objClick.current > 600) reset(); }}>
        {webgl && <OrbitScene missionId={missionId} mode={mode} selectedId={selected} pickedCp={picked} view={view} reduced={reduced} playing={playing} msRef={msRef} tick={tick}
          onSelectMission={(id) => select(id)} onPickCheckpoint={(mid, cp) => { objClick.current = Date.now(); setPicked({ missionId: mid, cpId: cp }); }}
          onHover={onHover} onFocusBody={onFocusBody} onEmpty={onEmpty} onReady={onReady} />}
        {webgl === false && (
          <div className="flex h-full items-center justify-center p-6" role="alert" data-testid="webgl-fallback">
            <div className={`max-w-xl rounded-sm p-4 ${glass}`}>
              <p className="text-[14px] font-semibold">The 3D scene needs WebGL, which is not available here.</p>
              <p className="mb-3 text-[12px] text-mute">Missions are still selectable from the list.</p>
              <div className="grid gap-2 sm:grid-cols-2">{MISSIONS.map((x) => <button key={x.id} onClick={() => select(x.id)} className={`${chip(selected === x.id)} text-left`}><span className="font-semibold">{x.code}</span> {x.name}<span className="block text-[10px] text-mute">{ROUTE_LABEL[x.route]}</span></button>)}</div>
            </div>
          </div>
        )}
        {webgl && !ready && <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-[0.2em] text-mute" data-testid="loading">LOADING SCENE…</div>}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 border-b border-line/70 bg-bg/80 px-3 py-2 backdrop-blur-sm">
        <button onClick={openNav} aria-label="Open navigation menu" className={`pointer-events-auto rounded-sm p-1.5 ${glass}`}><Menu size={16} /></button>
        <div className="pointer-events-auto flex flex-col leading-tight"><span className="font-mono text-[13px] font-semibold tracking-[0.18em] text-ink">NOX MED</span><span className="font-mono text-[9px] tracking-[0.16em] text-mute">MISSION NAVIGATOR</span></div>
        <div className="pointer-events-auto"><MissionSelector dark onChange={() => { setSelected(null); }} /></div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1" role="group" aria-label="Mission filter" data-testid="filter">
          <button onClick={reset} aria-pressed={!selected} className={chip(!selected)} data-filter="all">ALL</button>
          {MISSIONS.map((x) => <button key={x.id} onClick={() => select(x.id, true)} aria-pressed={selected === x.id} className={chip(selected === x.id)} data-filter={x.id}>{x.code}</button>)}
        </div>
        <div className="pointer-events-auto relative">
          <label className={`flex items-center gap-1.5 rounded-sm px-2 py-1 ${glass}`}><Search size={13} className="text-mute" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search missions" data-testid="search"
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { select(matches[0].id, true); setQ(""); } }} className="w-20 bg-transparent text-[12px] outline-none placeholder:text-mute" /></label>
          {matches.length > 0 && <ul className={`absolute left-0 top-full z-10 mt-1 w-56 rounded-sm ${glass}`} role="listbox">{matches.map((x) => <li key={x.id}><button role="option" aria-selected={false} onClick={() => { select(x.id, true); setQ(""); }} className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-white/10"><span className="font-mono">{x.code}</span> {x.name}</button></li>)}</ul>}
        </div>
        <div className="pointer-events-auto ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="View mode" data-testid="modes">
          {MODES.map((x) => <button key={x.id} onClick={() => goMode(x.id)} title={x.hint} aria-pressed={mode === x.id} className={chip(mode === x.id)} data-mode-btn={x.id}>{x.label}</button>)}
          <button onClick={reset} aria-label="Reset camera" title="Reset camera and selection" className={`${chip(false)} inline-flex items-center gap-1`} data-testid="reset"><RotateCcw size={11} /> RESET</button>
        </div>
      </header>

      {/* simulation clock (compact) */}
      <div className="pointer-events-auto absolute bottom-12 left-1/2 w-[min(980px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-sm border border-line/70 bg-bg/55 px-2 py-1.5 backdrop-blur-sm" data-testid="sim-bar" data-sim-state={atNow ? "now" : "simulated"}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button onClick={() => { if (!playing && msRef.current >= maxMs) msRef.current = minMs; setPlaying((p) => !p); }} aria-label={playing ? "Pause simulation" : "Play simulation"} data-testid="play" className={`${chip(playing)} inline-flex items-center gap-1`}>{playing ? <Pause size={12} /> : <Play size={12} />}{playing ? "PAUSE" : "PLAY"}</button>
          <button onClick={() => { setPlaying(false); setDay(tr.minDay); }} aria-label="Reset simulation to mission start" data-testid="sim-reset" className={`${chip(false)} inline-flex items-center gap-1`}><SkipBack size={12} /> START</button>
          <button onClick={() => { setPlaying(false); msRef.current = nowMs; bump(); }} aria-label="Jump to current mission time" data-testid="sim-now" className={`${chip(atNow)} inline-flex items-center gap-1`}><Radio size={12} /> NOW</button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Simulation speed" data-testid="speed" className="rounded-sm border border-line bg-bg px-1 py-0.5 font-mono text-[11px] text-ink">{SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select>
          <select value="" onChange={(e) => { const c = tr.checkpoints.find((x) => x.id === e.target.value); if (c) { setPlaying(false); setDay(c.plannedDay); setPicked({ missionId: m.id, cpId: c.id }); } }} aria-label="Jump to checkpoint" data-testid="jump" className="rounded-sm border border-line bg-bg px-1 py-0.5 font-mono text-[11px] text-ink">
            <option value="">jump to…</option>{tr.checkpoints.map((c) => <option key={c.id} value={c.id}>{c.label} ({fmtT(c.plannedDay - 1)})</option>)}</select>
          <div className="relative min-w-[140px] flex-1">
            <input type="range" min={tr.minDay} max={tr.maxDay} step={(tr.maxDay - tr.minDay) / 4000} value={Math.min(tr.maxDay, Math.max(tr.minDay, day))} onChange={(e) => { setPlaying(false); setDay(Number(e.target.value)); }} aria-label="Simulation time" data-testid="scrub" className="w-full accent-[#38C9F4]" />
            {tr.checkpoints.map((c) => <span key={c.id} title={c.label} className="pointer-events-none absolute top-0 h-2 w-px bg-ink/60" style={{ left: `calc(${((c.plannedDay - tr.minDay) / (tr.maxDay - tr.minDay)) * 100}% )` }} />)}
          </div>
          <span className="num font-mono text-[11px] font-semibold text-ink" data-testid="sim-t">{fmtT(day - 1)}</span>
          <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${atNow ? "border-lime/60 text-lime" : "border-warn/60 text-warn"}`} data-testid="sim-state" title={`Simulated playback of modeled trajectories, not a live feed. Real mission time is day ${m.vehicle.day} (${missionDate(m, m.vehicle.day)}).`}>{simState}</span>
        </div>
        <div className="sr-only" data-testid="sim-readout"><span>{dateOfDay(m, day)}</span><span data-testid="sim-phase">{point?.phase ?? "—"}</span></div>
      </div>

      {pcp && pm && (
        <div className={`pointer-events-auto absolute bottom-28 left-3 w-[min(310px,calc(100vw-1.5rem))] rounded-sm p-3 ${glass}`} data-testid="checkpoint-detail" data-cp={pcp.id}>
          <div className="flex items-start justify-between"><div><div className="font-mono text-[10px] tracking-[0.12em] text-accent">{pm.code} · CHECKPOINT</div><div className="text-[14px] font-semibold">{pcp.label}</div></div>
            <button onClick={() => setPicked(null)} aria-label="Close checkpoint" className="text-mute hover:text-ink"><X size={14} /></button></div>
          <p className="mt-1 text-[12px] text-ink2">{pcp.description}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
            <dt className="text-mute">Phase</dt><dd>{pcp.phase}</dd>
            <dt className="text-mute">Planned</dt><dd className="num">{fmtT(pcp.plannedDay - 1)} · {dateOfDay(pm, pcp.plannedDay)}</dd>
            <dt className="text-mute">Actual</dt><dd>{pcp.actualDay === null ? "Not recorded" : `${fmtT(pcp.actualDay - 1)}`}</dd>
            <dt className="text-mute">Status</dt><dd><b className="font-medium text-ink">{checkpointStatus(pm, pcp)}</b> <span className="text-mute">(mission day {pm.vehicle.day})</span></dd>
          </dl>
          <p className="mt-1 text-[10px] text-mute">{pcp.note}</p>
          <button onClick={() => { if (pm.id === m.id) { setPlaying(false); setDay(pcp.plannedDay); } }} disabled={pm.id !== m.id} className={`${chip(false)} mt-2`} data-testid="cp-jump">Jump simulation here</button>
        </div>
      )}

      {panelM && <div className="pointer-events-none absolute right-3 top-16 flex"><MissionPanel m={panelM} onClose={() => { setSelected(null); setPicked(null); }} pickedCp={picked?.missionId === panelM.id ? picked.cpId : null}
        onPick={(cp) => { objClick.current = Date.now(); setPicked({ missionId: panelM.id, cpId: cp }); }} onJump={(d) => { if (panelM.id === m.id) { setPlaying(false); setDay(d); } else select(panelM.id); }} onOpen={() => selectMission(panelM.id)} /></div>}

      <footer className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line/70 bg-bg/70 px-4 py-2 font-mono text-[11px] text-ink2 backdrop-blur-sm" data-testid="telemetry-bar">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-0.5" aria-label="Legend">
          {(Object.keys(ROUTE_LABEL) as (keyof typeof ROUTE_LABEL)[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: ROUTE_COLOR[k] }} />{ROUTE_LABEL[k]}</li>)}
          <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-ink" />Checkpoint (MCC)</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 bg-warn" />Planned maneuver</li>
        </ul>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-0.5" data-testid="telemetry-values" title={mode === "network" ? NET_DISCLOSURE : "Modeled from locally stored ephemerides (J2000 ecliptic) with Kepler/Lambert propagation. Body sizes and Local-view distances are visually scaled."}>
          <span className="font-semibold text-accent" data-testid="tm-mission">{m.code} (SELECTED)</span>
          <span data-testid="tm-status">STATUS {m.vehicle.phaseLabel.toUpperCase()}</span>
          <span data-testid="tm-met">{atNow ? "MET" : "SIM"} {metOf(day - 1)}</span>
          <span data-testid="tm-phase">PHASE {(point?.phase ?? "—").toUpperCase()}</span>
          {tele?.dist ? <span data-testid="tm-dist">{tele.dist.label} {fmtKm(tele.dist.km)}</span> : <span className="text-mute">DIST unavailable</span>}
          {tele?.speed ? <span data-testid="tm-speed">{tele.speed.label} {tele.speed.kmS.toFixed(2)} km/s</span> : <span className="text-mute">v unavailable</span>}
          <span className="text-mute">{mode === "network" ? "SCHEMATIC SCALE" : mode === "interplanetary" ? "EPHEMERIS-BASED" : "VISUAL SCALE"} · MODELED · NOT LIVE · FICTIONAL</span>
        </div>
      </footer>

      {hover && (hm || hover.bodyId) && (
        <div className={`pointer-events-none fixed z-30 max-w-[260px] rounded-sm px-2.5 py-1.5 text-[11px] ${glass}`} style={{ left: (hover.x >= 0 ? hover.x : mouse.x) + 14, top: (hover.y >= 0 ? hover.y : mouse.y) + 14 }} data-testid="tooltip" data-kind={hover.kind}>
          {hover.kind === "ship" && hm && <><div className="font-semibold text-ink">{hm.name}</div><div className="font-mono text-accent">{hm.code} · {hm.vehicle.phaseLabel}</div><div className="text-ink2">Destination: {hm.destinationLabel}</div><div className="text-mute">Mission day {hm.vehicle.day}/{hm.vehicle.totalDays}</div></>}
          {hover.kind === "checkpoint" && hm && hcp && <><div className="font-semibold text-ink">{hcp.label}</div><div className="font-mono text-accent">{hm.code} · {hcp.phase}</div><div className="text-ink2">{hcp.description}</div><div className="text-mute">Planned {fmtT(hcp.plannedDay - 1)} · {checkpointStatus(hm, hcp)}</div></>}
          {hover.kind === "body" && hover.bodyId && <div><span className="font-semibold text-ink">{BODY_LABEL[hover.bodyId as BodyId]}</span> <span className="text-mute">· click to focus</span></div>}
        </div>
      )}
    </div>
  );
}
