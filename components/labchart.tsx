"use client";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { SampleType } from "@/lib/types";
import type { Validity } from "@/lib/validity";

/** One actual laboratory measurement (never interpolated). */
export interface Pt {
  id: string;
  t: number;               // fractional mission day of collection
  v: number | null;        // null rows only break the line across long sampling gaps
  collectedAt?: string;
  sampleType?: SampleType;
  validity?: Validity;
  interpretable?: boolean; // false → plotted but excluded from trend/baseline
  flags?: string[];
  verification?: string;
  seriesId?: string;
}
export interface LabSeries { id: string; label: string; color: string; points: Pt[]; /** override chart-level dots */ dots?: boolean }

interface Props {
  series: LabSeries[];
  domain: [number, number];
  yDomain: [number, number];
  unit: string;
  decimals: number;
  ref?: { low: number; high: number } | null;
  baseline?: { mean: number; sd: number } | null;
  hoverT?: number | null;
  selectedId?: string | null;
  onHover?: (p: Pt | null) => void;
  onSelect?: (p: Pt) => void;
  height?: number;
  breakGapDays?: number;
  xLabel?: boolean;
  /** Draw a marker on every point (default true). Turn off for dense telemetry lines. */
  dots?: boolean;
  /** Shaded x-ranges, e.g. missing-data intervals or exercise sessions */
  bands?: { x1: number; x2: number; fill: string; label?: string }[];
  /** Vertical sync lines, e.g. laboratory collection times */
  vlines?: { t: number; color?: string }[];
  /** Horizontal threshold lines */
  hlines?: { y: number; label: string; color: string }[];
  onHoverT?: (t: number | null) => void;
  xTickFormat?: "day";
  xLabelText?: string;
}

/** Insert null rows into long gaps so no line bridges missing data. */
function withGaps(points: Pt[], gap: number): Pt[] {
  const out: Pt[] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.t - points[i - 1].t > gap) out.push({ id: `gap-${i}`, t: (p.t + points[i - 1].t) / 2, v: null });
    out.push(p);
  });
  return out;
}

interface DotProps { cx?: number; cy?: number; payload?: Pt }

export function LabChart({ series, domain, yDomain, unit, decimals, ref, baseline, hoverT, selectedId, onHover, onSelect, height = 220, breakGapDays = 12, xLabel = true, dots = true, bands, vlines, hlines, onHoverT, xLabelText }: Props) {
  const ticks: number[] = [];
  const step = domain[1] - domain[0] > 120 ? 20 : domain[1] - domain[0] > 45 ? 10 : domain[1] - domain[0] > 20 ? 5 : 2;
  for (let d = Math.ceil(domain[0] / step) * step; d <= domain[1]; d += step) ticks.push(d);

  const marker = (color: string, off: boolean) => (props: DotProps) => {
    const { cx, cy, payload: p } = props;
    if (cx == null || cy == null || !p || p.v == null) return <g key={`n-${p?.id ?? Math.random()}`} />;
    const flagged = p.validity === "unreliable";
    const stroke = flagged ? "#F87171" : p.interpretable === false ? "#7F90B5" : color;
    const hollow = flagged || p.interpretable === false || off;
    const fill = hollow ? "#0A0D12" : color;
    const sel = selectedId === p.id;
    const common = { stroke, strokeWidth: sel ? 2.5 : 1.6, fill, style: { cursor: "pointer" }, onMouseEnter: () => onHover?.(p), onMouseLeave: () => onHover?.(null), onClick: () => onSelect?.(p) } as const;
    const r = 3.6;
    let shape;
    switch (p.sampleType) {
      case "arterial": shape = <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />; break;
      case "venous": shape = <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} {...common} />; break;
      case "unknown": shape = <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`} {...common} />; break;
      default: shape = <circle cx={cx} cy={cy} r={r} {...common} />;
    }
    return <g key={p.id}>{sel && <circle cx={cx} cy={cy} r={9} fill="none" stroke={color} strokeOpacity={0.4} />}{flagged && <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke="#F87171" strokeWidth={1} />}{shape}</g>;
  };

  return (
    <div style={{ height }} role="img" aria-label="Time-series chart; gaps indicate missing data"
      onMouseMove={onHoverT ? (e) => {
        const g = e.currentTarget.querySelector(".recharts-cartesian-grid")?.getBoundingClientRect();
        if (!g || g.width === 0) return;
        const f = (e.clientX - g.left) / g.width;
        onHoverT(f >= 0 && f <= 1 ? domain[0] + f * (domain[1] - domain[0]) : null);
      } : undefined}
      onMouseLeave={onHoverT ? () => onHoverT(null) : undefined}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: xLabel ? 16 : 4 }}>
          <CartesianGrid stroke="#1B222C" />
          <XAxis dataKey="t" type="number" domain={domain} ticks={ticks} allowDataOverflow tickFormatter={(v: number) => `D${Math.round(v)}`} tick={{ fill: "#A8B8D8", fontSize: 10 }} stroke="#7F90B5" tickSize={6}
            label={xLabel ? { value: xLabelText ?? "Mission day (UTC, true time scale)", position: "insideBottom", offset: -10, fill: "#A8B8D8", fontSize: 10 } : undefined} />
          <YAxis yAxisId="y" type="number" domain={yDomain} allowDataOverflow tick={{ fill: "#A8B8D8", fontSize: 10 }} stroke="#7F90B5" tickSize={6} width={46}
            tickFormatter={(v: number) => { const span = yDomain[1] - yDomain[0]; return Number(v.toFixed(span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : 3)).toString(); }}
            label={unit ? { value: unit, angle: -90, position: "insideLeft", fill: "#A8B8D8", fontSize: 10 } : undefined} />
          {baseline && <ReferenceArea yAxisId="y" y1={baseline.mean - 2 * baseline.sd} y2={baseline.mean + 2 * baseline.sd} fill="#60A5FA" fillOpacity={0.07} stroke="#60A5FA" strokeOpacity={0.3} strokeDasharray="2 3" />}
          {ref && <ReferenceArea yAxisId="y" y1={ref.low} y2={ref.high} fill="#4ADE80" fillOpacity={0.09} stroke="#4ADE80" strokeOpacity={0.45} strokeDasharray="4 4" />}
          {baseline && <ReferenceLine yAxisId="y" y={baseline.mean} stroke="#60A5FA" strokeDasharray="6 3" label={{ value: "baseline", fill: "#60A5FA", fontSize: 10, position: "insideTopLeft" }} />}
          {bands?.map((b, i) => <ReferenceArea key={`b${i}`} yAxisId="y" x1={Math.max(b.x1, domain[0])} x2={Math.min(b.x2, domain[1])} fill={b.fill} fillOpacity={0.5} stroke="none" label={b.label ? { value: b.label, fill: "#A8B8D8", fontSize: 9, position: "insideTop" } : undefined} />)}
          {vlines?.map((v, i) => <ReferenceLine key={`v${i}`} yAxisId="y" x={v.t} stroke={v.color ?? "#60A5FA"} strokeOpacity={0.5} strokeDasharray="1 3" />)}
          {hlines?.map((h) => <ReferenceLine key={`h${h.label}${h.y}`} yAxisId="y" y={h.y} stroke={h.color} strokeDasharray="5 4" label={{ value: h.label, fill: h.color, fontSize: 10, position: "insideTopRight" }} />)}
          {hoverT != null && <ReferenceLine yAxisId="y" x={hoverT} stroke="#F7FAFF" strokeOpacity={0.35} strokeDasharray="2 2" />}
          {series.map((s) => {
            const lineRows = withGaps(s.points.filter((p) => p.interpretable !== false && p.validity !== "unreliable"), breakGapDays).map((p) => ({ ...p, seriesId: s.id }));
            const otherRows = s.points.filter((p) => p.interpretable === false || p.validity === "unreliable").map((p) => ({ ...p, seriesId: s.id }));
            return [
              <Line key={`${s.id}-l`} yAxisId="y" data={lineRows} dataKey="v" name={s.label} stroke={s.color} strokeWidth={1.8} connectNulls={false} isAnimationActive={false} dot={(s.dots ?? dots) ? marker(s.color, false) : false} activeDot={false} />,
              <Line key={`${s.id}-o`} yAxisId="y" data={otherRows} dataKey="v" name={`${s.label} (excluded)`} stroke="none" strokeWidth={0} isAnimationActive={false} dot={marker(s.color, true)} activeDot={false} legendType="none" />,
            ];
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarkerLegend() {
  const sw = (shape: React.ReactNode, label: string) => (<span className="inline-flex items-center gap-1.5">{<svg width="14" height="14" viewBox="0 0 14 14">{shape}</svg>}{label}</span>);
  const st = { stroke: "#38C9F4", strokeWidth: 1.6, fill: "#38C9F4" };
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mute">
      {sw(<circle cx="7" cy="7" r="3.6" {...st} />, "Capillary")}
      {sw(<rect x="3.4" y="3.4" width="7.2" height="7.2" {...st} />, "Arterial")}
      {sw(<polygon points="7,2 12,11 2,11" {...st} />, "Venous")}
      {sw(<polygon points="7,2 12,7 7,12 2,7" {...st} />, "Unknown")}
      {sw(<circle cx="7" cy="7" r="3.6" stroke="#7F90B5" strokeWidth="1.6" fill="#0A0D12" />, "Not interpreted (excluded from trend)")}
      {sw(<g><circle cx="7" cy="7" r="3.6" stroke="#F87171" strokeWidth="1.6" fill="#0A0D12" /><line x1="2" y1="2" x2="12" y2="12" stroke="#F87171" /></g>, "QC-flagged / rejected")}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-4 border border-ok/50 bg-ok/10" />Reference interval</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-4 border border-dashed border-accent2/50 bg-accent2/10" />Baseline ±2 SD</span>
    </div>
  );
}
