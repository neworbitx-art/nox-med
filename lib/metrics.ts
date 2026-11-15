import type { MetricDef, MetricKey, Provenance } from "./types";

// Reference intervals: adult arterial / arterialized-capillary whole blood. Illustrative values for a
// SIMULATED prototype; configurable and not clinically validated.
export const METRICS: Record<MetricKey, MetricDef> = {
  pH:   { key: "pH",   label: "pH",    name: "pH",                 unit: "",       decimals: 3, group: "Blood gas", refLow: 7.35, refHigh: 7.45, critLow: 7.25, critHigh: 7.55, meaning: "Blood acidity" },
  pCO2: { key: "pCO2", label: "pCO₂",  name: "Carbon dioxide tension", unit: "mmHg", decimals: 1, group: "Blood gas", refLow: 35, refHigh: 45, critLow: 25, critHigh: 60, meaning: "Ventilation / CO₂ retention" },
  pO2:  { key: "pO2",  label: "pO₂",   name: "Oxygen tension",     unit: "mmHg",   decimals: 1, group: "Blood gas", refLow: 80,   refHigh: 105,  critLow: 60,                    meaning: "Oxygen tension (arterial oxygenation only if arterial)" },
  HCO3: { key: "HCO3", label: "cHCO₃⁻",name: "Bicarbonate",        unit: "mmol/L", decimals: 1, group: "Blood gas", refLow: 22,   refHigh: 26,   critLow: 15,   critHigh: 35,    meaning: "Metabolic buffer (calculated)" },
  BE:   { key: "BE",   label: "BE",    name: "Base excess",        unit: "mmol/L", decimals: 1, group: "Blood gas", refLow: -2,   refHigh: 2,    critLow: -10,  critHigh: 10,    meaning: "Metabolic acid-base status (calculated)" },
  Na:   { key: "Na",   label: "Na⁺",   name: "Sodium",             unit: "mmol/L", decimals: 1, group: "Electrolytes", refLow: 136, refHigh: 145, critLow: 125, critHigh: 155, meaning: "Sodium / fluid balance" },
  K:    { key: "K",    label: "K⁺",    name: "Potassium",          unit: "mmol/L", decimals: 2, group: "Electrolytes", refLow: 3.5, refHigh: 5.1, critLow: 3.0, critHigh: 6.0, meaning: "Potassium / cardiac risk" },
  Cl:   { key: "Cl",   label: "Cl⁻",   name: "Chloride",           unit: "mmol/L", decimals: 1, group: "Electrolytes", refLow: 98,  refHigh: 107, critLow: 85,  critHigh: 115, meaning: "Anion balance" },
  iCa:  { key: "iCa",  label: "Ca²⁺",  name: "Ionized calcium",    unit: "mmol/L", decimals: 2, group: "Electrolytes", refLow: 1.12, refHigh: 1.32, critLow: 1.0, critHigh: 1.5, meaning: "Bone / muscle / cardiac" },
  Lac:  { key: "Lac",  label: "Lac",   name: "Lactate",            unit: "mmol/L", decimals: 2, group: "Metabolites", refLow: 0.5, refHigh: 1.6, critHigh: 4.0, meaning: "Tissue perfusion / hypoxia" },
  Glu:  { key: "Glu",  label: "Glu",   name: "Glucose",            unit: "mg/dL",  decimals: 0, group: "Metabolites", refLow: 70,  refHigh: 110, critLow: 50, critHigh: 300, meaning: "Energy / stress metabolism" },
  tHb:  { key: "tHb",  label: "tHb",   name: "Hemoglobin",         unit: "g/dL",   decimals: 1, group: "Hematology & oximetry", refLow: 12, refHigh: 17, critLow: 8, meaning: "Total hemoglobin" },
  Hct:  { key: "Hct",  label: "Hct",   name: "Hematocrit",         unit: "%",      decimals: 1, group: "Hematology & oximetry", refLow: 36, refHigh: 51, critLow: 24, meaning: "Red-cell volume fraction (calculated from tHb)" },
  sO2:  { key: "sO2",  label: "sO₂",   name: "Oxygen saturation",  unit: "%",      decimals: 1, group: "Hematology & oximetry", refLow: 95, refHigh: 100, critLow: 88, meaning: "Saturation of functional hemoglobin" },
  FO2Hb:{ key: "FO2Hb",label: "FO₂Hb", name: "Oxyhemoglobin fraction", unit: "%",  decimals: 1, group: "Hematology & oximetry", refLow: 94, refHigh: 98, critLow: 85, meaning: "Oxyhemoglobin as fraction of total Hb" },
  COHb: { key: "COHb", label: "COHb",  name: "Carboxyhemoglobin",  unit: "%",      decimals: 1, group: "Hematology & oximetry", refLow: 0, refHigh: 2, critHigh: 10, meaning: "Carbon monoxide exposure" },
  MetHb:{ key: "MetHb",label: "MetHb", name: "Methemoglobin",      unit: "%",      decimals: 1, group: "Hematology & oximetry", refLow: 0, refHigh: 1.5, critHigh: 5, meaning: "Oxidized hemoglobin" },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
export const METRIC_GROUPS = ["Blood gas", "Electrolytes", "Metabolites", "Hematology & oximetry"] as const;

/** Values derived arithmetically by the analyzer from other measurements. */
export const CALCULATED_KEYS: MetricKey[] = ["HCO3", "BE", "Hct"];
export const provenanceOf = (k: MetricKey): Provenance => (CALCULATED_KEYS.includes(k) ? "calculated" : "measured");

/** Analytes whose meaning depends on sample type (arterial/venous/capillary). */
export const GAS_KEYS: MetricKey[] = ["pH", "pCO2", "pO2", "HCO3", "BE", "sO2", "FO2Hb"];
export const OXYGENATION_KEYS: MetricKey[] = ["pO2", "sO2", "FO2Hb"];

export function fmt(key: MetricKey, v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(METRICS[key].decimals);
}

export type RangeStatus = "normal" | "out-of-range" | "critical";

/** Status against default (arterial / unisex) limits. Prefer statusIn() in lib/validity for sample-aware status. */
export function statusOf(key: MetricKey, v: number): RangeStatus {
  const m = METRICS[key];
  if ((m.critLow !== undefined && v < m.critLow) || (m.critHigh !== undefined && v > m.critHigh)) return "critical";
  if (v < m.refLow || v > m.refHigh) return "out-of-range";
  return "normal";
}
