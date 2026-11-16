"use client";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { astronauts, elapsedDays, labsFor } from "@/lib/data";
import { useMission } from "@/lib/store";
import { METRICS, METRIC_GROUPS, METRIC_KEYS, fmt, provenanceOf } from "@/lib/metrics";
import { download, toCsv, trendOf } from "@/lib/analysis";
import { CLINICAL_CONFIG, analyzeLabs, type Observation } from "@/lib/clinical";
import { comparable, flagsFor, interpretability, rangeFor, sexOf, statusIn, validityOf } from "@/lib/validity";
import type { MetricKey } from "@/lib/types";
import { Btn, Card, Chip, CREW_COLORS, PageHeader, Segmented, Select, SeverityBadge, Tag } from "@/components/ui";
import { SampleMeta } from "@/components/panels";
import { LabChart, MarkerLegend, type LabSeries, type Pt } from "@/components/labchart";
import { pointsFor, type TypeFilter } from "@/lib/chartutil";

const MAX_KEYS = 4;

const pad = (lo: number, hi: number): [number, number] => { const s = (hi - lo) || Math.abs(hi) * 0.1 || 1; return [lo - s * 0.1, hi + s * 0.1]; };

export default function BloodGas() {
  const { labs, selectedId, currentDay } = useMission();
  const [keys, setKeys] = useState<MetricKey[]>(["pH", "pCO2"]);
  useEffect(() => { const m = new URLSearchParams(window.location.search).get("m"); if (m && (METRIC_KEYS as string[]).includes(m)) setKeys([m as MetricKey]); }, []);
  const [win, setWin] = useState(90);
  const [type, setType] = useState<TypeFilter>("all");
  const [showBase, setShowBase] = useState(true);
  const [showFlagged, setShowFlagged] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [selSample, setSelSample] = useState<string | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);

  useEffect(() => { setSelSample(null); setHover(null); }, [selectedId]);

  const mine = useMemo(() => labsFor(labs, selectedId).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt)), [labs, selectedId]);
  const sex = sexOf(selectedId);
  const from = win === 999 ? 1 : Math.max(1, currentDay - win);
  const domain: [number, number] = [from, currentDay + 1];
  const latest = mine[mine.length - 1];
  const focusId = hover?.id ?? selSample ?? latest?.id;
  const focus = mine.find((l) => l.id === focusId) ?? latest;
  const analysisId = selSample ?? latest?.id;
  const analysisLab = mine.find((l) => l.id === analysisId) ?? latest;
  const obs = useMemo(() => analyzeLabs(mine, analysisId), [mine, analysisId]);

  const toggle = (k: MetricKey) => setKeys((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : p.length >= MAX_KEYS ? [...p.slice(1), k] : [...p, k]));
  const compare = overlay ? keys.slice(0, 1) : keys;

  const exportCsv = () => {
    const rows = mine.filter((l) => elapsedDays(l.collectedAt) >= from && (type === "all" || l.sampleType === type)).map((l) => ({
      sample_id: l.id, astronaut_id: l.astronautId, collected_at: l.collectedAt, mission_day: l.missionDay, analyzer: l.analyzer, sample_type: l.sampleType,
      verification: l.verification, qc_flags: l.qcFlags.map((f) => f.code).join("|"), origin: l.origin,
      ...Object.fromEntries(METRIC_KEYS.map((k) => [k, l.values[k] ?? ""])),
    }));
    download(`nox-med_${selectedId}_bloodgas_${win === 999 ? "all" : `last${win}d`}.csv`, toCsv(rows));
  };

  return (
    <>
      <PageHeader code="MOD-BGI" title="Blood Gas Intelligence"
        desc="Longitudinal laboratory monitoring with sample-type awareness, QC validity, personal baselines and explainable rule-based observations. Markers are real measurements at their true collection times; gaps are never interpolated." />

      {focus && <div className="mb-4"><SampleMeta lab={focus} /></div>}

      <Card className="mb-4" code="CTL-01" title="Analytes and filters">
        <div className="mb-3 grid gap-x-6 gap-y-2 md:grid-cols-2 xl:grid-cols-4">
          {METRIC_GROUPS.map((g) => (
            <div key={g}>
              <div className="meta mb-1">{g}</div>
              <div className="flex flex-wrap gap-1">
                {METRIC_KEYS.filter((k) => METRICS[k].group === g).map((k) => (
                  <Chip key={k} active={keys.includes(k)} onClick={() => toggle(k)} title={`${METRICS[k].name} — ${METRICS[k].meaning}`}>{METRICS[k].label}</Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
          <Segmented label="Range" value={win} onChange={setWin} options={[{ value: 14, label: "14 d" }, { value: 30, label: "30 d" }, { value: 60, label: "60 d" }, { value: 90, label: "90 d" }, { value: 999, label: "All" }]} />
          <Segmented label="Sample" value={type} onChange={setType} options={[{ value: "all", label: "All" }, { value: "arterial", label: "Arterial" }, { value: "venous", label: "Venous" }, { value: "capillary", label: "Capillary" }, { value: "unknown", label: "Unknown" }]} />
          <Segmented label="Baseline" value={showBase ? "on" : "off"} onChange={(v) => setShowBase(v === "on")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
          <Segmented label="Flagged" value={showFlagged ? "show" : "hide"} onChange={(v) => setShowFlagged(v === "show")} options={[{ value: "show", label: "Show" }, { value: "hide", label: "Hide" }]} />
          <Segmented label="Crew overlay" value={overlay ? "on" : "off"} onChange={(v) => setOverlay(v === "on")} options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} />
          <div className="ml-auto"><Btn variant="ghost" onClick={exportCsv} title="Download the filtered samples with full metadata as CSV"><Download size={14} /> Export CSV</Btn></div>
        </div>
        <p className="mt-2 text-[11px] text-mute">Select up to {MAX_KEYS} analytes; each gets its own synchronized graph with its own unit axis. Crew overlay compares all four astronauts for the first selected analyte.</p>
      </Card>

      <Card className="mb-4" code="PLT-TREND" title={overlay ? `${METRICS[compare[0]].name} — all crew` : `Clinical trends — ${selectedId}`}
        subtitle="Hover a marker to inspect the sample; click to select it for the observations and record panels below">
        <div className="space-y-5">
          {compare.map((k) => {
            const m = METRICS[k];
            const series: LabSeries[] = overlay
              ? astronauts.map((a) => ({ id: a.id, label: a.id, color: CREW_COLORS[a.id], points: pointsFor(labsFor(labs, a.id).sort((x, y) => x.collectedAt.localeCompare(y.collectedAt)), k, from, type, showFlagged) }))
              : [{ id: selectedId, label: selectedId, color: CREW_COLORS[selectedId], points: pointsFor(mine, k, from, type, showFlagged) }];
            const ref = rangeFor(k, "capillary", sex);
            const t = trendOf(mine, k);
            const base = !overlay && showBase && t ? { mean: t.baselineMean, sd: t.baselineSd } : null;
            const vals = series.flatMap((s) => s.points.map((p) => p.v as number));
            const lo = Math.min(...vals, ref?.low ?? Infinity, base ? base.mean - 2 * base.sd : Infinity), hi = Math.max(...vals, ref?.high ?? -Infinity, base ? base.mean + 2 * base.sd : -Infinity);
            const lastPt = [...series[0].points].reverse().find((p) => p.interpretable && p.validity !== "unreliable");
            return (
              <div key={k}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-ink">{m.name} <span className="font-normal text-mute">({m.label})</span></span>
                    <span className="text-[11px] text-mute">{m.unit || "unitless"}</span>
                    <Tag tone={provenanceOf(k) === "calculated" ? "calc" : "neutral"}>{provenanceOf(k)}</Tag>
                  </div>
                  <div className="num text-[11px] text-mute">
                    Ref {ref ? `${ref.low}–${ref.high}` : "—"} {m.unit}
                    {t && <> · baseline {fmt(k, t.baselineMean)} ± {t.baselineSd.toFixed(m.decimals + 1)} · drift <span className={Math.abs(t.z) >= 3 ? "font-semibold text-warn" : ""}>{t.z >= 0 ? "+" : ""}{t.z.toFixed(1)}σ</span></>}
                    {lastPt && <> · last reliable <b className="text-ink">{fmt(k, lastPt.v as number)}</b></>}
                  </div>
                </div>
                {vals.length === 0 ? <p className="border border-dashed border-line p-6 text-center text-[13px] text-mute">No measurements for this filter in the selected range.</p> :
                  <LabChart series={series} domain={domain} yDomain={pad(lo, hi)} unit={m.unit} decimals={m.decimals + 1} ref={ref} baseline={base}
                    hoverT={hover?.t ?? null} selectedId={selSample} onHover={setHover} onSelect={(p) => setSelSample(p.id)} xLabel={k === compare[compare.length - 1]} height={k === compare[compare.length - 1] ? 240 : 205} />}
                {overlay && <div className="num mt-1 flex flex-wrap gap-3 text-[11px] text-mute">{astronauts.map((a) => <span key={a.id} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: CREW_COLORS[a.id] }} />{a.id}</span>)}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 border-t border-line pt-2"><MarkerLegend /></div>
        <p className="mt-1 text-[11px] text-mute">Line segments join consecutive reliable samples only; sampling gaps longer than 12 days are left open. Venous and unknown-type gas values, QC-flagged and rejected results are shown but excluded from baselines, trends and alerts.</p>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card code="OBS-RULES" title="Clinical observations (rule-based)"
          subtitle="Deterministic rules with documented thresholds. Decision support only: not a diagnosis, no treatment instructions."
          right={analysisLab && (
            <Select label="Sample" value={analysisLab.id} onChange={(v) => setSelSample(v === latest?.id ? null : v)}
              options={[...mine].reverse().slice(0, 25).map((l) => ({ value: l.id, label: `D${l.missionDay} ${l.collectedAt.slice(11, 16)} · ${l.sampleType}${l.qcFlags.length ? " · flagged" : ""}${l.verification !== "verified" ? ` · ${l.verification}` : ""}` }))} />
          )}>
          {obs.length === 0 ? <p className="text-sm text-mute">No observations for this sample.</p> :
            <ul className="space-y-3">{obs.map((o) => <ObservationCard key={o.id} o={o} />)}</ul>}
        </Card>

        <div className="space-y-4">
          <Card code="REC-SAMPLE" title={`Sample record — ${focus?.id ?? ""}`} subtitle={focus ? `Collected ${focus.collectedAt} · mission day ${focus.missionDay}` : undefined}>
            {focus && (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-panel"><tr className="meta text-left"><th className="py-1 pr-2">Analyte</th><th className="py-1 pr-2 text-right">Value</th><th className="py-1 pr-2">Unit</th><th className="py-1 pr-2">M/C</th><th className="py-1">Status / QC</th></tr></thead>
                  <tbody>
                    {METRIC_KEYS.filter((k) => focus.values[k] !== undefined).map((k) => {
                      const st = statusIn(focus, k), it = interpretability(focus, k), f = flagsFor(focus, k);
                      const tone = st === "critical" ? "text-crit" : st === "out-of-range" ? "text-warn" : st === "normal" ? "text-ok" : "text-mute";
                      return (
                        <tr key={k} className="border-t border-line/60 align-top">
                          <td className="py-1 pr-2 text-ink2">{METRICS[k].name}</td>
                          <td className="num py-1 pr-2 text-right font-semibold text-ink">{fmt(k, focus.values[k])}</td>
                          <td className="py-1 pr-2 text-mute">{METRICS[k].unit}</td>
                          <td className="py-1 pr-2"><Tag tone={provenanceOf(k) === "calculated" ? "calc" : "neutral"}>{provenanceOf(k) === "calculated" ? "calc" : "meas"}</Tag></td>
                          <td className={`py-1 ${tone}`}>{st === "unreliable" ? <>flagged: {f.map((x) => x.code).join(", ") || "rejected"}</> : st === "not-interpretable" ? <span title={it.ok ? "" : it.note}>not interpreted</span> : st}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {focus.qcFlags.length > 0 && <ul className="mt-2 space-y-1 border-t border-line pt-2 text-[11px] text-warn">{focus.qcFlags.map((f) => <li key={f.code}><b>{f.code}</b>: {f.message}</li>)}</ul>}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="mb-4" code="LST-SAMPLES" title="Recent samples" subtitle="Click a row to select it. Irregular intervals are preserved.">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="meta text-left"><th className="py-1 pr-3">Collected (UTC)</th><th className="py-1 pr-3">Day</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Verification</th><th className="py-1 pr-3">QC</th>
              {(["pH", "pCO2", "HCO3", "pO2", "Lac", "tHb", "K"] as MetricKey[]).map((k) => <th key={k} className="py-1 pr-3 text-right">{METRICS[k].label}</th>)}</tr></thead>
            <tbody>
              {[...mine].reverse().slice(0, 12).map((l) => (
                <tr key={l.id} onClick={() => setSelSample(l.id === latest?.id ? null : l.id)} className={`cursor-pointer border-t border-line/60 hover:bg-bg2 ${l.id === analysisLab?.id ? "bg-accent/5" : ""}`}>
                  <td className="num py-1 pr-3">{l.collectedAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="num py-1 pr-3">{l.missionDay}</td>
                  <td className="py-1 pr-3">{l.sampleType}</td>
                  <td className="py-1 pr-3"><Tag tone={l.verification === "verified" ? "ok" : l.verification === "pending" ? "warn" : "crit"}>{l.verification === "verified" ? "QC passed" : l.verification}</Tag><Tag tone="calc">{l.origin === "simulated" ? "recorded" : "imported"}</Tag></td>
                  <td className="py-1 pr-3 text-warn">{l.qcFlags.map((f) => f.code).join(", ") || <span className="text-mute">—</span>}</td>
                  {(["pH", "pCO2", "HCO3", "pO2", "Lac", "tHb", "K"] as MetricKey[]).map((k) => {
                    const st = statusIn(l, k);
                    return <td key={k} className={`num py-1 pr-3 text-right ${st === "critical" ? "text-crit" : st === "out-of-range" ? "text-warn" : st === "normal" ? "text-ink" : "text-mute line-through decoration-line"}`}>{fmt(k, l.values[k])}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-mute">Struck-through values are not interpreted (QC-flagged, rejected, or not valid for this sample type).</p>
      </Card>

      <Card code="CFG-RULES" title="Rule configuration" subtitle="Thresholds used by the clinical engine (lib/clinical.ts). pH/pCO₂ reference intervals are sample-type aware (lib/validity.ts). Illustrative, not clinically validated.">
        <details>
          <summary className="cursor-pointer text-[13px] font-medium text-accent">Show configured thresholds</summary>
          <pre className="mono mt-2 max-h-72 overflow-auto border border-line bg-bg2 p-3 text-[11px] text-ink2">{JSON.stringify(CLINICAL_CONFIG, null, 2)}</pre>
        </details>
      </Card>
    </>
  );
}

const VAL = { valid: "ok", limited: "warn", unreliable: "crit" } as const;

function ObservationCard({ o }: { o: Observation }) {
  const edge = o.severity === "critical" ? "border-l-crit" : o.severity === "warning" ? "border-l-warn" : o.severity === "watch" ? "border-l-accent" : "border-l-line";
  return (
    <li className={`border border-line border-l-4 bg-panel ${edge}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line/70 bg-bg2/60 px-3 py-2">
        <SeverityBadge s={o.severity} />
        <Tag>{o.domain}</Tag>
        <Tag tone={VAL[o.validity]}>validity: {o.validity}</Tag>
        {o.calculated.length > 0 && <Tag tone="calc">uses calculated: {o.calculated.join(", ")}</Tag>}
        <span className="num ml-auto text-[11px] text-mute">D{o.missionDay} · {o.collectedAt.slice(11, 16)}Z</span>
      </div>
      <div className="px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-ink">{o.title}</h3>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-2">
          <div><dt className="meta">Current</dt><dd className="num text-ink">{o.current}</dd></div>
          <div><dt className="meta">Previous</dt><dd className="num text-ink">{o.previous ?? "— (no earlier reliable sample)"}</dd></div>
          <div><dt className="meta">Reference interval</dt><dd className="num text-ink2">{o.reference}</dd></div>
          <div><dt className="meta">Personal baseline</dt><dd className="num text-ink2">{o.baseline ?? "— (insufficient history)"}</dd></div>
        </dl>
        <div className="mt-2 text-[12px]"><span className="meta">Clinical significance</span><p className="text-ink2">{o.significance}</p></div>
        <div className="mt-2 text-[12px]"><span className="meta">Why this alert</span>
          <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-ink2">{o.reasons.map((r, i) => <li key={i}>{r}</li>)}</ol></div>
        <div className="mt-2 grid gap-2 text-[11px] text-mute sm:grid-cols-2">
          <p><span className="meta">Measurement validity</span><br />{o.validityNote}</p>
          <p><span className="meta">Uncertainty</span><br />{o.uncertainty}</p>
        </div>
      </div>
    </li>
  );
}
