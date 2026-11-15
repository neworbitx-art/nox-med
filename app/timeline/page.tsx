"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { astronauts, baseVitals, elapsedDays, exerciseEvents, labsFor, vitalsFor } from "@/lib/data";
import { useMission } from "@/lib/store";
import { METRICS, fmt } from "@/lib/metrics";
import { trendOf } from "@/lib/analysis";
import { comparable, rangeFor, sexOf, statusIn } from "@/lib/validity";
import { ENV_KEYS, ENV_VARS, MIN_COVERAGE, alignLabs, baselineOf, cabinBloodAssociation, clockOf, envSeries, missingIntervals, nearest, standardize, type EnvVar, type TPoint } from "@/lib/telemetry";
import { V, V_KEYS, type VKey } from "@/lib/wearables";
import { WINDOWS, nearLines, pointsFor, toPts, truncated, windowOf, yDomain } from "@/lib/chartutil";
import type { MetricKey } from "@/lib/types";
import { Card, Chip, CREW_COLORS, PageHeader, Segmented, Stat, Tag } from "@/components/ui";
import { LEVEL_COLOR } from "@/components/navigator/ShipHealth";
import { missionById, shipHealthFor, LEVEL_LABEL } from "@/lib/missions";
import { checkpointStatus, trajectoryFor } from "@/lib/trajectory";
import { LabChart, MarkerLegend, type LabSeries } from "@/components/labchart";

const BLOOD: MetricKey[] = ["pCO2", "pH", "HCO3", "Lac", "pO2"];
const SERIES_COLORS = ["#F5B642", "#38C9F4", "#A78BFA", "#B9C6E3"];

export default function IntegratedTimeline() {
  const { labs, selectedId, currentDay, missionId } = useMission();
  const [win, setWin] = useState(30);
  const [analyte, setAnalyte] = useState<MetricKey>("pCO2");
  const [wear, setWear] = useState<VKey[]>(["respRate"]);
  const [extra, setExtra] = useState<EnvVar[]>([]);
  const [mode, setMode] = useState<"stacked" | "std">("stacked");
  const [zero, setZero] = useState<"auto" | "zero">("auto");
  const [showEx, setShowEx] = useState(true);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const [t0, t1] = windowOf(win, currentDay);
  const res = win <= 14 ? "hourly" : "daily";
  const step = res === "hourly" ? 1 / 24 : 1;
  const sex = sexOf(selectedId);
  const mine = useMemo(() => labsFor(labs, selectedId).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt)), [labs, selectedId]);
  const vit = useMemo(() => vitalsFor(selectedId), [selectedId]);
  const wearSeries = (k: VKey): TPoint[] => vit.filter((v) => v.missionDay + 0.5 >= t0 && v.missionDay + 0.5 <= t1).map((v) => ({ t: v.missionDay + 0.5, v: v[k] }));
  const m = METRICS[analyte];

  const co2 = envSeries("co2", t0, t1, res);
  const co2Miss = missingIntervals(co2, step, t0, t1);
  const labPts = pointsFor(mine, analyte, t0, "all", true);
  const labT = labPts.map((p) => p.t);
  const ex = useMemo(() => (showEx && win <= 14 ? exerciseEvents.filter((e) => e.astronautId === selectedId && elapsedDays(e.startedAt) >= t0).map((e) => ({ t: elapsedDays(e.startedAt), color: "#F5B642" })) : []), [showEx, win, selectedId, t0]);

  const ref = rangeFor(analyte, "capillary", sex);
  const toggleW = (k: VKey) => setWear((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : p.length >= 2 ? [...p.slice(1), k] : [...p, k]));
  const toggleE = (k: EnvVar) => setExtra((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 1 ? [k] : [k]));

  // Lab ↔ environment alignment (selected astronaut, window)
  const allRows = useMemo(() => alignLabs(mine, baseVitals, exerciseEvents), [mine]);
  const rows = allRows.filter((r) => r.t >= t0 && r.t <= t1);
  const assoc = cabinBloodAssociation(rows);
  const scatter = rows.filter((r) => comparable(r.lab, "pCO2") && r.mean24.mean !== null && r.mean24.coverage >= MIN_COVERAGE).map((r) => ({ x: r.mean24.mean as number, y: r.lab.values.pCO2 as number, id: r.lab.id, day: r.lab.missionDay }));

  // Hover readout
  const near = hoverT === null ? null : {
    cabin: nearest(co2, hoverT, step * 1.5),
    lab: labPts.filter((p) => Math.abs(p.t - hoverT) <= 0.5).sort((a, b) => Math.abs(a.t - hoverT) - Math.abs(b.t - hoverT))[0] ?? null,
    wear: wear.map((k) => ({ k, p: nearest(wearSeries(k), hoverT, 1) })),
  };

  // ---- Standardized overlay ----
  const std = useMemo(() => {
    if (mode !== "std") return null;
    const items: { id: string; label: string; color: string; pts: { t: number; z: number; src?: (typeof labPts)[number] }[]; note: string }[] = [];
    const cb = baselineOf(envSeries("co2", 1, 31, "daily"));
    if (cb) items.push({ id: "co2", label: "Cabin CO₂ (ambient)", color: SERIES_COLORS[0], note: `baseline ${cb.mean.toFixed(2)} ± ${cb.sd.toFixed(2)} mmHg (days 1–30)`, pts: standardize(co2, cb).map((p) => ({ t: p.t, z: p.v })) });
    const tr = trendOf(mine, analyte);
    if (tr) items.push({ id: "lab", label: `${selectedId} blood ${m.label}`, color: SERIES_COLORS[1], note: `baseline ${fmt(analyte, tr.baselineMean)} ± ${tr.baselineSd.toFixed(m.decimals + 1)} ${m.unit} (first 10 reliable samples)`,
      pts: labPts.map((p) => ({ t: p.t, z: ((p.v as number) - tr.baselineMean) / tr.baselineSd, src: p })) });
    wear.forEach((k, i) => {
      const b = baselineOf(vit.map((v) => ({ t: v.missionDay + 0.5, v: v[k] })));
      if (b) items.push({ id: k, label: `${selectedId} ${V[k].label}`, color: SERIES_COLORS[2 + i], note: `baseline ${b.mean.toFixed(V[k].dec + 1)} ± ${b.sd.toFixed(V[k].dec + 1)} ${V[k].unit} (days 1–30)`, pts: standardize(wearSeries(k), b).map((p) => ({ t: p.t, z: p.v })) });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mine, analyte, wear, win, selectedId, labs]);

  return (
    <>
      <PageHeader code="MOD-ITL" title="Integrated Timeline"
        desc="Explore cabin atmosphere, laboratory results and wearable physiology on one UTC mission clock. Each quantity keeps its own units; an association on this page is never evidence of cause." />

      <Card className="mb-4" code="SHP-ITL" title="Spacecraft context (selected mission)" subtitle="Engineering status and mission checkpoints. Shown beside, never merged with, crew physiology.">
        {(() => { const sm = missionById(missionId)!, sh = shipHealthFor(sm), tr = trajectoryFor(sm.id); return (
          <div className="grid gap-3 md:grid-cols-2" data-testid="ship-context">
            <ul className="space-y-1 text-[12px]">{sh.subsystems.map((x) => <li key={x.key} className="flex justify-between gap-2"><span className="text-ink2">{x.label}</span><span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[x.status] }} />{LEVEL_LABEL[x.status]}</span></li>)}</ul>
            <ul className="space-y-1 text-[12px]">{tr.checkpoints.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="text-ink2">{c.label}</span><span className="num text-mute">T+{(c.plannedDay - 1).toFixed(1)} d · planned · {checkpointStatus(sm, c)}</span></li>)}</ul>
          </div>); })()}
      </Card>

      <div className="mb-4 border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-ink2">
        <b className="text-warn">Read carefully.</b> Cabin CO₂ is the <b>partial pressure of CO₂ in ambient air</b>; blood pCO₂ is the <b>CO₂ tension in the astronaut&apos;s blood</b>. They are different measurements with different reference ranges and are plotted on separate axes. Co-movement does not show that one causes the other.
      </div>

      <Card className="mb-4" code="CTL-ITL" title="Channels and time window">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Segmented label="Window" value={win} onChange={setWin} options={WINDOWS.filter((w) => w.value !== 3)} />
          <Segmented label="View" value={mode} onChange={setMode} options={[{ value: "stacked", label: "Stacked · physical units" }, { value: "std", label: "Standardized overlay (σ)" }]} />
          {mode === "stacked" && <Segmented label="Y axis" value={zero} onChange={setZero} options={[{ value: "auto", label: "Auto-fit" }, { value: "zero", label: "From zero" }]} />}
          <Segmented label="Exercise (≤14 d)" value={showEx ? "on" : "off"} onChange={(v) => setShowEx(v === "on")} options={[{ value: "on", label: "Show" }, { value: "off", label: "Hide" }]} />
        </div>
        <div className="mt-3 grid gap-x-6 gap-y-2 border-t border-line pt-3 md:grid-cols-3">
          <div><div className="meta mb-1">Blood analyte ({selectedId})</div><div className="flex flex-wrap gap-1">{BLOOD.map((k) => <Chip key={k} active={analyte === k} onClick={() => setAnalyte(k)} title={METRICS[k].name}>{METRICS[k].label}</Chip>)}</div></div>
          <div><div className="meta mb-1">Physiology (wearable, max 2)</div><div className="flex flex-wrap gap-1">{V_KEYS.filter((k) => V[k].group !== "Other").map((k) => <Chip key={k} active={wear.includes(k)} onClick={() => toggleW(k)}>{V[k].label.split(" (")[0]}</Chip>)}</div></div>
          <div><div className="meta mb-1">Additional cabin channel (optional)</div><div className="flex flex-wrap gap-1">{ENV_KEYS.filter((k) => k !== "co2").map((k) => <Chip key={k} active={extra.includes(k)} onClick={() => toggleE(k)}>{ENV_VARS[k].label.replace("Cabin ", "")}</Chip>)}{extra.length > 0 && <Chip active={false} onClick={() => setExtra([])}>clear</Chip>}</div></div>
        </div>
        <p className="mt-2 text-[11px] text-mute">Cabin CO₂ is always shown. {res === "hourly" ? "Hourly" : "Daily-mean"} cabin resolution · wearable points are daily summaries (12:00 UTC) · blood samples at exact collection times.</p>
      </Card>

      <Card className="mb-4" code="PLT-ITL" title={mode === "stacked" ? "Synchronized panels (physical units)" : "Standardized overlay (unitless σ)"} subtitle={`${selectedId} · ${clockOf(t0)} → ${clockOf(t1)}`}>
        <div className="num mb-2 min-h-5 border border-line bg-bg2 px-2 py-1 text-[12px] text-ink2">
          {near && hoverT !== null ? <>
            <b className="text-ink">{clockOf(hoverT)}</b>
            <span className="ml-4">Cabin CO₂ <b className="text-ink">{near.cabin ? `${near.cabin.v.toFixed(2)} mmHg` : "no data"}</b></span>
            <span className="ml-4">Blood {m.label} <b className="text-ink">{near.lab ? `${fmt(analyte, near.lab.v as number)} ${m.unit} (${near.lab.sampleType}${near.lab.validity === "unreliable" ? ", flagged" : ""}, ${near.lab.collectedAt?.slice(11, 16)}Z)` : "no sample within ±12 h"}</b></span>
            {near.wear.map((w) => <span key={w.k} className="ml-4">{V[w.k].label} <b className="text-ink">{w.p ? `${w.p.v.toFixed(V[w.k].dec)} ${V[w.k].unit}` : "no data"}</b></span>)}</>
            : <span className="text-mute">Hover any panel to read cabin, blood and wearable values at the same instant.</span>}
        </div>

        {mode === "stacked" ? (
          <div className="space-y-4">
            <Panel title="Cabin CO₂ partial pressure" unit="mmHg" tag="ambient air · measured" note={`${co2.length} recorded ${res === "hourly" ? "hours" : "days"} · ${co2Miss.length} gap${co2Miss.length === 1 ? "" : "s"}`}
              dom={yDomain(co2.map((p) => p.v), nearLines(co2.map((p) => p.v), [4, 5.3]), zero === "zero")} vals={co2.map((p) => p.v)} dec={2}>
              {(dom) => <LabChart series={[{ id: "co2", label: "Cabin CO₂", color: "#F5B642", points: toPts(co2, "co2") }]} domain={[t0, t1]} yDomain={dom} unit="mmHg" decimals={3} dots={false} breakGapDays={step * 1.5}
                bands={co2Miss.map(([x1, x2]) => ({ x1, x2, fill: "#7F90B5", label: x2 - x1 > (t1 - t0) * 0.06 ? "no data" : undefined }))} vlines={labT.map((t) => ({ t }))} hlines={[{ y: 4, label: "watch 4.0", color: "#F5B642" }, { y: 5.3, label: "limit 5.3", color: "#F87171" }].filter((h) => h.y < dom[1] && h.y > dom[0])}
                hoverT={hoverT} onHoverT={setHoverT} height={190} xLabel={false} />}
            </Panel>

            <Panel title={`${selectedId} blood ${m.name}`} unit={m.unit || "unitless"} tag={analyte === "pCO2" ? "blood tension · arterial/capillary reliable samples form the trend" : "laboratory"} note={`${labPts.length} samples in window · ref ${ref ? `${ref.low}–${ref.high}` : "—"} ${m.unit}`}
              dom={yDomain(labPts.map((p) => p.v as number), ref ? [ref.low, ref.high] : [], zero === "zero")} vals={labPts.map((p) => p.v as number)} dec={m.decimals}>
              {(dom) => <LabChart series={[{ id: selectedId, label: selectedId, color: CREW_COLORS[selectedId], points: labPts }]} domain={[t0, t1]} yDomain={dom} unit={m.unit} decimals={m.decimals + 1} ref={ref}
                hoverT={hoverT} onHoverT={setHoverT} height={190} xLabel={false} breakGapDays={12} />}
            </Panel>

            {wear.map((k, i) => {
              const s = wearSeries(k), miss = missingIntervals(s, 1, t0, t1);
              return (
                <Panel key={k} title={V[k].label} unit={V[k].unit} tag="wearable daily summary" note={`${s.length} days recorded · ${miss.length} gap${miss.length === 1 ? "" : "s"}`} dom={yDomain(s.map((p) => p.v), [], zero === "zero")} vals={s.map((p) => p.v)} dec={V[k].dec}>
                  {(dom) => <LabChart series={[{ id: k, label: V[k].label, color: CREW_COLORS[selectedId], points: toPts(s, k) }]} domain={[t0, t1]} yDomain={dom} unit={V[k].unit} decimals={V[k].dec + 1} dots={s.length <= 100} breakGapDays={1.5}
                    bands={miss.map(([x1, x2]) => ({ x1, x2, fill: "#7F90B5" }))} vlines={[...labT.map((t) => ({ t })), ...ex]} hoverT={hoverT} onHoverT={setHoverT} height={170} xLabel={i === wear.length - 1 && extra.length === 0} />}
                </Panel>
              );
            })}

            {extra.map((k) => {
              const s = envSeries(k, t0, t1, res), miss = missingIntervals(s, step, t0, t1), e = ENV_VARS[k];
              return (
                <Panel key={k} title={e.label} unit={e.unit} tag={e.derived ? "cabin · derived" : "cabin · measured"} note={`${s.length} recorded · ${miss.length} gap${miss.length === 1 ? "" : "s"}`} dom={yDomain(s.map((p) => p.v), [], zero === "zero")} vals={s.map((p) => p.v)} dec={e.decimals}>
                  {(dom) => <LabChart series={[{ id: k, label: e.label, color: "#B9C6E3", points: toPts(s, k) }]} domain={[t0, t1]} yDomain={dom} unit={e.unit} decimals={e.decimals + 1} dots={false} breakGapDays={step * 1.5}
                    bands={miss.map(([x1, x2]) => ({ x1, x2, fill: "#7F90B5" }))} vlines={labT.map((t) => ({ t }))} hoverT={hoverT} onHoverT={setHoverT} height={170} />}
                </Panel>
              );
            })}
          </div>
        ) : (
          <>
            {std && std.length > 0 ? (() => {
              const zmax = Math.max(3, ...std.flatMap((s) => s.pts.map((p) => Math.abs(p.z)))) + 0.4;
              const series: LabSeries[] = std.map((s) => ({ id: s.id, label: s.label, color: s.color, dots: s.id === "lab",
                points: s.id === "lab" ? s.pts.map((p) => ({ ...(p.src as NonNullable<typeof p.src>), v: p.z })) : toPts(s.pts.map((p) => ({ t: p.t, v: p.z })), s.id) }));
              return (
                <>
                  <LabChart series={series} domain={[t0, t1]} yDomain={[-zmax, zmax]} unit="σ from own baseline" decimals={2} dots={false} breakGapDays={Math.max(step * 1.5, 1.5)}
                    hlines={[{ y: 0, label: "own baseline", color: "#B9C6E3" }, { y: 2, label: "+2σ", color: "#7F90B5" }, { y: -2, label: "−2σ", color: "#7F90B5" }]}
                    vlines={ex} hoverT={hoverT} onHoverT={setHoverT} height={320} />
                  <ul className="mt-2 grid gap-1 text-[12px] md:grid-cols-2">
                    {std.map((s) => <li key={s.id} className="flex items-start gap-2"><span className="mt-1 h-2 w-4 shrink-0" style={{ background: s.color }} /><span><b className="text-ink">{s.label}</b> <span className="text-mute">— {s.note}</span></span></li>)}
                  </ul>
                  <p className="mt-2 text-[11px] text-warn">Standardized view: every series is rescaled to its own baseline spread, so physical magnitudes and units are hidden. A 1σ change in cabin CO₂ and a 1σ change in blood pCO₂ are not equivalent. Use the stacked view for absolute values.</p>
                </>
              );
            })() : <p className="border border-dashed border-line p-6 text-center text-[13px] text-mute">Not enough baseline data to standardize.</p>}
          </>
        )}
        <div className="mt-3 border-t border-line pt-2"><MarkerLegend /></div>
        <p className="mt-1 text-[11px] text-mute">Blue dotted lines = blood collection times (also marked on cabin and wearable panels). Amber dotted = exercise start (windows ≤ 14 d). Gray bands = no data recorded. Lines never bridge gaps; venous/unknown-type gas results and QC-flagged or rejected samples are plotted hollow and excluded from baselines and association statistics.</p>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-[2fr_3fr]">
        <Card code="STAT-ASSOC" title="Cabin CO₂ vs blood pCO₂ — association" subtitle="Preceding-24 h mean cabin CO₂ against reliable arterial/capillary blood pCO₂, one point per sample">
          {assoc ? (
            <>
              <div className="mb-3 grid grid-cols-3 gap-3">
                <Stat label="Samples (n)" value={assoc.n} sub={`≥${MIN_COVERAGE * 100}% telemetry coverage`} />
                <Stat label="Pearson r" value={assoc.pearson.toFixed(2)} sub="linear" />
                <Stat label="Spearman rho (ρ)" value={assoc.spearman.toFixed(2)} sub="rank-based" />
              </div>
              <div style={{ height: 230 }} role="img" aria-label="Scatter of preceding-24h mean cabin CO2 versus blood pCO2">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 22 }}>
                    <CartesianGrid stroke="#1B222C" />
                    <XAxis type="number" dataKey="x" name="Cabin CO₂ (24 h mean)" domain={["auto", "auto"]} tick={{ fill: "#A8B8D8", fontSize: 10 }} stroke="#7F90B5" tickSize={6} tickFormatter={(v: number) => v.toFixed(1)}
                      label={{ value: "Cabin CO₂ partial pressure, 24 h mean (mmHg, ambient air)", position: "insideBottom", offset: -12, fill: "#A8B8D8", fontSize: 10 }} />
                    <YAxis type="number" dataKey="y" name="Blood pCO₂" domain={["auto", "auto"]} tick={{ fill: "#A8B8D8", fontSize: 10 }} stroke="#7F90B5" tickSize={6} width={46}
                      label={{ value: "Blood pCO₂ (mmHg)", angle: -90, position: "insideLeft", fill: "#A8B8D8", fontSize: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ fontSize: 12, borderRadius: 2, border: "1px solid #2B3440" }} />
                    <Scatter data={scatter} fill={CREW_COLORS[selectedId]} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] text-warn">Axes are auto-fitted and do not start at zero.</p>
            </>
          ) : <p className="text-sm text-mute">Fewer than 5 reliable samples with ≥75% telemetry coverage in this window — no statistic is shown. Widen the window.</p>}
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-mute">
            <li><b>Association, not causation.</b> Both series drift over the mission, so a shared time trend can produce correlation on its own.</li>
            <li>Individual ventilation, exercise, sampling technique and sample type also influence blood pCO₂.</li>
            <li>Small n: use for exploration and hypothesis generation only.</li>
          </ul>
        </Card>

        <Card code="ALN-LAB" title="Laboratory ↔ environment alignment" subtitle={`${selectedId} · ${rows.length} samples in window · cabin windows end at the exact collection timestamp`}>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-panel"><tr className="meta text-left">
                <th className="py-1 pr-2">Collected (UTC)</th><th className="py-1 pr-2">Type</th><th className="py-1 pr-2 text-right">Blood {m.label}</th>
                <th className="py-1 pr-2 text-right">Cabin CO₂ at hour</th><th className="py-1 pr-2 text-right">24 h mean</th><th className="py-1 pr-2 text-right">72 h mean</th>
                <th className="py-1 pr-2 text-right">Resp. rate</th><th className="py-1 pr-2 text-right">SpO₂</th><th className="py-1">Exercise ≤6 h</th></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const st = statusIn(r.lab, analyte);
                  const cell = (w: typeof r.mean24) => (w.mean === null ? <span className="text-mute">no data</span> : <>{w.mean.toFixed(2)} <span className={`text-[10px] ${w.coverage < MIN_COVERAGE ? "font-semibold text-warn" : "text-mute"}`}>({Math.round(w.coverage * 100)}%)</span></>);
                  return (
                    <tr key={r.lab.id} className="border-t border-line/60 align-top">
                      <td className="num py-1 pr-2">{r.lab.collectedAt.slice(0, 16).replace("T", " ")}</td>
                      <td className="py-1 pr-2">{r.lab.sampleType}{r.lab.qcFlags.length > 0 && <span className="ml-1"><Tag tone="warn">flag</Tag></span>}</td>
                      <td className={`num py-1 pr-2 text-right ${st === "critical" ? "text-crit" : st === "out-of-range" ? "text-warn" : st === "normal" ? "text-ink" : "text-mute line-through decoration-line"}`}>{fmt(analyte, r.lab.values[analyte])}</td>
                      <td className="num py-1 pr-2 text-right">{r.cabinAt === null ? <span className="text-mute">no data</span> : r.cabinAt.toFixed(2)}</td>
                      <td className="num py-1 pr-2 text-right">{cell(r.mean24)}</td>
                      <td className="num py-1 pr-2 text-right">{cell(r.mean72)}</td>
                      <td className="num py-1 pr-2 text-right">{r.vitals ? r.vitals.respRate : <span className="text-mute">—</span>}</td>
                      <td className="num py-1 pr-2 text-right">{r.vitals ? r.vitals.spo2.toFixed(1) : <span className="text-mute">—</span>}</td>
                      <td className="py-1">{r.exercise ? <span className="text-warn">{r.exercise.minutesBefore} min before</span> : <span className="text-mute">none</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-mute">Cabin CO₂ in mmHg (ambient partial pressure); blood values in {m.unit || "native units"}. Coverage = recorded hours ÷ hours in the window; below {MIN_COVERAGE * 100}% is flagged and excluded from the association. Exercise within 6 h can transiently alter blood lactate and gases. Wearable columns are the daily summary for the sample&apos;s mission day.</p>
        </Card>
      </div>
      <p className="text-[11px] text-mute">Related: <Link href="/environment" className="text-accent underline">Environmental Monitoring</Link> · <Link href="/wearables" className="text-accent underline">Wearables</Link> · <Link href="/blood-gas" className="text-accent underline">Blood Gas Intelligence</Link>. Crew: {astronauts.map((a) => a.id).join(", ")}. All telemetry is simulated.</p>
    </>
  );
}

function Panel({ title, unit, tag, note, dom, vals, dec, children }: { title: string; unit: string; tag: string; note: string; dom: [number, number]; vals: number[]; dec: number; children: (dom: [number, number]) => React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2"><span className="text-[13px] font-semibold text-ink">{title}</span><span className="text-[11px] text-mute">{unit}</span><Tag>{tag}</Tag></div>
        <div className="text-[11px] text-mute">{note}{truncated(dom, vals) && <span className="ml-2 font-semibold text-warn">Y-axis starts at {dom[0].toFixed(dec)} (not zero)</span>}</div>
      </div>
      {vals.length === 0 ? <p className="border border-dashed border-line p-5 text-center text-[13px] text-mute">No data recorded in this window.</p> : children(dom)}
    </div>
  );
}
