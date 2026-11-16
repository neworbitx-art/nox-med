// Binds each functional body system to its measurements. Latest value, unit, collection time, trend and measurement quality;
// nothing is estimated, and arterial/venous handling comes from lib/validity.
import { environment, labsFor, vitalsFor } from "./data";
import { METRICS, CALCULATED_KEYS, fmt } from "./metrics";
import { statusIn, interpretability, comparable } from "./validity";
import { trendOf } from "./analysis";
import { V, type VKey } from "./wearables";
import type { AstronautId, LabResult, MetricKey } from "./types";

export type BoundSystem = "cardiovascular" | "respiratory" | "blood";
export type Quality = "valid" | "flagged" | "not-interpreted" | "device-reported" | "ship-sensor" | "recorded-with-sample" | "unavailable";
export type Provenance = "recorded" | "imported" | "calculated";
export interface Binding { id: string; label: string; src: "lab" | "vital" | "env" | "fio2"; key?: MetricKey; vital?: VKey; env?: "co2Mmhg"; note?: string; href: string }
export interface BoundRow { id: string; label: string; value: string | null; unit: string; collected: string | null; trend: "up" | "down" | "flat" | null; quality: Quality; qualityNote: string; provenance: Provenance[]; sampleType?: string; note?: string; href: string }

const lab = (key: MetricKey, label?: string, note?: string): Binding => ({ id: key, label: label ?? METRICS[key].label, src: "lab", key, note, href: `/demo/blood-gas?m=${key}` });
const vit = (vital: VKey, label?: string): Binding => ({ id: vital, label: label ?? V[vital].label, src: "vital", vital, href: `/demo/wearables?v=${vital}` });
export const BINDINGS: Record<BoundSystem, Binding[]> = {
  cardiovascular: [vit("restingHr", "Heart rate (resting)"), vit("meanHr", "Heart rate (24 h mean)"), vit("systolic", "Blood pressure, systolic"), vit("diastolic", "Blood pressure, diastolic"), lab("tHb", "Hemoglobin (tHb)"), lab("Hct", "Hematocrit"), lab("Lac", "Lactate"), lab("K", "Potassium"), lab("iCa", "Ionized calcium")],
  respiratory: [vit("respRate", "Respiratory rate"), vit("spo2", "SpO₂ (pulse oximetry)"), lab("pO2", "Arterial pO₂", "interpreted only for arterial / capillary samples"), lab("pCO2", "Arterial pCO₂", "interpreted only for arterial / capillary samples"), lab("pH"), lab("HCO3", "Bicarbonate (cHCO₃⁻)"), { id: "fio2", label: "FiO₂ (inspired fraction)", src: "fio2", note: "only when recorded with the sample", href: "/blood-gas" }, { id: "cabinCo2", label: "Cabin CO₂", src: "env", env: "co2Mmhg", note: "ship sensor, not a clinical value", href: "/environment" }],
  blood: [lab("tHb", "Hemoglobin (tHb)"), lab("Hct", "Hematocrit"), lab("sO2", "Oxygen saturation (sO₂)", "arterial / capillary samples only"), lab("FO2Hb", "Oxyhemoglobin (FO₂Hb)", "arterial / capillary samples only"), lab("COHb", "Carboxyhemoglobin (COHb)"), lab("MetHb", "Methemoglobin (MetHb)")],
};

const dir = (a: number, b: number): "up" | "down" | "flat" => { const r = (b - a) / (Math.abs(a) || 1); return Math.abs(r) < 0.02 ? "flat" : r > 0 ? "up" : "down"; };

export function boundRows(id: AstronautId, labs: LabResult[], system: BoundSystem): BoundRow[] {
  const mine = labsFor(labs, id).filter((l) => l.verification !== "rejected"), vit = vitalsFor(id), env = environment[environment.length - 1];
  return BINDINGS[system].map((b): BoundRow => {
    const empty = (collected: string | null, why: string, unit = ""): BoundRow => ({ id: b.id, label: b.label, value: null, unit, collected, trend: null, quality: "unavailable", qualityNote: why, provenance: [], note: b.note, href: b.href });
    if (b.src === "env") {
      if (!env) return empty(null, "No ship sensor record");
      return { id: b.id, label: b.label, value: String(env[b.env!]), unit: "mmHg", collected: `mission day ${env.missionDay}`, trend: null, quality: "ship-sensor", qualityNote: "Spacecraft environment, not astronaut physiology", provenance: ["recorded"], note: b.note, href: b.href };
    }
    if (b.src === "vital") {
      const last = vit[vit.length - 1], prev = vit[vit.length - 2]; if (!last) return empty(null, "No wearable record", V[b.vital!].unit);
      const a = prev ? prev[b.vital!] : null;
      return { id: b.id, label: b.label, value: last[b.vital!].toFixed(V[b.vital!].dec), unit: V[b.vital!].unit, collected: `mission day ${last.missionDay}`, trend: a === null ? null : dir(a, last[b.vital!]), quality: "device-reported", qualityNote: "Wearable device value (separate from analyzer results)", provenance: [last.origin === "simulated" ? "recorded" : "imported"], note: b.note, href: b.href };
    }
    if (b.src === "fio2") {
      const l = [...mine].reverse().find((x) => x.fio2 !== undefined);
      if (!l) return empty(null, "FiO₂ not recorded with any sample");
      return { id: b.id, label: b.label, value: (l.fio2! * 100).toFixed(0), unit: "%", collected: l.collectedAt.replace("T", " ").slice(0, 16) + " UTC", trend: null, quality: "recorded-with-sample", qualityNote: "As entered with the sample", provenance: [l.origin === "simulated" ? "recorded" : "imported"], sampleType: l.sampleType, note: b.note, href: b.href };
    }
    const key = b.key!, cand = mine.filter((l) => l.values[key] !== undefined), usable = cand.filter((l) => comparable(l, key)), last = usable[usable.length - 1];
    if (!last) return empty(null, cand.length ? "No arterial/capillary or QC-clean sample to interpret" : "No sample on record", METRICS[key].unit);
    const st = statusIn(last, key), it = interpretability(last, key), prev = usable[usable.length - 2], t = trendOf(usable, key);
    const q: Quality = st === "unreliable" ? "flagged" : st === "not-interpretable" ? "not-interpreted" : "valid";
    const prov: Provenance[] = [last.origin === "simulated" ? "recorded" : "imported", ...(CALCULATED_KEYS.includes(key) ? (["calculated"] as Provenance[]) : [])];
    return { id: b.id, label: b.label, value: fmt(key, last.values[key] as number), unit: METRICS[key].unit, collected: last.collectedAt.replace("T", " ").slice(0, 16) + " UTC", trend: prev && prev.sampleType === last.sampleType ? (t?.direction ?? dir(prev.values[key] as number, last.values[key] as number)) : null, quality: q, qualityNote: it.ok ? it.note : it.note, provenance: prov, sampleType: last.sampleType, note: b.note, href: b.href };
  });
}
