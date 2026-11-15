"use client";
import { CrewPortrait } from "@/components/crewportrait";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Droplet, Radiation, Wind } from "lucide-react";
import { astronauts, dayToDate, environment, mission } from "@/lib/data";
import { useMission } from "@/lib/store";
import { statusFor } from "@/lib/alerts";
import { METRICS, METRIC_KEYS, fmt } from "@/lib/metrics";
import { trendOf, seriesOf } from "@/lib/analysis";
import { comparable } from "@/lib/validity";
import { labsFor } from "@/lib/data";
import type { MetricKey } from "@/lib/types";
import { Card, CREW_COLORS, PageHeader, Select, Stat, StatusPill } from "@/components/ui";
import { LatestMeasurements, Observations } from "@/components/panels";
import { TrendChart, type Row } from "@/components/charts";

export default function MissionControl() {
  const { labs, alerts, selectedId, select, currentDay } = useMission();
  const [metric, setMetric] = useState<MetricKey>("pH");
  const a = astronauts.find((x) => x.id === selectedId)!;
  const env = environment[environment.length - 1];

  const crew = useMemo(() => astronauts.map((x) => {
    const mine = labsFor(labs, x.id);
    const trends = METRIC_KEYS.map((k) => trendOf(mine, k)).filter((t): t is NonNullable<ReturnType<typeof trendOf>> => !!t);
    const top = trends.sort((p, q) => Math.abs(q.z) - Math.abs(p.z))[0];
    return { a: x, status: statusFor(alerts, x.id, currentDay), top };
  }), [labs, alerts, currentDay]);

  const recent = alerts.filter((x) => x.missionDay > currentDay - 7);
  const crit = recent.filter((x) => x.severity === "critical").length;
  const warn = recent.filter((x) => x.severity === "warning").length;
  const nominal = crew.filter((c) => c.status === "nominal").length;

  const chart: Row[] = useMemo(() => {
    const days = Array.from(new Set(labs.map((l) => l.missionDay))).sort((p, q) => p - q);
    return days.map((d) => {
      const row: Row = { day: d };
      for (const x of astronauts) row[x.id] = labs.find((l) => l.astronautId === x.id && l.missionDay === d && comparable(l, metric))?.values[metric] ?? null;
      return row;
    });
  }, [labs, metric]);
  const m = METRICS[metric];

  return (
    <>
      <PageHeader title="Mission Control" desc={`Crew-wide health status for ${mission.id}. Trends against each astronaut's own baseline surface change before a value leaves its reference range.`} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div><span className="font-semibold text-ink">{mission.id} {mission.name}</span> <span className="text-mute">· {dayToDate(currentDay)}</span></div>
          <div className="num text-accent">Day {currentDay} of {mission.totalDays} · {((currentDay / mission.totalDays) * 100).toFixed(1)}% elapsed · {mission.totalDays - currentDay} d remaining</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-track" role="progressbar" aria-valuenow={currentDay} aria-valuemax={mission.totalDays}>
          <div className="h-full bg-accent" style={{ width: `${(currentDay / mission.totalDays) * 100}%` }} />
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Crew nominal" value={`${nominal}/${crew.length}`} tone={nominal === crew.length ? "ok" : "warn"} sub="No alerts in last 7 d" />
        <Stat label="Critical (7 d)" value={crit} tone={crit ? "crit" : "ok"} sub="Lab/vital critical limits" />
        <Stat label="Warnings (7 d)" value={warn} tone={warn ? "warn" : "ok"} sub="Persistent excursions" />
        <Stat label="Cabin CO₂" value={<>{env.co2Mmhg.toFixed(2)}<span className="text-xs text-mute"> mmHg</span></>} tone={env.co2Mmhg > 5.3 ? "crit" : env.co2Mmhg > 4 ? "warn" : "ok"} sub={`Day ${env.missionDay} telemetry`} />
        <Stat label="Radiation" value={<>{env.radiationUSvH.toFixed(1)}<span className="text-xs text-mute"> µSv/h</span></>} tone={env.radiationUSvH > 100 ? "warn" : "ok"} sub="Dose rate, cabin" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {crew.map(({ a: x, status, top }) => (
          <button key={x.id} onClick={() => select(x.id)} aria-pressed={x.id === selectedId}
            className={`rounded-sm border p-4 text-left transition ${x.id === selectedId ? "border-accent bg-bg2" : "border-line bg-panel hover:bg-bg2"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CREW_COLORS[x.id] }} /><span className="num font-semibold text-ink">{x.id}</span></div>
              <StatusPill s={status} />
            </div>
            <div className="mt-1 text-sm text-ink2">{x.role}</div>
            <div className="mt-3 border-t border-line/60 pt-2 text-xs text-mute">
              {top ? <>Largest baseline shift: <span className="text-ink">{METRICS[top.key].label}</span>{" "}
                <span className={`num ${Math.abs(top.z) >= 3 ? "text-warn" : "text-ink2"}`}>{top.delta >= 0 ? "+" : ""}{top.delta.toFixed(METRICS[top.key].decimals)} {METRICS[top.key].unit} (z {top.z.toFixed(1)})</span></> : "Insufficient history"}
            </div>
          </button>
        ))}
      </div>

      <Card className="mb-4" title={`Selected: ${a.id} · ${a.role}`} subtitle={`${a.sex === "F" ? "Female" : "Male"}, ${a.age} y · ${a.heightCm} cm · ${a.massKg} kg`}>
        <div className="flex items-start gap-3"><CrewPortrait id={selectedId} size={48} />
        <p className="text-sm text-ink2"><Activity size={14} className="mr-1.5 inline text-accent" />{a.note}</p></div>
      </Card>

      <div className="mb-4 grid gap-4 2xl:grid-cols-[3fr_2fr]">
        <LatestMeasurements labs={labs} id={selectedId} />
        <Observations alerts={alerts} id={selectedId} currentDay={currentDay} />
      </div>

      <Card title="Crew trend comparison" subtitle="Reliable arterial/capillary samples only (venous, flagged and rejected excluded); shaded band = reference range. For true-time trends use Blood Gas Intelligence."
        right={<Select label="Metric" value={metric} onChange={setMetric} options={METRIC_KEYS.map((k) => ({ value: k, label: `${METRICS[k].label}${METRICS[k].unit ? ` (${METRICS[k].unit})` : ""}` }))} />}>
        <TrendChart data={chart} decimals={m.decimals} band={{ low: m.refLow, high: m.refHigh }}
          series={astronauts.map((x) => ({ key: x.id, label: x.id, color: CREW_COLORS[x.id], width: x.id === selectedId ? 3 : 1.5, dots: true }))} leftLabel={m.unit} />
        <p className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-mute">
          <span><Droplet size={11} className="inline" /> {seriesOf(labs.filter((l) => l.astronautId === selectedId), metric).length} samples for {selectedId}</span>
          <span><Wind size={11} className="inline" /> Latest {selectedId} {m.label}: {fmt(metric, seriesOf(labs.filter((l) => l.astronautId === selectedId), metric).at(-1)?.v)} {m.unit}</span>
        </p>
      </Card>
    </>
  );
}
