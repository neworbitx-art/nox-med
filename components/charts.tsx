"use client";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeriesDef { key: string; label: string; color: string; dashed?: boolean; axis?: "left" | "right"; width?: number; dots?: boolean }
export type Row = Record<string, number | null>;

interface Props {
  data: Row[];
  series: SeriesDef[];
  xKey?: string;
  xLabel?: string;
  band?: { low: number; high: number };
  lines?: { y: number; label: string; color: string }[];
  height?: number;
  decimals?: number;
  leftLabel?: string;
  rightLabel?: string;
  domain?: [number | "auto", number | "auto"];
}

export function TrendChart({ data, series, xKey = "day", xLabel = "Mission day", band, lines, height = 280, decimals = 2, leftLabel, rightLabel, domain }: Props) {
  const hasRight = series.some((s) => s.axis === "right");
  return (
    <div style={{ height }} role="img" aria-label={`Trend chart: ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: hasRight ? 4 : 12, left: 0, bottom: 14 }}>
          <CartesianGrid stroke="#1B222C" />
          <XAxis dataKey={xKey} type="number" domain={["dataMin", "dataMax"]} tick={{ fill: "#A8B8D8", fontSize: 11 }} stroke="#7F90B5" tickSize={6}
            label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "#A8B8D8", fontSize: 11 }} />
          <YAxis yAxisId="left" domain={domain ?? ["auto", "auto"]} tick={{ fill: "#A8B8D8", fontSize: 11 }} stroke="#7F90B5" tickSize={6} width={48}
            tickFormatter={(v: number) => Number(v.toFixed(decimals)).toString()}
            label={leftLabel ? { value: leftLabel, angle: -90, position: "insideLeft", fill: "#A8B8D8", fontSize: 11 } : undefined} />
          {hasRight && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fill: "#A8B8D8", fontSize: 11 }} stroke="#7F90B5" tickSize={6} width={48}
            label={rightLabel ? { value: rightLabel, angle: 90, position: "insideRight", fill: "#A8B8D8", fontSize: 11 } : undefined} />}
          {band && <ReferenceArea yAxisId="left" y1={band.low} y2={band.high} fill="#4ADE80" fillOpacity={0.08} stroke="#4ADE80" strokeOpacity={0.35} strokeDasharray="4 4" />}
          {lines?.map((l) => (
            <ReferenceLine key={`${l.label}-${l.y}`} yAxisId="left" y={l.y} stroke={l.color} strokeDasharray="5 4" label={{ value: l.label, fill: l.color, fontSize: 10, position: "insideTopRight" }} />
          ))}
          <Tooltip contentStyle={{ background: "#0A0D12", border: "1px solid #2B3440", borderRadius: 2, fontSize: 12, color: "#F7FAFF" }} labelStyle={{ color: "#A8B8D8" }}
            labelFormatter={(l) => `${xLabel} ${l}`} formatter={(v) => (typeof v === "number" ? Number(v.toFixed(decimals + 1)) : v)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Line key={s.key} yAxisId={s.axis ?? "left"} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.width ?? 2}
              strokeDasharray={s.dashed ? "6 4" : undefined} dot={s.dots ? { r: 2.5 } : false} connectNulls isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
