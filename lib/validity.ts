import type { LabResult, MetricKey, SampleType } from "./types";
import { GAS_KEYS, METRICS, OXYGENATION_KEYS, type RangeStatus } from "./metrics";
import { astronauts } from "./data";

export interface Range { low: number; high: number; critLow?: number; critHigh?: number }

const SEX_RANGES: Record<"F" | "M", Partial<Record<MetricKey, Range>>> = {
  F: { tHb: { low: 12.0, high: 15.5, critLow: 8 }, Hct: { low: 36, high: 46, critLow: 24 } },
  M: { tHb: { low: 13.5, high: 17.5, critLow: 8 }, Hct: { low: 41, high: 53, critLow: 24 } },
};
const VENOUS: Partial<Record<MetricKey, Range>> = { pH: { low: 7.31, high: 7.41, critLow: 7.25, critHigh: 7.55 }, pCO2: { low: 41, high: 51, critLow: 25, critHigh: 65 } };

export const sexOf = (id: string) => astronauts.find((a) => a.id === id)?.sex ?? "M";

/**
 * Reference interval for an analyte given sample type and sex. Returns null when the analyte cannot be
 * interpreted for that sample type (e.g. venous pO2 is never read as arterial oxygenation).
 */
export function rangeFor(key: MetricKey, sampleType: SampleType, sex?: "F" | "M"): Range | null {
  if (sampleType === "unknown" && GAS_KEYS.includes(key)) return null;
  if (sampleType === "venous") {
    if (OXYGENATION_KEYS.includes(key)) return null;
    if (VENOUS[key]) return VENOUS[key]!;
  }
  const m = METRICS[key];
  const sx = sex ? SEX_RANGES[sex][key] : undefined;
  return sx ?? { low: m.refLow, high: m.refHigh, critLow: m.critLow, critHigh: m.critHigh };
}

export type Validity = "valid" | "limited" | "unreliable";

export function flagsFor(lab: LabResult, key: MetricKey) {
  return lab.qcFlags.filter((f) => f.analytes.includes(key));
}

export function validityOf(lab: LabResult, key: MetricKey): { level: Validity; note: string } {
  if (lab.verification === "rejected") return { level: "unreliable", note: "Sample rejected at verification." };
  const f = flagsFor(lab, key);
  if (f.length) return { level: "unreliable", note: f.map((x) => `${x.code}: ${x.message}`).join("; ") };
  if (lab.verification === "pending") return { level: "limited", note: "Result not yet verified." };
  if (lab.sampleType === "capillary" && OXYGENATION_KEYS.includes(key)) return { level: "limited", note: "Arterialized capillary sample; may underestimate arterial oxygenation." };
  return { level: "valid", note: "No QC flags raised." };
}

export type Interp = { ok: true; range: Range; validity: Validity; note: string } | { ok: false; reason: "missing" | "unreliable" | "sample-type"; note: string };

export function interpretability(lab: LabResult, key: MetricKey): Interp {
  if (lab.values[key] === undefined) return { ok: false, reason: "missing", note: "No value." };
  const v = validityOf(lab, key);
  if (v.level === "unreliable") return { ok: false, reason: "unreliable", note: v.note };
  const range = rangeFor(key, lab.sampleType, sexOf(lab.astronautId));
  if (!range) {
    return { ok: false, reason: "sample-type", note: lab.sampleType === "venous" ? "Venous sample: not interpretable as arterial oxygenation." : "Sample type unknown: gas values not interpreted." };
  }
  return { ok: true, range, validity: v.level, note: v.note };
}

export type SampleStatus = RangeStatus | "unreliable" | "not-interpretable" | "none";

export function statusIn(lab: LabResult, key: MetricKey): SampleStatus {
  const v = lab.values[key];
  if (v === undefined) return "none";
  const i = interpretability(lab, key);
  if (!i.ok) return i.reason === "unreliable" ? "unreliable" : "not-interpretable";
  const r = i.range;
  if ((r.critLow !== undefined && v < r.critLow) || (r.critHigh !== undefined && v > r.critHigh)) return "critical";
  return v < r.low || v > r.high ? "out-of-range" : "normal";
}

/** A value usable for personal baselines and trends: reliable, and comparable (gas values only from arterial/capillary). */
export function comparable(lab: LabResult, key: MetricKey): boolean {
  if (lab.values[key] === undefined || lab.verification === "rejected" || flagsFor(lab, key).length) return false;
  if (GAS_KEYS.includes(key)) return lab.sampleType === "arterial" || lab.sampleType === "capillary";
  return true;
}
