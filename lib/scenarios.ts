import type { LabResult, MetricKey } from "./types";
import { METRIC_KEYS, METRICS, statusOf } from "./metrics";
import { BASELINE_N, mean, sd, seriesOf } from "./analysis";

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  rampMin: number;
  primary: MetricKey;
  /** Full-severity changes in primary drivers; pH, BE, sO2 and tHb are derived. */
  deltas: Partial<Record<"pCO2" | "HCO3" | "pO2" | "COHb" | "Hct" | "Na" | "K" | "iCa" | "Glu" | "Lac", number>>;
  checklist: string[];
}

export const SCENARIOS: Scenario[] = [
  { id: "co2", name: "Cabin CO₂ scrubber failure", summary: "Progressive CO₂ retention with respiratory acidosis.", rampMin: 90, primary: "pCO2",
    deltas: { pCO2: 22, HCO3: 1.5, pO2: -6, K: 0.2 },
    checklist: ["Confirm cabin CO₂ on environmental telemetry", "Switch to backup scrubber / portable CO₂ removal", "Reduce crew exertion and ventilate affected module", "Repeat blood gas in 15 min and compare slope", "Escalate to ground flight surgeon if pH < 7.30"] },
  { id: "co", name: "Cabin fire / CO exposure", summary: "Carboxyhemoglobin rise with normal pO₂ and sO₂ but falling oxyhemoglobin fraction (FO₂Hb).", rampMin: 20, primary: "COHb",
    deltas: { COHb: 25, Lac: 3.5, HCO3: -3 },
    checklist: ["Don emergency breathing apparatus", "Isolate affected module and begin fire response", "Administer high-flow oxygen per protocol", "Repeat co-oximetry every 10 min", "Prepare for crew contingency / return planning"] },
  { id: "hypoxia", name: "Rapid decompression / hypoxia", summary: "Falling pO₂ with compensatory hyperventilation (respiratory alkalosis).", rampMin: 15, primary: "pO2",
    deltas: { pO2: -35, pCO2: -10, HCO3: -1.5, Lac: 1.2 },
    checklist: ["Don pressure garments / seal bulkhead", "Restore cabin pressure and oxygen partial pressure", "Check wearable SpO₂ for all crew", "Repeat blood gas after pressure recovery", "Assess for decompression injury"] },
  { id: "bleed", name: "Hemorrhage / hypovolemia", summary: "Hematocrit fall with lactate rise and metabolic acidosis.", rampMin: 40, primary: "Lac",
    deltas: { Hct: -9, HCO3: -6, pCO2: -5, Lac: 4.5, K: 0.3, Glu: 30 },
    checklist: ["Control source of bleeding", "Establish IV access and start fluid resuscitation", "Monitor heart rate and blood pressure continuously", "Repeat Hct and lactate every 15 min", "Declare medical emergency and contact ground"] },
  { id: "sepsis", name: "Sepsis / metabolic acidosis", summary: "Slow lactic acidosis with hyperglycemia.", rampMin: 120, primary: "HCO3",
    deltas: { HCO3: -9, pCO2: -8, Lac: 4, Glu: 50, Na: -2 },
    checklist: ["Obtain cultures and full vital signs", "Start empiric broad-spectrum antibiotics per formulary", "Fluid resuscitation and lactate re-check in 30 min", "Isolate crew member if infectious source suspected", "Consult ground flight surgeon"] },
  { id: "k", name: "Hyperkalemia (crush / rhabdomyolysis)", summary: "Potassium rise with falling ionized calcium and acidosis.", rampMin: 45, primary: "K",
    deltas: { K: 2.4, HCO3: -3, iCa: -0.18, Lac: 1.5 },
    checklist: ["Obtain ECG / monitor rhythm", "Protect myocardium per medical protocol (calcium)", "Shift potassium and treat acidosis per formulary", "Repeat K⁺ every 30 min", "Evaluate renal output and hydration"] },
];

const sat = (p: number) => 100 / (23400 / (p ** 3 + 150 * p) + 1);
const hh = (hco3: number, pco2: number) => 6.1 + Math.log10(hco3 / (0.0307 * pco2));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const HORIZON_MIN = 120;
export const STEP_MIN = 5;

export type Values = Partial<Record<MetricKey, number>>;

export function applyScenario(base: Values, sc: Scenario, severity: number, minute: number): Values {
  const f = severity * ease(minute / sc.rampMin);
  const d = sc.deltas;
  const out: Values = { ...base };
  const add = (k: MetricKey, dv?: number) => { if (dv !== undefined && out[k] !== undefined) out[k] = (out[k] as number) + dv * f; };
  for (const k of ["pCO2", "HCO3", "pO2", "COHb", "Hct", "Na", "K", "iCa", "Glu", "Lac"] as const) add(k, d[k]);
  if (base.pH !== undefined && base.pCO2 !== undefined && base.HCO3 !== undefined && out.pCO2 && out.HCO3) {
    const dpH = hh(out.HCO3, out.pCO2) - hh(base.HCO3, base.pCO2);
    out.pH = base.pH + dpH;
    if (base.BE !== undefined) out.BE = base.BE + 0.93 * (out.HCO3 - base.HCO3 + 14.8 * dpH);
  }
  if (base.sO2 !== undefined && base.pO2 !== undefined && out.pO2 !== undefined) out.sO2 = Math.min(100, base.sO2 + (sat(out.pO2) - sat(base.pO2)));
  if (base.FO2Hb !== undefined && out.sO2 !== undefined && base.sO2 !== undefined) {
    const frac = (v: Values) => 1 - ((v.COHb ?? 0) + (v.MetHb ?? 0)) / 100;
    out.FO2Hb = Math.min(100, base.FO2Hb + (out.sO2 * frac(out) - base.sO2 * frac(base)));
  }
  if (base.tHb !== undefined && base.Hct !== undefined && out.Hct !== undefined) out.tHb = base.tHb + (out.Hct - base.Hct) / 3;
  return out;
}

export interface Detection { key: MetricKey; trend?: number; range?: number; critical?: number; }

export interface SimResult {
  minutes: number[];
  rows: Values[];
  detections: Detection[];
  firstTrend?: Detection;
  firstRange?: Detection;
  firstCritical?: Detection;
}

export function runSimulation(labs: LabResult[], sc: Scenario, severity: number): SimResult | null {
  if (!labs.length) return null;
  const ref = [...labs].reverse().find((l) => (l.sampleType === "capillary" || l.sampleType === "arterial") && l.verification !== "rejected" && l.qcFlags.length === 0) ?? labs[labs.length - 1];
  const latest = ref.values;
  const minutes: number[] = [];
  for (let t = 0; t <= HORIZON_MIN; t += STEP_MIN) minutes.push(t);
  const rows = minutes.map((t) => applyScenario(latest, sc, severity, t));

  const detections: Detection[] = [];
  for (const k of METRIC_KEYS) {
    if (sc.deltas[k as keyof Scenario["deltas"]] === undefined && !["pH", "BE", "sO2", "tHb", "FO2Hb"].includes(k)) continue;
    const s = seriesOf(labs, k);
    if (s.length < BASELINE_N) continue;
    const base = s.slice(0, BASELINE_N).map((p) => p.v);
    const bm = mean(base), bsd = Math.max(sd(base), 1e-6);
    const det: Detection = { key: k };
    const wasOut = statusOf(k, latest[k] as number) !== "normal";
    rows.forEach((r, i) => {
      const v = r[k]; if (v === undefined) return;
      const t = minutes[i];
      if (det.trend === undefined && Math.abs(v - bm) / bsd >= 3 && Math.abs(v - (latest[k] as number)) > bsd * 0.5) det.trend = t;
      const st = statusOf(k, v);
      if (det.range === undefined && st !== "normal" && !(wasOut && t === 0)) det.range = t;
      if (det.critical === undefined && st === "critical") det.critical = t;
    });
    if (det.trend !== undefined || det.range !== undefined || det.critical !== undefined) detections.push(det);
  }
  const earliest = (f: (d: Detection) => number | undefined) =>
    detections.filter((d) => f(d) !== undefined).sort((a, b) => (f(a) as number) - (f(b) as number))[0];
  return { minutes, rows, detections, firstTrend: earliest((d) => d.trend), firstRange: earliest((d) => d.range), firstCritical: earliest((d) => d.critical) };
}

export { METRICS };
