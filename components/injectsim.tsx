"use client";
import { useMemo, useState } from "react";
import { ClipboardList, Play, Trash2 } from "lucide-react";
import { labsFor } from "@/lib/data";
import { useMission } from "@/lib/store";
import { METRICS, METRIC_KEYS, fmt, statusOf } from "@/lib/metrics";
import { HORIZON_MIN, SCENARIOS, runSimulation } from "@/lib/scenarios";
import type { Alert, MetricKey, Severity } from "@/lib/types";
import { Btn, Card, CREW_COLORS, Select, Stat } from "@/components/ui";
import { TrendChart } from "@/components/charts";

export function InjectionAnalysis() {
  const { labs, selectedId, currentDay, logSimEvent, simEvents, clearSimEvents } = useMission();
  const [scId, setScId] = useState(SCENARIOS[0].id);
  const [sev, setSev] = useState(70);
  const [run, setRun] = useState({ scId: SCENARIOS[0].id, sev: 70 });
  const [metric, setMetric] = useState<MetricKey | "auto">("auto");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [logged, setLogged] = useState(false);

  const sc = SCENARIOS.find((s) => s.id === run.scId)!;
  const mine = useMemo(() => labsFor(labs, selectedId), [labs, selectedId]);
  const res = useMemo(() => runSimulation(mine, sc, run.sev / 100), [mine, sc, run.sev]);
  const show: MetricKey = metric === "auto" ? sc.primary : metric;
  const m = METRICS[show];
  const latest = mine[mine.length - 1]?.values;

  const execute = () => { setRun({ scId, sev }); setChecked({}); setLogged(false); setMetric("auto"); };
  const t = (v?: number) => (v === undefined ? "not reached" : v === 0 ? "t = 0 (pre-existing)" : `t + ${v} min`);
  const lead = res?.firstTrend && res.firstRange ? (res.firstRange.range as number) - (res.firstTrend.trend as number) : undefined;

  const log = () => {
    if (!res) return;
    const worst: Severity = res.firstCritical ? "critical" : res.firstRange ? "warning" : "watch";
    const a: Alert = {
      id: `SIM-${Date.now()}`, astronautId: selectedId, missionDay: currentDay, severity: worst, category: "simulation",
      title: `Simulated: ${sc.name} (${run.sev}% severity)`,
      detail: `Baseline-drift detection ${t(res.firstTrend?.trend)}; range alert ${t(res.firstRange?.range)}; critical ${t(res.firstCritical?.critical)}.`,
    };
    logSimEvent(a); setLogged(true);
  };

  const done = sc.checklist.filter((_, i) => checked[`${sc.id}-${i}`]).length;
  const end = res?.rows[res.rows.length - 1];

  return (
    <>
      <Card className="mb-4" title="Scenario setup" subtitle={`Target: ${selectedId} (change in the header). Starting values = latest sample on day ${mine[mine.length - 1]?.missionDay}.`}>
        <div className="flex flex-wrap items-end gap-4">
          <Select label="Scenario" value={scId} onChange={setScId} options={SCENARIOS.map((s) => ({ value: s.id, label: s.name }))} />
          <label className="flex items-center gap-2 text-xs text-mute">Severity
            <input type="range" min={20} max={100} step={10} value={sev} onChange={(e) => setSev(Number(e.target.value))} className="accent-[#38C9F4]" aria-label="Severity" />
            <span className="num w-10 text-sm text-ink">{sev}%</span>
          </label>
          <Btn onClick={execute}><Play size={14} /> Run simulation</Btn>
        </div>
        <p className="mt-3 text-xs text-mute">{SCENARIOS.find((s) => s.id === scId)?.summary}</p>
      </Card>

      {res && latest && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Baseline-drift detection" value={res.firstTrend ? t(res.firstTrend.trend).replace("t + ", "+") : "—"} tone="ok" sub={res.firstTrend ? `${METRICS[res.firstTrend.key].label} ≥ 3σ from own baseline` : "No metric reached 3σ"} />
            <Stat label="Reference-range alarm" value={res.firstRange ? t(res.firstRange.range).replace("t + ", "+") : "—"} tone={res.firstRange ? "warn" : undefined} sub={res.firstRange ? `${METRICS[res.firstRange.key].label} leaves range` : "No metric left range"} />
            <Stat label="Critical limit" value={res.firstCritical ? t(res.firstCritical.critical).replace("t + ", "+") : "—"} tone={res.firstCritical ? "crit" : undefined} sub={res.firstCritical ? `${METRICS[res.firstCritical.key].label} critical` : "Not reached at this severity"} />
            <Stat label="Early-warning lead" value={lead !== undefined ? `${lead} min` : "—"} tone={lead && lead > 0 ? "ok" : undefined} sub="Drift flag before range alarm" />
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
            <Card title={`${sc.name} — ${m.label} over ${HORIZON_MIN} min`} subtitle={`Simulated ${selectedId} response, one measurement every 5 min`}
              right={<Select label="Metric" value={show} onChange={setMetric} options={METRIC_KEYS.map((k) => ({ value: k, label: METRICS[k].label }))} />}>
              <TrendChart xKey="t" xLabel="Minutes from onset" decimals={m.decimals} leftLabel={m.unit} band={{ low: m.refLow, high: m.refHigh }}
                data={res.rows.map((r, i) => ({ t: res.minutes[i], v: r[show] ?? null }))}
                lines={[m.critLow !== undefined && { y: m.critLow, label: "critical", color: "#F87171" }, m.critHigh !== undefined && { y: m.critHigh, label: "critical", color: "#F87171" }].filter(Boolean) as { y: number; label: string; color: string }[]}
                series={[{ key: "v", label: `${selectedId} ${m.label}`, color: CREW_COLORS[selectedId], dots: true }]} />
            </Card>

            <Card title="Response checklist" subtitle="Illustrative only — replace with approved mission flight rules"
              right={<span className="num text-xs text-mute">{done}/{sc.checklist.length}</span>}>
              <ul className="space-y-2 text-sm">
                {sc.checklist.map((c, i) => {
                  const id = `${sc.id}-${i}`;
                  return (
                    <li key={id}><label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" className="mt-1 accent-[#38C9F4]" checked={!!checked[id]} onChange={(e) => setChecked((p) => ({ ...p, [id]: e.target.checked }))} />
                      <span className={checked[id] ? "text-mute line-through" : "text-ink"}>{c}</span>
                    </label></li>
                  );
                })}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Btn onClick={log} disabled={logged} variant="ghost"><ClipboardList size={14} /> {logged ? "Logged to observations" : "Log to mission record"}</Btn>
                {simEvents.length > 0 && <Btn variant="danger" onClick={clearSimEvents}><Trash2 size={14} /> Clear {simEvents.length} logged</Btn>}
              </div>
            </Card>
          </div>

          <Card title={`State at +${HORIZON_MIN} min vs starting sample`} subtitle="Metrics changed by this scenario (derived values pH, BE, sO₂, FO₂Hb, tHb included)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                  <th className="py-1 pr-3 font-medium">Metric</th><th className="py-1 pr-3 text-right font-medium">Start</th><th className="py-1 pr-3 text-right font-medium">End</th>
                  <th className="py-1 pr-3 text-right font-medium">Δ</th><th className="py-1 pr-3 font-medium">Drift flag</th><th className="py-1 pr-3 font-medium">Range alarm</th><th className="py-1 font-medium">Critical</th>
                </tr></thead>
                <tbody>
                  {res.detections.map((d) => {
                    const s0 = latest[d.key] as number, s1 = (end?.[d.key] ?? s0) as number, st = statusOf(d.key, s1);
                    return (
                      <tr key={d.key} className="border-t border-line/60">
                        <td className="py-1.5 pr-3 text-ink">{METRICS[d.key].label} <span className="text-[11px] text-mute">{METRICS[d.key].unit}</span></td>
                        <td className="num py-1.5 pr-3 text-right">{fmt(d.key, s0)}</td>
                        <td className={`num py-1.5 pr-3 text-right font-semibold ${st === "critical" ? "text-crit" : st === "out-of-range" ? "text-warn" : "text-ink"}`}>{fmt(d.key, s1)}</td>
                        <td className="num py-1.5 pr-3 text-right text-mute">{s1 - s0 >= 0 ? "+" : ""}{(s1 - s0).toFixed(METRICS[d.key].decimals)}</td>
                        <td className="num py-1.5 pr-3 text-accent">{d.trend === undefined ? "—" : `+${d.trend} min`}</td>
                        <td className="num py-1.5 pr-3 text-warn">{d.range === undefined ? "—" : `+${d.range} min`}</td>
                        <td className="num py-1.5 text-crit">{d.critical === undefined ? "—" : `+${d.critical} min`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
