"use client";
import { LabChart, type LabSeries } from "@/components/labchart";

/** Client wrapper: LabChart's `ref` prop (reference interval) cannot be passed from a Server Component. */
export function TrendChart({ series, domain, yDomain, unit, decimals, range, baseline, height, xLabel }: {
  series: LabSeries[]; domain: [number, number]; yDomain: [number, number]; unit: string; decimals: number;
  range: { low: number; high: number } | null; baseline: { mean: number; sd: number } | null; height: number; xLabel: boolean;
}) {
  return <LabChart series={series} domain={domain} yDomain={yDomain} unit={unit} decimals={decimals} ref={range} baseline={baseline} height={height} xLabel={xLabel} />;
}
