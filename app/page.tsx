"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, RotateCcw, Search, X, ArrowRight, SkipBack } from "lucide-react";
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

const glass = "glass";
const chipCls = "g-btn px-3 py-1.5 font-mono text-[11px] tracking-wide";
function chipProps(on: boolean, extra = "") { return { className: `${chipCls} ${extra}`, "data-on": on }; }
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

function CheckpointMenu({ items, onPick }: { items: { id: string; label: string }[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const d = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }, k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }; window.addEventListener("pointerdown", d); window.addEventListener("keydown", k, true); return () => { window.removeEventListener("pointerdown", d); window.removeEventListener("keydown", k, true); }; }, [open]);
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label="Go back to a completed checkpoint" data-testid="jump" className="g-btn inline-flex items-center gap-1.5 !rounded-full px-3 py-1 font-mono text-[11px] text-ink">go back to… <span aria-hidden className="text-[9px] text-accent">▾</span></button>
      {open && <ul role="listbox" aria-label="Checkpoints" className="g-menu absolute bottom-full left-0 z-20 mb-2 max-h-64 w-64 overflow-y-auto !rounded-2xl p-1" style={{ transformOrigin: "bottom left" }}>
        {items.length === 0 && <li className="px-3 py-2 text-[11px] text-ink2">No completed checkpoints yet</li>}
        {items.map((c) => <li key={c.id}><button role="option" aria-selected={false} data-cp-option={c.id} onClick={() => { onPick(c.id); setOpen(false); }} className="g-item block w-full px-3 py-1.5 text-left font-mono text-[11px]">{c.label}</button></li>)}
      </ul>}
    </div>
  );
}

function MissionPanel({ m, onClose, closing, pickedCp, onPick, onJump, onOpen }: { m: MissionRecord; onClose: () => void; closing: boolean; pickedCp: string | null; onPick: (cp: string) => void; onJump: (day: number) => void; onOpen: () => void }) {
  const { alerts, currentDay, missionId } = useMission();
  const ship = shipHealthFor(m), active = m.hasCrewData && m.id === missionId, tr = trajectoryFor(m.id);
  const crew = useMemo(() => {
    if (!active) return null;
    const c = { nominal: 0, watch: 0, attention: 0, critical: 0 };
    astronauts.forEach((a) => { c[statusFor(alerts, a.id, currentDay)]++; });
    return c;
  }, [active, alerts, currentDay]);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; return () => { if (prev && prev !== document.body && document.contains(prev)) prev.focus({ preventScroll: true }); }; }, []);
  return (
    <aside ref={ref} className={`${closing ? "panel-out" : "panel-spring"} pointer-events-auto flex max-h-[calc(100dvh-11.5rem)] w-[min(380px,calc(100vw-1.5rem))] flex-col glass-curve relative overflow-hidden max-sm:max-h-[calc(100dvh-27rem)] max-sm:w-full`} aria-label={`${m.code} mission panel`} data-testid="mission-panel" data-mission={m.id}>
      <div className="flex shrink-0 items-start justify-between gap-2 px-[18px] pb-3 pt-4">
        <div><div className="p-lab">{m.code}{active ? " · session mission" : ""}</div><h2 className="mt-0.5 text-[17px] font-semibold text-ink">{m.name}</h2></div>
        <button onClick={onClose} aria-label="Close panel" className="g-btn rounded-full p-1.5"><X size={15} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <dl className="p-sec grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-ink2">Phase</dt><dd>{m.vehicle.phaseLabel}</dd>
          <dt className="text-ink2">Status</dt><dd><Level l={ship.overall} /></dd>
          <dt className="text-ink2">Destination</dt><dd data-testid="dest">{m.destinationLabel}</dd>
          <dt className="text-ink2">Mission day</dt><dd className="num">{m.vehicle.day} / {m.vehicle.totalDays} · started {m.startDate}</dd>
          <dt className="text-ink2">Vehicle</dt><dd>{m.vehicle.name} <span className="font-mono text-mute">({m.vehicle.id})</span></dd>
          <dt className="text-ink2">Trajectory</dt><dd><span className="mr-1.5 inline-block h-0.5 w-4 align-middle" style={{ background: ROUTE_COLOR[m.route] }} />{CATEGORY_LABEL[tr.category]}</dd>
        </dl>
        <div className="p-sec">
          <div className="mb-1 p-lab">Crew ({m.crew.length})</div>
          <ul className="text-[12px]" data-testid="crew-list">{m.crew.map((c) => <li key={c.code}><span className="num font-semibold">{c.code}</span> <span className="text-mute">· {c.role}</span></li>)}</ul>
          <div className="mt-2 text-[12px]" data-testid="crew-health">
            <span className="text-mute">Crew health summary: </span>
            {crew ? <span>{[crew.nominal && `${crew.nominal} nominal`, crew.watch && `${crew.watch} watch`, crew.attention && `${crew.attention} attention`, crew.critical && `${crew.critical} critical`].filter(Boolean).join(" · ")}</span> : <span className="text-ink2">No crew health records for this mission</span>}
          </div>
          <Link href={`/mission/${m.id}`} onClick={onOpen} data-testid="crew-overview" className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-accent underline-offset-2 hover:underline">Crew Health Overview <ArrowRight size={11} /></Link>
        </div>
        <div className="p-sec" data-testid="ship-health" data-overall={ship.overall}>
          <div className="mb-1.5 flex items-center justify-between"><span className="p-lab">Spacecraft environment</span><Level l={ship.overall} /></div>
          <div className="grid grid-cols-2 gap-x-4">
            {ship.readings.map((r) => (
              <div key={r.key} className="p-row items-baseline border-b border-white/[0.06]" data-reading={r.key} data-level={r.status}>
                <span className="text-[11px]"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: LEVEL_COLOR[r.status] }} />{r.label}</span>
                <span className="num font-semibold text-ink">{r.value === null ? <span className="font-normal text-ink2">No telemetry</span> : <>{r.value.toFixed(r.decimals)} <span className="text-[9px] font-normal text-ink2">{r.unit}</span></>}</span>
              </div>
            ))}
          </div>
          <div className="p-lab mt-3">Spacecraft systems</div>
          <ul className="mt-1 text-[11px]">{ship.subsystems.map((s) => <li key={s.key} className="p-row border-b border-white/[0.06]" data-subsystem={s.key} data-level={s.status}><span className="text-ink2">{s.label}</span><Level l={s.status} /></li>)}</ul>
          <div className="mt-2 text-[11px] text-mute" data-testid="telemetry-time">Last telemetry: {ship.snapshot.timestamp ? <>{ship.snapshot.timestamp} (mission day {ship.snapshot.missionDay}) · <b className="font-medium text-ink2">{freshness(ship.snapshot)}</b></> : "none"} <span className="block">Source: {m.dataSource}</span></div>
        </div>
        <div className="p-sec">
          <div className="mb-1 p-lab">Environmental warnings</div>
          {ship.warnings.length === 0 ? <p className="text-[12px] text-ink2" data-testid="no-warnings">{ship.overall === "unknown" ? "Unknown. No telemetry received." : "None."}</p> : (
            <ul className="space-y-1 text-[12px]" data-testid="warnings">{ship.warnings.map((w) => <li key={w.id}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[w.level] }} />{w.title}<span className="block pl-3.5 text-[11px] text-mute">{w.detail}</span></li>)}</ul>
          )}
          <p className="mt-1.5 text-[10px] text-mute">A healthy spacecraft does not imply healthy crew, and ship measurements are not astronaut clinical values.</p>
        </div>
        <div className="p-sec">
          <div className="mb-1 p-lab">Checkpoints (planned vs actual)</div>
          <ul className="space-y-1" data-testid="checkpoint-buttons">
            {tr.checkpoints.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                <button onClick={() => onPick(c.id)} aria-pressed={pickedCp === c.id} data-cp={c.id} {...chipProps(pickedCp === c.id)}>{c.label}</button>
                <span className="num flex-1 text-right text-mute">{fmtT(c.plannedDay - 1)} · {c.actualDay === null ? "actual —" : `actual ${fmtT(c.actualDay - 1)}`}</span>
                <span className={checkpointStatus(m, c) === "Completed" ? "text-ok" : "text-mute"}>{checkpointStatus(m, c)}</span>
                <button onClick={() => onJump(c.plannedDay)} aria-label={`Jump to ${c.label}`} data-jump={c.id} className="g-btn px-1.5 text-[10px]">▶ sim</button>
              </li>
            ))}
          </ul>
        </div>
        <details className="p-sec text-[11px]" data-testid="traj-details">
          <summary className="cursor-pointer p-lab">Trajectory model · modeled, ephemeris-derived</summary>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">{tr.metrics.map((x) => <div key={x.label} className="contents"><dt className="text-ink2">{x.label}</dt><dd className="num text-right text-ink2">{x.value}</dd></div>)}</dl>
          <p className="mt-2 text-mute">{tr.method}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-mute">{tr.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      </div>
      <div className="shrink-0 border-t border-white/[0.09] px-[18px] py-3.5">
        <Link href={`/mission/${m.id}`} onClick={onOpen} data-testid="open-mission" className="open-btn flex w-full items-center justify-center gap-1.5 px-3 py-2.5 font-mono text-[12px] font-semibold tracking-wider">OPEN MISSION <ArrowRight size={14} /></Link>
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
  const [live, setLive] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  const msRef = useRef(msOf(m0, m0.vehicle.day));
  useEffect(() => { setHydrated(true); setWebgl(hasWebGL()); setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const [closing, setClosing] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => { const u = () => setScrubbing(false); window.addEventListener("pointerup", u); window.addEventListener("pointercancel", u); return () => { window.removeEventListener("pointerup", u); window.removeEventListener("pointercancel", u); }; }, []);
  const closeRef = useRef<() => void>(() => {});
  const closePanel = useCallback(() => { const fin = () => { setSelected(null); setPicked(null); setClosing(false); }; if (reduced) fin(); else { setClosing(true); window.setTimeout(fin, 260); } }, [reduced]);
  closeRef.current = closePanel;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const m = m0, tr = trajectoryFor(m.id);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const nowMs = msOf(m, m.vehicle.day), minMs = msOf(m, tr.minDay), maxMs = msOf(m, tr.maxDay);
  // Live mission clock: ticks in real time from the mission's current day (time of day follows the viewer's UTC clock). Scrubbing back leaves live mode; LIVE returns.
  const liveRef = useRef({ base: nowMs + (Date.now() % 86400000), t0: 0 });
  const liveNow = useCallback(() => Math.min(maxMs, liveRef.current.base + (performance.now() - liveRef.current.t0)), [maxMs]);
  useEffect(() => { liveRef.current = { base: nowMs + (Date.now() % 86400000), t0: performance.now() }; msRef.current = liveNow(); setLive(true); setPicked(null); setView((v) => ({ kind: "mode", nonce: v.nonce + 1 })); bump(); }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!live) return;
    let raf = 0, ui = 0;
    const loop = (t: number) => { msRef.current = liveNow(); if (t - ui > 500) { ui = t; bump(); } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, liveNow, bump]);

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

  const setDay = useCallback((day: number) => { setLive(false); msRef.current = Math.min(liveNow(), Math.max(minMs, msOf(m, day))); bump(); }, [m, minMs, liveNow, bump]);
  const goLive = useCallback(() => { setLive(true); msRef.current = liveNow(); bump(); }, [liveNow, bump]);

  const day = (msRef.current - msOf(m, 1)) / 86400000 + 1;
  const point = tr.at(Math.min(tr.maxDay, Math.max(tr.minDay, day)));
  const atNow = live;
  const liveDay = hydrated ? Math.min(tr.maxDay, (liveNow() - msOf(m, 1)) / 86400000 + 1) : m.vehicle.day; // wall-clock dependent values are only used after hydration
  const tele = useMemo(() => modelTelemetry(m.id, Math.min(tr.maxDay, Math.max(tr.minDay, day))), [m.id, day, tr]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelM = selected ? missionById(selected) ?? null : null;
  const session = missionById(ACTIVE_MISSION_ID)!;
  const matches = q.trim() ? MISSIONS.filter((x) => `${x.code} ${x.name} ${x.destinationLabel} ${x.crew.map((c) => c.role).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const hm = hover?.missionId ? missionById(hover.missionId) : null;
  const hcp = hm && hover?.cpId ? trajectoryFor(hm.id).checkpoints.find((c) => c.id === hover.cpId) : null;
  const pm = picked ? missionById(picked.missionId) : null;
  const pcp = pm && picked ? trajectoryFor(pm.id).checkpoints.find((c) => c.id === picked.cpId) ?? null : null;


  return (
    <div className="absolute inset-0 text-ink" onPointerMove={(e) => { if (hover) setMouse({ x: e.clientX, y: e.clientY }); }} data-testid="navigator-root" data-selected={selected ?? ""} data-store-mission={missionId} data-mode={mode}>
      <div className="absolute inset-0" data-testid="scene" data-ready={ready} onDoubleClick={() => { if (Date.now() - objClick.current > 600) reset(); }}>
        {webgl && <OrbitScene missionId={missionId} mode={mode} selectedId={selected} pickedCp={picked} view={view} reduced={reduced} playing={live && !reduced} msRef={msRef} tick={tick}
          onSelectMission={(id) => select(id)} onPickCheckpoint={(mid, cp) => { objClick.current = Date.now(); setPicked({ missionId: mid, cpId: cp }); }}
          onHover={onHover} onFocusBody={onFocusBody} onEmpty={onEmpty} onReady={onReady} />}
        {webgl === false && (
          <div className="flex h-full items-center justify-center p-6" role="alert" data-testid="webgl-fallback">
            <div className={`max-w-xl p-4 ${glass}`}>
              <p className="text-[14px] font-semibold">The 3D scene needs WebGL, which is not available here.</p>
              <p className="mb-3 text-[12px] text-mute">Missions are still selectable from the list.</p>
              <div className="grid gap-2 sm:grid-cols-2">{MISSIONS.map((x) => <button key={x.id} onClick={() => select(x.id)} {...chipProps(selected === x.id, "text-left")}><span className="font-semibold">{x.code}</span> {x.name}<span className="block text-[10px] text-mute">{ROUTE_LABEL[x.route]}</span></button>)}</div>
            </div>
          </div>
        )}
        {webgl && !ready && <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-[0.2em] text-mute" data-testid="loading">LOADING SCENE…</div>}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 glass-bar px-3 py-2.5">
        <button onClick={openNav} aria-label="Open navigation menu" className="g-btn pointer-events-auto p-2"><Menu size={16} /></button>
        <div className="pointer-events-auto flex flex-col leading-tight"><span className="font-mono text-[13px] font-semibold tracking-[0.18em] text-ink">NOX MED</span><span className="font-mono text-[9px] tracking-[0.16em] text-mute">MISSION NAVIGATOR</span></div>
        <div className="pointer-events-auto"><MissionSelector dark onChange={() => { setSelected(null); }} /></div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1" role="group" aria-label="Mission filter" data-testid="filter">
          <button onClick={reset} aria-pressed={!selected} {...chipProps(!selected)} data-filter="all">ALL</button>
          {MISSIONS.map((x) => <button key={x.id} onClick={() => select(x.id, true)} aria-pressed={selected === x.id} {...chipProps(selected === x.id)} data-filter={x.id}>{x.code}</button>)}
        </div>
        <div className="pointer-events-auto relative">
          <label className="g-field flex items-center gap-2 px-3 py-1.5"><Search size={13} className="text-mute" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search missions" data-testid="search"
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { select(matches[0].id, true); setQ(""); } }} className="w-32 bg-transparent text-[12px] text-ink outline-none placeholder:text-mute" /></label>
          {matches.length > 0 && <ul className="g-menu absolute left-0 top-full z-10 mt-2 w-64" role="listbox">{matches.map((x) => <li key={x.id}><button role="option" aria-selected={false} onClick={() => { select(x.id, true); setQ(""); }} className="g-item block w-full px-3 py-2 text-left text-[12px]"><span className="font-mono">{x.code}</span> {x.name}</button></li>)}</ul>}
        </div>
        <div className="pointer-events-auto ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="View mode" data-testid="modes">
          {MODES.map((x) => <button key={x.id} onClick={() => goMode(x.id)} title={x.hint} aria-pressed={mode === x.id} {...chipProps(mode === x.id)} data-mode-btn={x.id}>{x.label}</button>)}
          <button onClick={reset} aria-label="Reset camera" title="Reset camera and selection" {...chipProps(false, "inline-flex items-center gap-1")} data-testid="reset"><RotateCcw size={11} /> RESET</button>
        </div>
      </header>

      {/* simulation clock (compact) */}
      <div className="glass-dock pointer-events-auto absolute bottom-12 left-1/2 w-[min(980px,calc(100vw-1.5rem))] -translate-x-1/2 px-4 py-2.5 max-sm:bottom-[7.25rem] max-sm:rounded-[22px] max-sm:px-3" data-testid="sim-bar" data-sim-state={live ? "live" : "replay"}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <button onClick={goLive} aria-label="Return to live mission clock" data-testid="sim-now" {...chipProps(live, "inline-flex items-center gap-1.5 !rounded-full")}><span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-lime nav-blink" : "bg-mute"}`} /> LIVE</button>
          <button onClick={() => setDay(tr.minDay)} aria-label="Go back to mission start" data-testid="sim-reset" {...chipProps(false, "inline-flex items-center gap-1 !rounded-full")}><SkipBack size={12} /> START</button>
          <CheckpointMenu items={tr.checkpoints.filter((c) => c.plannedDay <= liveDay).map((c) => ({ id: c.id, label: `${c.label} (${fmtT(c.plannedDay - 1)})` }))} onPick={(id) => { const c = tr.checkpoints.find((x) => x.id === id); if (c) { setDay(c.plannedDay); setPicked({ missionId: m.id, cpId: c.id }); } }} />
          <div className="relative min-w-[140px] flex-1 max-sm:order-last max-sm:basis-full">
            {(() => { const lo = tr.minDay, hi = Math.max(lo + 1e-6, liveDay), v = Math.min(hi, Math.max(lo, day)), pct = ((v - lo) / (hi - lo)) * 100; return (<>
              <input type="range" min={lo} max={liveDay} step={Math.max(1e-6, (liveDay - lo) / 4000)} value={v} onChange={(e) => setDay(Number(e.target.value))} onPointerDown={() => setScrubbing(true)} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setScrubbing(true); }} onBlur={() => setScrubbing(false)} aria-label="Mission time" aria-valuetext={metOf(day - 1)} data-testid="scrub" data-drag={scrubbing} className="tl" style={{ ["--p" as string]: `${pct}%` }} />
              {tr.checkpoints.filter((c) => c.plannedDay <= liveDay).map((c) => <span key={c.id} title={c.label} className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/50" style={{ left: `${((c.plannedDay - lo) / (hi - lo)) * 100}%` }} />)}
              <span aria-hidden className="num pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent/40 bg-black/80 px-2 py-0.5 font-mono text-[10px] text-ink transition-opacity duration-150" style={{ left: `clamp(40px, ${pct}%, calc(100% - 40px))`, opacity: scrubbing ? 1 : 0 }} data-testid="scrub-tip">{metOf(day - 1)}</span></>); })()}
          </div>
          <span className="num font-mono text-[12px] font-semibold text-ink" data-testid="sim-t">{metOf(day - 1)}</span>
          <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${live ? "border-lime/60 text-lime" : "border-accent/60 text-accent"}`} data-testid="sim-state" title="Positions are computed from the mission trajectory model.">{live ? "● LIVE" : "PAST"}</span>
        </div>
        <div className="sr-only" data-testid="sim-readout"><span>{dateOfDay(m, day)}</span><span data-testid="sim-phase">{point?.phase ?? "—"}</span></div>
      </div>

      {pcp && pm && (
        <div className={`pointer-events-auto absolute bottom-28 left-3 w-[min(310px,calc(100vw-1.5rem))] p-3 ${glass}`} data-testid="checkpoint-detail" data-cp={pcp.id}>
          <div className="flex items-start justify-between"><div><div className="font-mono text-[10px] tracking-[0.12em] text-accent">{pm.code} · CHECKPOINT</div><div className="text-[14px] font-semibold">{pcp.label}</div></div>
            <button onClick={() => setPicked(null)} aria-label="Close checkpoint" className="text-mute hover:text-ink"><X size={14} /></button></div>
          <p className="mt-1 text-[12px] text-ink2">{pcp.description}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
            <dt className="text-ink2">Phase</dt><dd>{pcp.phase}</dd>
            <dt className="text-ink2">Planned</dt><dd className="num">{fmtT(pcp.plannedDay - 1)} · {dateOfDay(pm, pcp.plannedDay)}</dd>
            <dt className="text-ink2">Actual</dt><dd>{pcp.actualDay === null ? "Not recorded" : `${fmtT(pcp.actualDay - 1)}`}</dd>
            <dt className="text-ink2">Status</dt><dd><b className="font-medium text-ink">{checkpointStatus(pm, pcp)}</b> <span className="text-mute">(mission day {pm.vehicle.day})</span></dd>
          </dl>
          <p className="mt-1 text-[10px] text-mute">{pcp.note}</p>
          <button onClick={() => { if (pm.id === m.id) { setDay(pcp.plannedDay); } }} disabled={pm.id !== m.id} {...chipProps(false, "mt-2")} data-testid="cp-jump">Go back to this checkpoint</button>
        </div>
      )}

      {panelM && <div className="pointer-events-none absolute right-3 top-16 flex max-sm:inset-x-2 max-sm:bottom-[16rem] max-sm:top-auto max-sm:items-end"><MissionPanel m={panelM} closing={closing} onClose={closePanel} pickedCp={picked?.missionId === panelM.id ? picked.cpId : null}
        onPick={(cp) => { objClick.current = Date.now(); setPicked({ missionId: panelM.id, cpId: cp }); }} onJump={(d) => { if (panelM.id === m.id) { setDay(d); } else select(panelM.id); }} onOpen={() => selectMission(panelM.id)} /></div>}

      <footer className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 glass-foot px-4 py-2.5 font-mono text-[11px] text-ink2" data-testid="telemetry-bar">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-0.5 max-sm:hidden" aria-label="Legend">
          {(Object.keys(ROUTE_LABEL) as (keyof typeof ROUTE_LABEL)[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: ROUTE_COLOR[k] }} />{ROUTE_LABEL[k]}</li>)}
          <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-ink" />Checkpoint (MCC)</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 bg-warn" />Planned maneuver</li>
        </ul>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-0.5" data-testid="telemetry-values" title={mode === "network" ? NET_DISCLOSURE : "Modeled from locally stored ephemerides (J2000 ecliptic) with Kepler/Lambert propagation. Body sizes and Local-view distances are visually scaled."}>
          <span className="font-semibold text-accent" data-testid="tm-mission">{m.code} (SELECTED)</span>
          <span data-testid="tm-status">STATUS {m.vehicle.phaseLabel.toUpperCase()}</span>
          <span data-testid="tm-met">MET {metOf(day - 1)}</span>
          <span data-testid="tm-phase">PHASE {(point?.phase ?? "—").toUpperCase()}</span>
          {tele?.dist ? <span data-testid="tm-dist">{tele.dist.label} {fmtKm(tele.dist.km)}</span> : <span className="text-mute">DIST unavailable</span>}
          {tele?.speed ? <span data-testid="tm-speed">{tele.speed.label} {tele.speed.kmS.toFixed(2)} km/s</span> : <span className="text-mute">v unavailable</span>}
          <span className="text-mute">{mode === "network" ? "SCHEMATIC SCALE" : mode === "interplanetary" ? "EPHEMERIS-BASED" : "VISUAL SCALE"} · MODEL-DERIVED POSITIONS</span>
        </div>
      </footer>

      {hover && (hm || hover.bodyId) && (
        <div className={`pointer-events-none fixed z-30 max-w-[260px] px-3 py-2 text-[11px] ${glass}`} style={{ left: (hover.x >= 0 ? hover.x : mouse.x) + 14, top: (hover.y >= 0 ? hover.y : mouse.y) + 14 }} data-testid="tooltip" data-kind={hover.kind}>
          {hover.kind === "ship" && hm && <><div className="font-semibold text-ink">{hm.name}</div><div className="font-mono text-accent">{hm.code} · {hm.vehicle.phaseLabel}</div><div className="text-ink2">Destination: {hm.destinationLabel}</div><div className="text-mute">Mission day {hm.vehicle.day}/{hm.vehicle.totalDays}</div></>}
          {hover.kind === "checkpoint" && hm && hcp && <><div className="font-semibold text-ink">{hcp.label}</div><div className="font-mono text-accent">{hm.code} · {hcp.phase}</div><div className="text-ink2">{hcp.description}</div><div className="text-mute">Planned {fmtT(hcp.plannedDay - 1)} · {checkpointStatus(hm, hcp)}</div></>}
          {hover.kind === "body" && hover.bodyId && <div><span className="font-semibold text-ink">{BODY_LABEL[hover.bodyId as BodyId]}</span> <span className="text-mute">· click to focus</span></div>}
        </div>
      )}
    </div>
  );
}
