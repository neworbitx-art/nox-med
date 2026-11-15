import type { Pt } from "@/components/labchart";
import type { LabResult, MetricKey, SampleType } from "./types";
import { elapsedDays } from "./data";
import { comparable, flagsFor, validityOf } from "./validity";
import type { TPoint } from "./telemetry";

/** Y-domain with 8 % padding. zero=true forces the axis to start at 0 (non-truncated). */
export function yDomain(vals: number[], extra: number[] = [], zero = false): [number, number] {
  const all = [...vals, ...extra];
  if (!all.length) return [0, 1];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) lo = Math.min(0, lo);
  const s = hi - lo || Math.abs(hi) * 0.1 || 1;
  return [zero ? Math.min(0, lo) : lo - s * 0.08, hi + s * 0.08];
}
export const truncated = (d: [number, number], vals: number[]) => vals.length > 0 && d[0] > 0 && Math.min(...vals) > 0;

export const toPts = (pts: TPoint[], prefix: string): Pt[] => pts.map((p, i) => ({ id: `${prefix}-${i}`, t: p.t, v: p.v }));

export const WINDOWS = [
  { value: 3, label: "3 d" }, { value: 7, label: "7 d" }, { value: 14, label: "14 d" }, { value: 30, label: "30 d" }, { value: 90, label: "90 d" }, { value: 999, label: "All" },
];
/** Time window as [t0, t1] in elapsed mission days (t1 = end of current mission day). */
export const windowOf = (days: number, currentDay: number): [number, number] => [days >= 999 ? 1 : Math.max(1, currentDay + 1 - days), currentDay + 1];
/** Extra lines are only included in the domain when near the data, so thresholds never squash the signal. */
export const nearLines = (vals: number[], lines: (number | undefined)[]) => {
  if (!vals.length) return [];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return lines.filter((x): x is number => x !== undefined && x > lo - 2 * span && x < hi + 2 * span);
};

export type TypeFilter = SampleType | "all";

/** All actual lab measurements of one analyte (with sample type / validity metadata) from `from` onward. */
export function pointsFor(labs: LabResult[], key: MetricKey, from: number, type: TypeFilter, showFlagged: boolean): Pt[] {
  return labs
    .filter((l) => l.values[key] !== undefined && elapsedDays(l.collectedAt) >= from && (type === "all" || l.sampleType === type))
    .map((l) => ({
      id: l.id, t: elapsedDays(l.collectedAt), v: l.values[key] as number, collectedAt: l.collectedAt, sampleType: l.sampleType, verification: l.verification,
      validity: validityOf(l, key).level, interpretable: comparable(l, key), flags: flagsFor(l, key).map((f) => f.code),
    }))
    .filter((p) => showFlagged || p.validity !== "unreliable");
}
