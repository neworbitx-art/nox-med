"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { mean } from "@/lib/analysis";
import { elapsedDays, exerciseEvents, labsFor, vitalsFor } from "@/lib/data";
import { useMission } from "@/lib/store";
import { clockOf, missingIntervals, nearest, type TPoint } from "@/lib/telemetry";
import { WINDOWS, toPts, truncated, windowOf, yDomain } from "@/lib/chartutil";
import { V, V_KEYS, type VKey } from "@/lib/wearables";
import { Card, Chip, CREW_COLORS, PageHeader, Segmented, Stat } from "@/components/ui";
import { LabChart } from "@/components/labchart";

const GROUPS = ["Heart rate", "Respiration & oxygen", "Sleep & activity", "Other"];
const MAX = 3;

export default function Wearables() {
  const { labs, selectedId, currentDay } = useMission();
  const [keys, setKeys] = useState<VKey[]>(["restingHr", "respRate", "spo2"]);
  useEffect(() => { const m = new URLSearchParams(window.location.search).get("m"); if (m && (V_KEYS as string[]).includes(m)) setKeys([m as VKey]); }, []);
  const [win, setWin] = useState(30);
  const [showLabs, setShowLabs] = useState(true);
  const [showEx, setShowEx] = useState(true);
  const [zero, setZero] = useState<"auto" | "zero">("auto");
  const [hoverT, setHoverT] = useState<number | null>(null);

  const vit = useMemo(() => vitalsFor(selectedId), [selectedId]);
  const [t0, t1] = windowOf(win, currentDay);
  const base = vit.filter((v) => v.missionDay <= 30);
  const recent = vit.filter((v) => v.missionDay > currentDay - 7);
  const inWin = vit.filter((v) => v.missionDay + 0.5 >= t0 && v.missionDay + 0.5 <= t1);
  const winDays = Math.round(t1 - t0);
  const missingDays = winDays - inWin.length;
  const events = useMemo(() => exerciseEvents.filter((e) => e.astronautId === selectedId && elapsedDays(e.startedAt) >= t0 && elapsedDays(e.startedAt) <= t1).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [selectedId, t0, t1]);
  const labT = useMemo(() => labsFor(labs, selectedId).map((l) => elapsedDays(l.collectedAt)).filter((t) => t >= t0 && t <= t1), [labs, selectedId, t0, t1]);
  const toggle = (k: VKey) => setKeys((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : p.length >= MAX ? [...p.slice(1), k] : [...p, k]));

  const series = (k: VKey): TPoint[] => inWin.map((v) => ({ t: v.missionDay + 0.5, v: v[k] }));
  const vlines = [...(showLabs ? labT.map((t) => ({ t })) : []), ...(showEx && win <= 14 ? events.map((e) => ({ t: elapsedDays(e.startedAt), color: "#F5B642" })) : [])];
  const readout = hoverT === null ? null : keys.map((k) => ({ k, p: nearest(series(k), hoverT, 1) }));
  const sumMin = events.reduce((s, e) => s + e.durationMin, 0);

  return (
    <>
      <PageHeader code="MOD-WRB" title="Wearables"
        desc="Daily summaries from crew-worn sensors, aligned to the same mission clock as laboratory sampling and cabin telemetry. Days with no sync are real gaps and are never interpolated." />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Data completeness" value={`${((vit.length / currentDay) * 100).toFixed(1)}%`} sub={`${vit.length}/${currentDay} days synced · ${currentDay - vit.length} gaps`} tone={vit.length / currentDay > 0.95 ? "ok" : "warn"} />
        <Stat label="Window coverage" value={`${winDays ? ((inWin.length / winDays) * 100).toFixed(0) : 0}%`} sub={`${missingDays} missing day${missingDays === 1 ? "" : "s"} in window`} tone={missingDays === 0 ? "ok" : "warn"} />
        <Stat label="Exercise sessions" value={events.length} sub={`${sumMin} min in window · ${selectedId}`} />
        <Stat label="Last sync" value={`Day ${vit[vit.length - 1]?.missionDay}`} sub={`${currentDay - (vit[vit.length - 1]?.missionDay ?? 0)} d ago`} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["restingHr", "respRate", "spo2", "sleepHours", "activeMin", "meanHr", "maxHr", "exerciseMin"] as VKey[]).map((x) => {
          const r = mean(recent.map((v) => v[x])), b = mean(base.map((v) => v[x])), d = r - b;
          return (
            <button key={x} onClick={() => toggle(x)} aria-pressed={keys.includes(x)} className={`rounded-sm text-left ${keys.includes(x) ? "ring-1 ring-accent" : ""}`}>
              <Stat label={V[x].label} value={<>{Number.isNaN(r) ? "—" : r.toFixed(V[x].dec)}<span className="text-xs text-mute"> {V[x].unit}</span></>}
                sub={Number.isNaN(d) ? "No data" : `7-d mean · ${d >= 0 ? "+" : ""}${d.toFixed(V[x].dec + (V[x].dec === 0 ? 1 : 0))} vs days 1–30`} />
            </button>
          );
        })}
      </div>

      <Card className="mb-4" code="CTL-WRB" title="Channels and time window">
        <div className="mb-2 flex flex-wrap gap-x-5 gap-y-2">
          {GROUPS.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-1"><span className="meta mr-1">{g}</span>
              {V_KEYS.filter((k) => V[k].group === g).map((k) => <Chip key={k} active={keys.includes(k)} onClick={() => toggle(k)}>{V[k].label.split(" (")[0]}</Chip>)}</div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-2">
          <Segmented label="Window" value={win} onChange={setWin} options={WINDOWS.filter((w) => w.value !== 3)} />
          <Segmented label="Y axis" value={zero} onChange={setZero} options={[{ value: "auto", label: "Auto-fit" }, { value: "zero", label: "From zero" }]} />
          <Segmented label={`${selectedId} lab times`} value={showLabs ? "on" : "off"} onChange={(v) => setShowLabs(v === "on")} options={[{ value: "on", label: "Show" }, { value: "off", label: "Hide" }]} />
          <Segmented label="Exercise (≤14 d)" value={showEx ? "on" : "off"} onChange={(v) => setShowEx(v === "on")} options={[{ value: "on", label: "Show" }, { value: "off", label: "Hide" }]} />
        </div>
      </Card>

      <Card className="mb-4" code="PLT-WRB" title={`Wearable trends — ${selectedId}`} subtitle="Each point is one daily summary (UTC day, plotted at 12:00). Blue dotted = blood sample collection; amber dotted = exercise start.">
        <div className="num mb-2 min-h-5 border border-line bg-bg2 px-2 py-1 text-[12px] text-ink2">
          {readout ? <><b className="text-ink">{clockOf(hoverT as number)}</b>{readout.map((r) => <span key={r.k} className="ml-4">{V[r.k].label}: <b className="text-ink">{r.p ? `${r.p.v.toFixed(V[r.k].dec)} ${V[r.k].unit}` : "no data"}</b></span>)}</>
            : <span className="text-mute">Hover a chart to read all channels for the same day.</span>}
        </div>
        <div className="space-y-4">
          {keys.map((k, i) => {
            const s = series(k), miss = missingIntervals(s, 1, t0, t1), vals = s.map((p) => p.v);
            const dom = yDomain(vals, [], zero === "zero");
            return (
              <div key={k}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2"><span className="text-[13px] font-semibold text-ink">{V[k].label}</span><span className="text-[11px] text-mute">{V[k].unit}</span></div>
                  <div className="text-[11px] text-mute">{s.length} day{s.length === 1 ? "" : "s"} recorded · {miss.length} gap{miss.length === 1 ? "" : "s"}{truncated(dom, vals) && <span className="ml-2 font-semibold text-warn">Y-axis starts at {dom[0].toFixed(V[k].dec)} (not zero)</span>}</div>
                </div>
                {s.length === 0 ? <p className="border border-dashed border-line p-6 text-center text-[13px] text-mute">No wearable data in this window.</p> :
                  <LabChart series={[{ id: k, label: V[k].label, color: CREW_COLORS[selectedId], points: toPts(s, k) }]} domain={[t0, t1]} yDomain={dom} unit={V[k].unit} decimals={V[k].dec + 1}
                    dots={s.length <= 100} breakGapDays={1.5} bands={miss.map(([x1, x2]) => ({ x1, x2, fill: "#7F90B5", label: x2 - x1 > (t1 - t0) * 0.05 ? "no data" : undefined }))}
                    vlines={vlines} hoverT={hoverT} onHoverT={setHoverT} xLabel={i === keys.length - 1} height={i === keys.length - 1 ? 220 : 185} />}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-mute">Gray bands mark days with no wearable record. SpO₂ here is a wearable estimate and is not interchangeable with blood-gas oxygen saturation. Compare with blood gases and cabin CO₂ in the <Link href="/timeline" className="font-medium text-accent underline">Integrated Timeline</Link>.</p>
      </Card>

      <Card code="LOG-EXERCISE" title="Exercise events" subtitle={`${events.length} sessions in window · logged by the wearable; days without a record have no events`}>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-panel"><tr className="meta text-left"><th className="py-1 pr-3">Start (UTC)</th><th className="py-1 pr-3">Day</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3 text-right">Duration (min)</th><th className="py-1 pr-3 text-right">Avg HR (bpm)</th><th className="py-1 text-right">Peak HR (bpm)</th></tr></thead>
            <tbody>
              {events.slice(0, 60).map((e) => (
                <tr key={e.id} className="border-t border-line/60">
                  <td className="num py-1 pr-3">{e.startedAt.slice(0, 16).replace("T", " ")}</td><td className="num py-1 pr-3">{e.missionDay}</td><td className="py-1 pr-3">{e.type}</td>
                  <td className="num py-1 pr-3 text-right">{e.durationMin}</td><td className="num py-1 pr-3 text-right">{e.avgHr}</td><td className="num py-1 text-right">{e.peakHr}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={6} className="py-3 text-mute">No exercise events in this window.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
