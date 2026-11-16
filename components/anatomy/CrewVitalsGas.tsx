"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { labsFor, vitalsFor } from "@/lib/data";
import { METRICS, fmt } from "@/lib/metrics";
import { comparable, statusIn } from "@/lib/validity";
import { V, type VKey } from "@/lib/wearables";
import type { AstronautId, LabResult, MetricKey } from "@/lib/types";

const TONE = { normal: "#4ADE80", "out-of-range": "#F5B642", critical: "#F87171", unreliable: "#94A3B8", "not-interpretable": "#94A3B8", none: "#94A3B8" } as const;

/** Tiny SVG trend: optional reference band, polyline over real samples only (no interpolation across gaps), last point highlighted. */
export function Spark({ pts, lo, hi, color = "#38C9F4", w = 132, h = 34, label }: { pts: { t: number; v: number }[]; lo?: number; hi?: number; color?: string; w?: number; h?: number; label: string }) {
  if (pts.length < 2) return <span className="text-[10px] text-mute" aria-label={`${label}: not enough samples`}>n/a</span>;
  const vs = pts.map((p) => p.v), t0 = pts[0].t, t1 = pts[pts.length - 1].t || 1;
  let mn = Math.min(...vs, lo ?? Infinity), mx = Math.max(...vs, hi ?? -Infinity); if (mx === mn) { mx += 1; mn -= 1; }
  const X = (t: number) => 2 + ((t - t0) / Math.max(1e-9, t1 - t0)) * (w - 4), Y = (v: number) => h - 3 - ((v - mn) / (mx - mn)) * (h - 6), last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} role="img" aria-label={`${label} trend`} className="overflow-visible">
      {lo !== undefined && hi !== undefined && <rect x={0} y={Y(hi)} width={w} height={Math.max(1, Y(lo) - Y(hi))} fill="rgba(74,222,128,0.10)" />}
      <polyline fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" points={pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} />
      <circle cx={X(last.t)} cy={Y(last.v)} r={2.4} fill={color} />
    </svg>
  );
}

const Delta = ({ d, unit, dec }: { d: number | null; unit: string; dec: number }) => d === null ? null : <span className="num text-[10px] text-mute" title="Change versus the first 14 mission days">{d > 0 ? "▲" : d < 0 ? "▼" : "■"} {Math.abs(d).toFixed(dec)} {unit}</span>;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

const VIT: { key: VKey; label?: string }[] = [{ key: "restingHr" }, { key: "hrvMs" }, { key: "spo2" }, { key: "respRate" }, { key: "sleepHours" }, { key: "skinTempC" }];

export function VitalsPanel({ id }: { id: AstronautId }) {
  const vit = useMemo(() => vitalsFor(id), [id]);
  if (vit.length === 0) return <p className="text-[12px] text-mute">No wearable records for this crew member.</p>;
  const last = vit[vit.length - 1], base = vit.filter((v) => v.missionDay <= 14);
  const series = (k: VKey) => vit.map((v, i) => { const w = vit.slice(Math.max(0, i - 6), i + 1); return { t: v.missionDay, v: mean(w.map((x) => x[k] as number)) }; }); // 7-day rolling mean for display only
  return (
    <div data-testid="vitals-panel">
      <ul className="divide-y divide-white/[0.07]">
        {VIT.map(({ key }) => { const d = V[key], s = series(key), cur = last[key] as number, b = base.length ? mean(base.map((v) => v[key] as number)) : null;
          return (
            <li key={key} className="flex items-center gap-2 py-1.5" data-vital={key}>
              <div className="min-w-0 flex-1"><div className="text-[11px] text-ink2">{d.label}</div><div className="num text-[14px] font-semibold text-ink">{cur.toFixed(d.dec)} <span className="text-[10px] font-normal text-mute">{d.unit}</span> <Delta d={b === null ? null : cur - b} unit={d.unit} dec={d.dec} /></div></div>
              <Spark pts={s} label={d.label} w={96} h={28} />
            </li>); })}
        <li className="flex items-center gap-2 py-1.5" data-vital="bp">
          <div className="min-w-0 flex-1"><div className="text-[11px] text-ink2">Blood pressure</div><div className="num text-[14px] font-semibold text-ink">{last.systolic}/{last.diastolic} <span className="text-[10px] font-normal text-mute">mmHg</span></div></div>
          <Spark pts={series("systolic")} label="Systolic blood pressure" w={96} h={28} />
        </li>
      </ul>
      <p className="mt-1 text-[10px] text-mute">Wearable daily summaries, trend = 7-day mean · latest mission day {last.missionDay} · ▲▼ versus first 14 days.</p>
    </div>
  );
}

const GAS: MetricKey[] = ["pH", "pCO2", "pO2", "sO2", "K", "Na", "iCa", "Lac", "Hct"];
const COLS: MetricKey[] = ["pH", "pCO2", "pO2", "Hct", "K", "Lac"];

export function GasPanel({ id, labs }: { id: AstronautId; labs: LabResult[] }) {
  const mine = useMemo(() => labsFor(labs, id).filter((l) => l.verification !== "rejected"), [labs, id]);
  if (mine.length === 0) return <p className="text-[12px] text-mute">No blood gas records for this crew member.</p>;
  const lastLab = mine[mine.length - 1], recent = [...mine].reverse().slice(0, 6);
  return (
    <div data-testid="gas-panel">
      <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-1">
        {GAS.map((k) => {
          const def = METRICS[k], pts = mine.filter((l) => comparable(l, k)).map((l) => ({ t: l.missionDay, v: l.values[k]! })), cur = pts[pts.length - 1], src = cur ? mine.filter((l) => comparable(l, k)).slice(-1)[0] : null;
          const st = src ? statusIn(src, k) : "none";
          return (
            <li key={k} className="flex items-center gap-2 border-b border-white/[0.07] py-1.5" data-gas={k}>
              <div className="min-w-0 flex-1"><div className="text-[11px] text-ink2">{def.name}</div>
                <div className="num text-[14px] font-semibold" style={{ color: cur ? TONE[st] : undefined }}>{cur ? fmt(k, cur.v) : "—"} <span className="text-[10px] font-normal text-mute">{def.unit}</span> <span className="text-[10px] font-normal text-mute">{cur ? `d${cur.t}` : "no comparable sample"}</span></div></div>
              <Spark pts={pts} lo={def.refLow} hi={def.refHigh} color={TONE[st]} label={def.name} w={96} h={28} />
            </li>);
        })}
      </ul>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-[10px]" data-testid="gas-history"><thead><tr className="text-left text-mute"><th className="pr-2 font-normal">Day</th><th className="pr-2 font-normal">Type</th>{COLS.map((k) => <th key={k} className="pr-2 font-normal">{METRICS[k].label}</th>)}</tr></thead>
        <tbody className="num">{recent.map((l) => <tr key={l.id} className="border-t border-white/[0.06]"><td className="pr-2 py-0.5 text-ink2">{l.missionDay}</td><td className="pr-2 text-mute">{l.sampleType.slice(0, 3)}</td>{COLS.map((k) => <td key={k} className="pr-2" style={{ color: l.values[k] === undefined ? undefined : TONE[statusIn(l, k)] }}>{fmt(k, l.values[k])}</td>)}</tr>)}</tbody></table></div>
      <p className="mt-1 text-[10px] text-mute">{mine.length} samples · ABL90 FLEX PLUS · last day {lastLab.missionDay}. Trends use comparable samples only; rejected samples hidden. Green band = reference range.</p>
      <Link href="/demo/blood-gas" className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline">Open Blood Gas Intelligence <ArrowRight size={11} /></Link>
    </div>
  );
}
