"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { dayToDate, elapsedDays, labsFor, mission } from "@/lib/data";
import { useMission } from "@/lib/store";
import { ENV_KEYS, ENV_VARS, clockOf, co2FractionPct, co2Ppm, envPoints, envSeries, missingIntervals, nearest, type EnvVar } from "@/lib/telemetry";
import { WINDOWS, nearLines, toPts, truncated, windowOf, yDomain } from "@/lib/chartutil";
import { Card, Chip, CREW_COLORS, PageHeader, Segmented, Stat, Tag } from "@/components/ui";
import { LabChart } from "@/components/labchart";
import { ShipHealthPanel } from "@/components/navigator/ShipHealth";
import { missionById } from "@/lib/missions";

const state = (k: EnvVar, v: number | null): "ok" | "warn" | "crit" | undefined => {
  if (v === null) return undefined;
  const e = ENV_VARS[k];
  if (e.warn !== undefined && v > e.warn) return "crit";
  if ((e.high !== undefined && v > e.high) || (e.low !== undefined && v < e.low)) return "warn";
  return "ok";
};
const MAX = 3;

export default function Environment() {
  const { labs, selectedId, alerts, currentDay, missionId } = useMission();
  const [vars, setVars] = useState<EnvVar[]>(["co2", "o2pp"]);
  const [win, setWin] = useState(14);
  const [resMode, setResMode] = useState<"auto" | "hourly" | "daily">("auto");
  const [showLabs, setShowLabs] = useState(true);
  const [zero, setZero] = useState<"auto" | "zero">("auto");
  const [hoverT, setHoverT] = useState<number | null>(null);

  const [t0, t1] = windowOf(win, currentDay);
  const res = resMode === "auto" ? (win <= 14 ? "hourly" : "daily") : resMode;
  const step = res === "hourly" ? 1 / 24 : 1;
  const pts = useMemo(() => envPoints(), []);
  const last = pts[pts.length - 1];
  const lastOf = (k: EnvVar) => [...pts].reverse().find((p) => p.v[k] !== null);

  const toggle = (k: EnvVar) => setVars((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : p.length >= MAX ? [...p.slice(1), k] : [...p, k]));
  const labT = useMemo(() => labsFor(labs, selectedId).map((l) => elapsedDays(l.collectedAt)).filter((t) => t >= t0 && t <= t1), [labs, selectedId, t0, t1]);

  const charts = vars.map((k) => {
    const s = envSeries(k, t0, t1, res, pts);
    const miss = missingIntervals(s, step, t0, t1);
    const e = ENV_VARS[k];
    const vals = s.map((p) => p.v);
    const dom = yDomain(vals, nearLines(vals, [e.high, e.warn, e.low]), zero === "zero");
    return { k, s, miss, e, dom, cov: miss.reduce((a, [x, y]) => a + (y - x), 0) };
  });

  const co2Last = lastOf("co2"), pLast = lastOf("pressure"), o2Last = lastOf("o2pp");
  const events = alerts.filter((a) => a.category === "environment").slice(0, 8);
  const readout = hoverT === null ? null : charts.map((c) => ({ k: c.k, p: nearest(c.s, hoverT, step * 1.5) }));

  return (
    <>
      <PageHeader code="MOD-ENV" title="Environmental Monitoring"
        desc={`Hourly cabin telemetry for ${mission.id} with true timestamps shared with laboratory sampling. Missing data is shown as gaps, never filled in.`} />

      <Card className="mb-4" code="SHP-ENV" title="Spacecraft status (selected mission)" subtitle="Environment and engineering state of the vehicle. Separate from astronaut health.">
        <ShipHealthPanel m={missionById(missionId)!} />
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {ENV_KEYS.map((x) => {
          const p = lastOf(x); const v = p?.v[x] ?? null;
          return (
            <button key={x} onClick={() => toggle(x)} aria-pressed={vars.includes(x)} className={`rounded-sm text-left ${vars.includes(x) ? "ring-1 ring-accent" : ""}`}>
              <Stat label={ENV_VARS[x].label} value={<>{v === null ? "—" : v.toFixed(ENV_VARS[x].decimals)}<span className="text-xs text-mute"> {ENV_VARS[x].unit}</span></>}
                tone={state(x, v)} sub={p ? `${clockOf(p.t)}${ENV_VARS[x].derived ? " · derived" : ""}` : "no data"} />
            </button>
          );
        })}
      </div>

      <Card className="mb-4" code="CTL-ENV" title="Channels and time window">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap items-center gap-1"><span className="meta mr-1">Channels (max {MAX})</span>
            {ENV_KEYS.map((k) => <Chip key={k} active={vars.includes(k)} onClick={() => toggle(k)} title={ENV_VARS[k].note}>{ENV_VARS[k].label.replace("Cabin ", "")}</Chip>)}</div>
          <Segmented label="Window" value={win} onChange={setWin} options={WINDOWS} />
          <Segmented label="Resolution" value={resMode} onChange={setResMode} options={[{ value: "auto", label: `Auto (${res})` }, { value: "hourly", label: "Hourly" }, { value: "daily", label: "Daily mean" }]} />
          <Segmented label="Y axis" value={zero} onChange={setZero} options={[{ value: "auto", label: "Auto-fit" }, { value: "zero", label: "From zero" }]} />
          <Segmented label={`${selectedId} lab times`} value={showLabs ? "on" : "off"} onChange={(v) => setShowLabs(v === "on")} options={[{ value: "on", label: "Show" }, { value: "off", label: "Hide" }]} />
        </div>
        <p className="mt-2 text-[11px] text-mute">Daily means need ≥ 12 recorded hours. Dotted vertical lines mark blood-sample collection times for {selectedId} ({labT.length} in window). Gray bands = no telemetry recorded.</p>
      </Card>

      <Card className="mb-4" code="PLT-ENV" title="Cabin telemetry time series" subtitle={`${dayToDate(Math.max(1, Math.floor(t0)))} → ${dayToDate(currentDay)} · ${res === "hourly" ? "hourly samples" : "daily means"} · UTC`}>
        <div className="num mb-2 min-h-5 border border-line bg-bg2 px-2 py-1 text-[12px] text-ink2">
          {readout ? <><b className="text-ink">{clockOf(hoverT as number)}</b>{readout.map((r) => <span key={r.k} className="ml-4">{ENV_VARS[r.k].label}: <b className="text-ink">{r.p ? `${r.p.v.toFixed(ENV_VARS[r.k].decimals)} ${ENV_VARS[r.k].unit}` : "no data"}</b></span>)}</>
            : <span className="text-mute">Hover a chart to read all channels at the same instant.</span>}
        </div>
        <div className="space-y-4">
          {charts.map((c, i) => (
            <div key={c.k}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2"><span className="text-[13px] font-semibold text-ink">{c.e.label}</span><span className="text-[11px] text-mute">{c.e.unit}</span>{c.e.derived && <Tag tone="calc">derived</Tag>}</div>
                <div className="text-[11px] text-mute">{c.s.length} recorded {res === "hourly" ? "hours" : "days"} · {c.miss.length} gap{c.miss.length === 1 ? "" : "s"}{truncated(c.dom, c.s.map((p) => p.v)) && <span className="ml-2 font-semibold text-warn">Y-axis starts at {c.dom[0].toFixed(c.e.decimals)} (not zero)</span>}</div>
              </div>
              {c.s.length === 0 ? <p className="border border-dashed border-line p-6 text-center text-[13px] text-mute">No telemetry recorded in this window.</p> :
                <LabChart series={[{ id: c.k, label: c.e.label, color: i === 0 ? "#38C9F4" : i === 1 ? "#A78BFA" : "#B9C6E3", points: toPts(c.s, c.k) }]} domain={[t0, t1]} yDomain={c.dom} unit={c.e.unit} decimals={c.e.decimals + 1}
                  dots={false} breakGapDays={step * 1.5} bands={c.miss.map(([x1, x2]) => ({ x1, x2, fill: "#7F90B5", label: x2 - x1 > (t1 - t0) * 0.06 ? "no data" : undefined }))}
                  vlines={showLabs ? labT.map((t) => ({ t })) : []} hlines={[c.e.warn !== undefined && { y: c.e.warn, label: `limit ${c.e.warn}`, color: "#F87171" }, c.e.high !== undefined && c.e.low === undefined && { y: c.e.high, label: `watch ${c.e.high}`, color: "#F5B642" }].filter(Boolean) as { y: number; label: string; color: string }[]}
                  hoverT={hoverT} onHoverT={setHoverT} xLabel={i === charts.length - 1} height={i === charts.length - 1 ? 220 : 185} />}
              <p className="mt-0.5 text-[11px] text-mute">{c.e.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card code="REF-UNITS" title="Units: pressure vs percent vs ppm" subtitle="Same gas, different quantities. Cabin values here are ambient air, never blood values.">
          <table className="w-full text-[13px]">
            <tbody>
              <tr className="border-b border-line/60"><td className="py-1.5 text-ink2">Cabin CO₂ partial pressure (measured)</td><td className="num py-1.5 text-right font-semibold">{co2Last?.v.co2?.toFixed(2)} mmHg</td></tr>
              <tr className="border-b border-line/60"><td className="py-1.5 text-ink2">… as volume fraction (derived)</td><td className="num py-1.5 text-right">{co2Last && pLast ? co2FractionPct(co2Last.v.co2 as number, pLast.v.pressure as number).toFixed(2) : "—"} %</td></tr>
              <tr className="border-b border-line/60"><td className="py-1.5 text-ink2">… as ppm (derived)</td><td className="num py-1.5 text-right">{co2Last && pLast ? Math.round(co2Ppm(co2Last.v.co2 as number, pLast.v.pressure as number)).toLocaleString() : "—"} ppm</td></tr>
              <tr className="border-b border-line/60"><td className="py-1.5 text-ink2">Total cabin pressure</td><td className="num py-1.5 text-right">{pLast?.v.pressure?.toFixed(2)} kPa = {pLast ? ((pLast.v.pressure as number) * 7.50062).toFixed(0) : "—"} mmHg</td></tr>
              <tr><td className="py-1.5 text-ink2">Cabin O₂ partial pressure (derived)</td><td className="num py-1.5 text-right">{o2Last?.v.o2pp?.toFixed(1)} mmHg</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-mute">Partial pressure (mmHg, kPa) is the gas&apos;s share of total pressure; % and ppm are volume fractions that depend on total pressure. Blood pCO₂ is a physiological measurement in blood and is shown separately in Blood Gas Intelligence.</p>
          <p className="mt-2 text-[12px]"><Link href="/demo/timeline" className="font-medium text-accent underline">Open Integrated Timeline</Link> to explore cabin CO₂ and {selectedId}&apos;s blood pCO₂ on a shared time axis.</p>
        </Card>

        <Card code="QA-COVERAGE" title="Data completeness" subtitle={`Recorded hours in window (${Math.round(t1 - t0)} d)`}>
          <table className="w-full text-[12px]">
            <thead><tr className="meta text-left"><th className="py-1">Channel</th><th className="py-1 text-right">Recorded</th><th className="py-1 text-right">Coverage</th></tr></thead>
            <tbody>
              {ENV_KEYS.filter((k) => k !== "dose").map((k) => {
                const exp = Math.round((t1 - t0) * 24), n = pts.filter((p) => p.t >= t0 && p.t < t1 && p.v[k] !== null).length, c = n / exp;
                return <tr key={k} className="border-t border-line/60"><td className="py-1 text-ink2">{ENV_VARS[k].label}</td><td className="num py-1 text-right">{n}/{exp} h</td><td className={`num py-1 text-right ${c < 0.95 ? "font-semibold text-warn" : "text-ok"}`}>{(c * 100).toFixed(1)}%</td></tr>;
              })}
            </tbody>
          </table>
          {(() => {
            const g = missingIntervals(envSeries("co2", t0, t1, "hourly", pts), 1 / 24, t0, t1).slice(0, 5);
            return g.length ? <ul className="num mt-2 space-y-0.5 text-[11px] text-mute">{g.map(([a, b], i) => <li key={i}>CO₂ gap: {clockOf(a)} → {clockOf(b)} ({((b - a) * 24).toFixed(0)} h)</li>)}</ul> : <p className="mt-2 text-[11px] text-mute">No CO₂ gaps in this window.</p>;
          })()}
          <div className="mt-3 border-t border-line pt-2">
            <div className="meta mb-1">Environmental events (rule-generated)</div>
            <ul className="divide-y divide-line/60 text-[12px]">
              {events.map((a) => <li key={a.id} className="py-1.5"><span className="num mr-2 text-mute">D{a.missionDay}</span><span className="text-ink">{a.title}</span><div className="text-[11px] text-mute">{a.detail}</div></li>)}
              {events.length === 0 && <li className="py-1.5 text-mute">No excursions recorded.</li>}
            </ul>
          </div>
        </Card>
      </div>
      <p className="text-[11px] text-mute">Last telemetry sample: {last ? clockOf(last.t) : "—"}. Colour key: <span style={{ color: CREW_COLORS[selectedId] }}>●</span> {selectedId} (selected astronaut).</p>
    </>
  );
}
