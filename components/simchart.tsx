"use client";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

export interface SimPt { t: number; v: number }
interface Props {
  title: string; unit: string; decimals: number;
  /** Points revealed so far (reliable) */
  points: SimPt[];
  /** Values the analyzer flagged (shown hollow, never joined by a line) */
  withheld?: SimPt[];
  now: number; duration: number;
  /** Fixed for the whole scenario so the axis never jumps while playing */
  yDomain: [number, number];
  band?: { low: number; high: number } | null;
  hlines?: { y: number; label: string; color: string }[];
  dots?: boolean; color?: string; height?: number; xLabel?: boolean;
  note?: string;
}

export function SimChart({ title, unit, decimals, points, withheld = [], now, duration, yDomain, band, hlines, dots = true, color = "#38C9F4", height = 170, xLabel = false, note }: Props) {
  const ticks: number[] = []; const stepT = duration > 240 ? 60 : 30;
  for (let t = 0; t <= duration; t += stepT) ticks.push(t);
  const last = points[points.length - 1];
  const fmt = (v: number) => v.toFixed(decimals);
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">{title} <span className="text-[11px] font-normal text-mute">{unit}</span></p>
        <p className="num text-[12px] text-ink2">{last ? `${fmt(last.v)} @ t+${last.t}` : "no data yet"}</p>
      </div>
      <div style={{ height }} role="img" aria-label={`${title} over time`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 6, right: 10, left: 0, bottom: xLabel ? 16 : 2 }}>
            <CartesianGrid stroke="#1B222C" />
            <XAxis dataKey="t" type="number" domain={[0, duration]} ticks={ticks} allowDataOverflow tickFormatter={(v: number) => `${v}`} tick={{ fill: "#A8B8D8", fontSize: 10 }} stroke="#7F90B5" tickSize={5}
              label={xLabel ? { value: "Minutes from scenario start", position: "insideBottom", offset: -10, fill: "#A8B8D8", fontSize: 10 } : undefined} />
            <YAxis type="number" domain={yDomain} allowDataOverflow tick={{ fill: "#A8B8D8", fontSize: 10 }} stroke="#7F90B5" tickSize={5} width={44}
              tickFormatter={(v: number) => { const span = yDomain[1] - yDomain[0]; return Number(v.toFixed(span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : 3)).toString(); }} />
            {band && <ReferenceArea y1={band.low} y2={band.high} fill="#4ADE80" fillOpacity={0.08} stroke="#4ADE80" strokeOpacity={0.35} strokeDasharray="4 4" />}
            {hlines?.map((h) => <ReferenceLine key={`${h.label}${h.y}`} y={h.y} stroke={h.color} strokeDasharray="5 4" label={{ value: h.label, fill: h.color, fontSize: 10, position: "insideTopRight" }} />)}
            <ReferenceLine x={now} stroke="#F7FAFF" strokeOpacity={0.45} strokeDasharray="2 2" />
            <Line data={points} dataKey="v" type="monotone" stroke={color} strokeWidth={1.8} dot={dots ? { r: 3, fill: color, stroke: color } : false} isAnimationActive={false} connectNulls={false} />
            {withheld.length > 0 && <Line data={withheld} dataKey="v" stroke="none" isAnimationActive={false} legendType="none"
              dot={{ r: 4, fill: "#0A0D12", stroke: "#F87171", strokeWidth: 1.6 }} activeDot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {(note || withheld.length > 0) && <p className="text-[11px] text-mute">{note}{withheld.length > 0 && <span className="text-crit"> Hollow red = analyzer-flagged value, withheld from interpretation.</span>}</p>}
    </div>
  );
}
