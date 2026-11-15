/**
 * Deterministic, explainable clinical rule engine for NOX MED (SIMULATED data, decision support only).
 * - No LLM, no treatment instructions: every output is a "possible pattern" with its reasons and uncertainty.
 * - Thresholds are illustrative and configurable via CLINICAL_CONFIG; not clinically validated.
 * - pH / pCO₂ reference intervals come from rangeFor() in validity.ts (sample-type aware).
 */
import type { LabResult, MetricKey, Severity } from "./types";
import { METRICS, fmt } from "./metrics";
import { interpretability, rangeFor, sexOf, statusIn, validityOf, comparable, type Validity } from "./validity";
import { mean, trendOf } from "./analysis";

export const CLINICAL_CONFIG = {
  acidBase: {
    pHSevereLow: 7.2, pHSevereHigh: 7.6,
    hco3Low: 22, hco3High: 26,
    /** Winter's formula for metabolic acidosis: expected pCO₂ = 1.5·HCO₃ + 8 ± tol */
    winters: { slope: 1.5, intercept: 8, tol: 2 },
    /** Metabolic alkalosis: expected pCO₂ = 40 + 0.7·(HCO₃ − 24) ± tol */
    metAlk: { slope: 0.7, tol: 5 },
    /** Expected HCO₃ change per 10 mmHg pCO₂ change (acute / chronic) */
    respAcidosis: { acutePer10: 1, chronicPer10: 3.5 },
    respAlkalosis: { acutePer10: 2, chronicPer10: 4.5 },
    hco3Tol: 2,
    /** HH consistency: |reported − calculated HCO₃| above this is flagged */
    consistencyTol: 2.5,
  },
  anionGap: { high: 16 }, // Na − Cl − HCO₃ (no K, albumin not measured)
  lactate: { elevated: 2.0, severe: 4.0, risingSamples: 3, risingMinDelta: 0.3 },
  hemoglobin: { dropGdl: 1.0, dropWindowDays: 7, baselineDropPct: 7 },
  dyshemoglobin: { cohbWarn: 3, cohbSevere: 10, methbWarn: 2, methbSevere: 5 },
  oxygenation: { pO2Low: 80, ratioLow: 300 },
  baselineZ: 3,
} as const;
export type ClinicalConfig = typeof CLINICAL_CONFIG;

export type Domain = "acid-base" | "electrolyte" | "lactate" | "hemoglobin" | "oxygenation" | "quality";

export interface Observation {
  id: string;
  astronautId: string;
  sampleId: string;
  missionDay: number;
  collectedAt: string;
  domain: Domain;
  severity: Severity;
  title: string;
  parameters: MetricKey[];
  current: string;
  previous?: string;
  reference: string;
  baseline?: string;
  significance: string;
  validity: Validity;
  validityNote: string;
  /** Rule steps that produced this observation, in order */
  reasons: string[];
  uncertainty: string;
  /** Calculated (not directly measured) analytes used */
  calculated: MetricKey[];
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, watch: 2, info: 3 };
const num = (l: LabResult, k: MetricKey) => l.values[k] as number;
const show = (l: LabResult, k: MetricKey) => `${METRICS[k].label} ${fmt(k, l.values[k])}${METRICS[k].unit ? " " + METRICS[k].unit : ""}`;
const worst = (a: Validity[]): Validity => (a.includes("unreliable") ? "unreliable" : a.includes("limited") ? "limited" : "valid");
const rng = (k: MetricKey, l: LabResult) => { const r = rangeFor(k, l.sampleType, sexOf(l.astronautId)); return r ? `${METRICS[k].label} ${r.low}–${r.high}` : METRICS[k].label; };
const TYPE_NOTE = (l: LabResult) => (l.sampleType === "capillary" ? "Arterialized capillary sample." : l.sampleType === "venous" ? "Venous sample; venous reference intervals applied to pH and pCO₂." : l.sampleType === "arterial" ? "Arterial sample." : "Unknown sample type.");

export function paO2FiO2(l: LabResult): { value: number | null; reason: string } {
  if (l.sampleType !== "arterial") return { value: null, reason: `Not calculated: requires an arterial sample (this sample is ${l.sampleType}).` };
  if (l.fio2 === undefined) return { value: null, reason: "Not calculated: FiO₂ not recorded." };
  const i = interpretability(l, "pO2");
  if (!i.ok) return { value: null, reason: `Not calculated: pO₂ ${i.note}` };
  return { value: num(l, "pO2") / l.fio2, reason: "Calculated: pO₂ ÷ FiO₂ (arterial sample)." };
}

export function expectedPco2MetabolicAcidosis(hco3: number, c: ClinicalConfig = CLINICAL_CONFIG) { return c.acidBase.winters.slope * hco3 + c.acidBase.winters.intercept; }
export function expectedHco3RespAcidosis(pco2: number, c: ClinicalConfig = CLINICAL_CONFIG) {
  const d = (pco2 - 40) / 10; return { acute: 24 + c.acidBase.respAcidosis.acutePer10 * d, chronic: 24 + c.acidBase.respAcidosis.chronicPer10 * d };
}
export function expectedHco3RespAlkalosis(pco2: number, c: ClinicalConfig = CLINICAL_CONFIG) {
  const d = (40 - pco2) / 10; return { acute: 24 - c.acidBase.respAlkalosis.acutePer10 * d, chronic: 24 - c.acidBase.respAlkalosis.chronicPer10 * d };
}

interface Ctx { all: LabResult[]; hist: LabResult[]; cur: LabResult; cfg: ClinicalConfig }
const previous = (c: Ctx, keys: MetricKey[]) => [...c.hist].slice(0, -1).reverse().find((l) => keys.every((k) => comparable(l, k)));

function base(c: Ctx, domain: Domain, slug: string, o: Partial<Observation> & Pick<Observation, "severity" | "title" | "parameters" | "current" | "reference" | "significance" | "reasons" | "uncertainty">): Observation {
  const v = worst(o.parameters.map((k) => (c.cur.values[k] === undefined ? "valid" : validityOf(c.cur, k).level)));
  const note = o.parameters.map((k) => validityOf(c.cur, k)).find((x) => x.level === v)?.note ?? "No QC flags raised.";
  return { id: `${c.cur.astronautId}-${c.cur.id}-${domain}-${slug}`, astronautId: c.cur.astronautId, sampleId: c.cur.id, missionDay: c.cur.missionDay, collectedAt: c.cur.collectedAt,
    domain, validity: v, validityNote: `${TYPE_NOTE(c.cur)} ${note}`, calculated: [], ...o };
}

// ---------- Quality / validity ----------
function quality(c: Ctx): Observation[] {
  const out: Observation[] = [];
  const l = c.cur;
  const push = (slug: string, title: string, parameters: MetricKey[], reasons: string[], validity: Validity, current: string) =>
    out.push({ id: `${l.astronautId}-${l.id}-quality-${slug}`, astronautId: l.astronautId, sampleId: l.id, missionDay: l.missionDay, collectedAt: l.collectedAt, domain: "quality", severity: "info",
      title, parameters, current, reference: "Not applied: measurement not considered reliable", significance: "Cannot be treated as a confirmed clinical abnormality. Consider re-collection and re-measurement.",
      validity, validityNote: reasons[0], reasons, uncertainty: "Quality flags come from analyzer/operator input; absence of a flag does not prove validity.", calculated: [] });
  if (l.verification === "rejected") push("rejected", "Sample rejected — no results interpreted", Object.keys(l.values) as MetricKey[], ["Verification status: rejected.", ...l.qcFlags.map((f) => `${f.code}: ${f.message}`)], "unreliable", `${Object.keys(l.values).length} analytes withheld`);
  else {
    for (const f of l.qcFlags) push(`flag-${f.code}`, `${f.analytes.map((k) => METRICS[k].label).join(", ")} flagged (${f.code}) — not interpreted as confirmed`, f.analytes,
      [`${f.code}: ${f.message}`, "Flagged analytes are excluded from alerts, baselines and trends."], "unreliable", f.analytes.filter((k) => l.values[k] !== undefined).map((k) => show(l, k)).join(" · "));
    if (l.verification === "pending") push("pending", "Results pending verification — interpretations provisional", [], ["Verification status: pending."], "limited", "—");
  }
  if (l.sampleType === "unknown") push("type", "Sample type unknown — blood-gas values not interpreted", ["pH", "pCO2", "pO2", "HCO3"], ["Arterial, venous and capillary values have different expected ranges."], "limited", "—");
  if (l.sampleType === "venous") push("venous", "Venous sample — oxygenation not interpreted", ["pO2", "sO2", "FO2Hb"], ["Venous pO₂/sO₂ are not read as arterial oxygenation.", "PaO₂/FiO₂ is not calculated from venous samples."], "limited", [show(l, "pO2"), show(l, "sO2")].join(" · "));
  return out;
}

// ---------- Acid-base ----------
function acidBase(c: Ctx): Observation[] {
  const l = c.cur, A = c.cfg.acidBase;
  const keys: MetricKey[] = ["pH", "pCO2", "HCO3"];
  if (!keys.every((k) => interpretability(l, k).ok)) return [];
  const pH = num(l, "pH"), pco2 = num(l, "pCO2"), hco3 = num(l, "HCO3");
  const rp = rangeFor("pH", l.sampleType)!, rc = rangeFor("pCO2", l.sampleType)!;
  const acid = pH < rp.low, alk = pH > rp.high;
  const cHi = pco2 > rc.high, cLo = pco2 < rc.low, bLo = hco3 < A.hco3Low, bHi = hco3 > A.hco3High;
  const reasons: string[] = [`pH ${pH.toFixed(3)} vs ${rp.low}–${rp.high}: ${acid ? "acidemia" : alk ? "alkalemia" : "within interval"}.`,
    `pCO₂ ${pco2.toFixed(1)} vs ${rc.low}–${rc.high} mmHg: ${cHi ? "high" : cLo ? "low" : "within interval"}.`, `HCO₃⁻ ${hco3.toFixed(1)} vs ${A.hco3Low}–${A.hco3High} mmol/L: ${bLo ? "low" : bHi ? "high" : "within interval"} (calculated).`];
  const calcHco3 = 0.0307 * pco2 * 10 ** (pH - 6.1);
  const out: Observation[] = [];
  const prev = previous(c, keys);
  const mk = (slug: string, severity: Severity, title: string, significance: string) =>
    out.push(base(c, "acid-base", slug, {
      severity, title, parameters: keys, calculated: ["HCO3"],
      current: `${show(l, "pH")} · ${show(l, "pCO2")} · ${show(l, "HCO3")}`,
      previous: prev ? `${show(prev, "pH")} · ${show(prev, "pCO2")} · ${show(prev, "HCO3")} (day ${prev.missionDay})` : undefined,
      reference: `${rng("pH", l)} · ${rng("pCO2", l)} · HCO₃⁻ ${A.hco3Low}–${A.hco3High}`,
      baseline: (() => { const a = trendOf(c.hist, "pH"), b = trendOf(c.hist, "pCO2"); return a && b ? `pH ${a.baselineMean.toFixed(3)} · pCO₂ ${b.baselineMean.toFixed(1)} (personal, first 10 samples)` : undefined; })(),
      significance, reasons: [...reasons],
      uncertainty: "Pattern from a single sample, not a diagnosis. Acuity cannot be determined without history; compensation formulas are population estimates assuming steady state.",
    }));

  if (Math.abs(calcHco3 - hco3) > A.consistencyTol) {
    mk("inconsistent", "watch", "pH, pCO₂ and HCO₃⁻ are internally inconsistent", "Reported HCO₃⁻ differs from the Henderson–Hasselbalch value; verify measurement before interpretation.");
    out[out.length - 1].reasons.push(`Calculated HCO₃⁻ from pH/pCO₂ = ${calcHco3.toFixed(1)} vs reported ${hco3.toFixed(1)} mmol/L (tolerance ${A.consistencyTol}).`);
    return out;
  }
  const severe = pH < A.pHSevereLow || pH > A.pHSevereHigh;
  const sev: Severity = severe ? "critical" : "warning";

  if (acid) {
    if (cHi && bLo) mk("mixed-acidosis", sev, "Acidemia: possible mixed respiratory and metabolic acidosis", "Both ventilatory CO₂ retention and a low bicarbonate are present.");
    else if (cHi) {
      mk("resp-acidosis", sev, "Acidemia: possible primary respiratory acidosis", "Pattern consistent with CO₂ retention (e.g. reduced ventilation or elevated inspired CO₂).");
      const e = expectedHco3RespAcidosis(pco2, c.cfg), r = out[out.length - 1].reasons;
      r.push(`Expected HCO₃⁻: ${e.acute.toFixed(1)} (acute) to ${e.chronic.toFixed(1)} (chronic) mmol/L.`);
      if (hco3 < e.acute - A.hco3Tol) r.push("Measured HCO₃⁻ is below the acute expectation → possible additional metabolic acidosis.");
      else if (hco3 > e.chronic + A.hco3Tol) r.push("Measured HCO₃⁻ is above the chronic expectation → possible additional metabolic alkalosis.");
      else r.push(hco3 > e.acute + 0.5 ? "Measured HCO₃⁻ lies within acute-to-chronic compensation (partial compensation likely)." : "Little renal compensation yet → consistent with acute or early exposure.");
    } else if (bLo) {
      mk("met-acidosis", sev, "Acidemia: possible primary metabolic acidosis", "Low bicarbonate; consider lactate, ketones, renal or GI causes.");
      const exp = expectedPco2MetabolicAcidosis(hco3, c.cfg), r = out[out.length - 1].reasons, t = A.winters.tol;
      r.push(`Expected pCO₂ (Winter's): ${(exp - t).toFixed(1)}–${(exp + t).toFixed(1)} mmHg.`);
      r.push(pco2 > exp + t ? "Measured pCO₂ higher than expected → possible additional respiratory acidosis." : pco2 < exp - t ? "Measured pCO₂ lower than expected → possible additional respiratory alkalosis." : "Measured pCO₂ within expected compensation.");
    } else mk("acidemia-unexplained", "watch", "Mild acidemia with pCO₂ and HCO₃⁻ within interval", "Borderline finding; interpret with trend and measurement variation.");
  } else if (alk) {
    if (cLo && bHi) mk("mixed-alkalosis", sev, "Alkalemia: possible mixed respiratory and metabolic alkalosis", "Both hyperventilation and elevated bicarbonate are present.");
    else if (cLo) {
      mk("resp-alkalosis", sev, "Alkalemia: possible primary respiratory alkalosis", "Pattern consistent with hyperventilation (e.g. hypoxia, pain, anxiety).");
      const e = expectedHco3RespAlkalosis(pco2, c.cfg), r = out[out.length - 1].reasons;
      r.push(`Expected HCO₃⁻: ${e.chronic.toFixed(1)} (chronic) to ${e.acute.toFixed(1)} (acute) mmol/L.`);
      r.push(hco3 < e.chronic - A.hco3Tol ? "Measured HCO₃⁻ below chronic expectation → possible additional metabolic acidosis." : hco3 > e.acute + A.hco3Tol ? "Measured HCO₃⁻ above acute expectation → possible additional metabolic alkalosis." : "Measured HCO₃⁻ within expected compensation.");
    } else if (bHi) {
      mk("met-alkalosis", sev, "Alkalemia: possible primary metabolic alkalosis", "Elevated bicarbonate; consider volume contraction, chloride loss, or exogenous base.");
      const exp = 40 + A.metAlk.slope * (hco3 - 24), r = out[out.length - 1].reasons;
      r.push(`Expected pCO₂: ${(exp - A.metAlk.tol).toFixed(1)}–${(exp + A.metAlk.tol).toFixed(1)} mmHg.`);
      r.push(pco2 > exp + A.metAlk.tol ? "Measured pCO₂ higher than expected → possible additional respiratory acidosis." : pco2 < exp - A.metAlk.tol ? "Measured pCO₂ lower than expected → possible additional respiratory alkalosis." : "Measured pCO₂ within expected compensation.");
    } else mk("alkalemia-unexplained", "watch", "Mild alkalemia with pCO₂ and HCO₃⁻ within interval", "Borderline finding; interpret with trend and measurement variation.");
  } else if (cHi && bHi) mk("comp-resp-acidosis", "watch", "Normal pH with high pCO₂ and high HCO₃⁻: possible compensated respiratory acidosis or metabolic alkalosis", "Full compensation, or two opposing disorders (mixed), cannot be separated from one sample.");
  else if (cLo && bLo) mk("comp-resp-alkalosis", "watch", "Normal pH with low pCO₂ and low HCO₃⁻: possible compensated respiratory alkalosis or metabolic acidosis", "Full compensation, or two opposing disorders (mixed), cannot be separated from one sample.");
  else if (cHi || cLo || bLo || bHi) mk("isolated-deviation", "watch", `Normal pH with isolated ${cHi ? "high" : cLo ? "low" : bLo ? "low" : "high"} ${cHi || cLo ? "pCO₂" : "HCO₃⁻"}`, "Minor deviation without pH change; monitor trend.");
  else mk("normal", "info", "Acid-base status within reference intervals", "No acid-base disorder pattern detected in this sample.");

  // Anion gap (calculated, optional)
  if (bLo && interpretability(l, "Na").ok && interpretability(l, "Cl").ok) {
    const ag = num(l, "Na") - num(l, "Cl") - hco3;
    if (ag > c.cfg.anionGap.high && acid) out[out.length - 1].reasons.push(`Calculated anion gap ${ag.toFixed(1)} mmol/L (> ${c.cfg.anionGap.high}) → possible high anion gap component; albumin not measured.`);
    else out[out.length - 1].reasons.push(`Calculated anion gap ${ag.toFixed(1)} mmol/L (Na − Cl − HCO₃⁻).`);
  }
  // Trend context
  const t = trendOf(c.hist, "pCO2");
  if (t && Math.abs(t.z) >= c.cfg.baselineZ) out[out.length - 1].reasons.push(`pCO₂ is ${t.z.toFixed(1)}σ ${t.z > 0 ? "above" : "below"} the personal baseline (trend).`);
  return out;
}

// ---------- Electrolytes ----------
const ELECT: Record<string, { low: string; high: string }> = {
  Na: { low: "Low sodium: fluid balance or intake; neurological symptoms possible when severe.", high: "High sodium: free-water deficit or excess sodium intake." },
  K: { low: "Low potassium: arrhythmia and muscle weakness risk.", high: "High potassium: cardiac conduction risk; exclude hemolysis artifact." },
  Cl: { low: "Low chloride: may accompany metabolic alkalosis.", high: "High chloride: may accompany non-gap metabolic acidosis." },
  iCa: { low: "Low ionized calcium: neuromuscular excitability and cardiac effects.", high: "High ionized calcium: bone resorption or excess intake; relevant in microgravity." },
};
function electrolytes(c: Ctx): Observation[] {
  const out: Observation[] = [];
  for (const k of ["Na", "K", "Cl", "iCa"] as MetricKey[]) {
    const l = c.cur, i = interpretability(l, k);
    if (!i.ok) continue;
    const st = statusIn(l, k);
    if (st !== "out-of-range" && st !== "critical") continue;
    const v = num(l, k), dir = v < i.range.low ? "low" : "high";
    const prev = previous(c, [k]);
    const pst = prev ? statusIn(prev, k) : "none";
    const reasons = [`${show(l, k)} vs ${i.range.low}–${i.range.high} → ${dir}.`];
    if (st === "critical") reasons.push(`Beyond critical limit (${dir === "low" ? i.range.critLow : i.range.critHigh}).`);
    if (pst === "out-of-range" || pst === "critical") reasons.push("Also outside interval on the previous reliable sample → persistent."); else if (prev) reasons.push("Previous reliable sample was within interval → new finding.");
    const t = trendOf(c.hist, k); if (t) reasons.push(`Personal baseline ${fmt(k, t.baselineMean)}; current is ${t.z >= 0 ? "+" : ""}${t.z.toFixed(1)}σ (last 4 samples).`);
    out.push(base(c, "electrolyte", k, { severity: st === "critical" ? "critical" : pst === "none" || pst === "normal" ? "watch" : "warning",
      title: `${METRICS[k].name} ${dir} (${show(l, k)})`, parameters: [k], current: show(l, k), previous: prev ? `${show(prev, k)} (day ${prev.missionDay})` : undefined,
      reference: `${METRICS[k].label} ${i.range.low}–${i.range.high} ${METRICS[k].unit}`, baseline: t ? `${fmt(k, t.baselineMean)} ± ${t.baselineSd.toFixed(METRICS[k].decimals + 1)}` : undefined,
      significance: ELECT[k][dir], reasons, uncertainty: "Single measurement; repeat to confirm, especially if symptoms are absent." }));
  }
  return out;
}

// ---------- Lactate ----------
function lactate(c: Ctx): Observation[] {
  const l = c.cur, L = c.cfg.lactate;
  if (!interpretability(l, "Lac").ok) return [];
  const v = num(l, "Lac"), reasons: string[] = [];
  let sev: Severity = "info";
  if (v >= L.severe) { sev = "critical"; reasons.push(`Lactate ${v.toFixed(2)} ≥ ${L.severe} mmol/L (severe).`); }
  else if (v > L.elevated) { sev = "warning"; reasons.push(`Lactate ${v.toFixed(2)} > ${L.elevated} mmol/L (elevated).`); }
  const rel = c.hist.filter((x) => comparable(x, "Lac")).slice(-L.risingSamples);
  if (rel.length === L.risingSamples && rel.every((x, i) => i === 0 || num(x, "Lac") > num(rel[i - 1], "Lac")) && num(rel[rel.length - 1], "Lac") - num(rel[0], "Lac") >= L.risingMinDelta) {
    reasons.push(`Rising across the last ${L.risingSamples} reliable samples (${rel.map((x) => num(x, "Lac").toFixed(2)).join(" → ")} mmol/L).`); if (sev === "info") sev = "watch";
  }
  const t = trendOf(c.hist, "Lac");
  if (t && t.z >= c.cfg.baselineZ) { reasons.push(`${t.z.toFixed(1)}σ above personal baseline ${t.baselineMean.toFixed(2)} mmol/L.`); if (sev === "info") sev = "watch"; }
  if (sev === "info") return [];
  const prev = previous(c, ["Lac"]);
  return [base(c, "lactate", "trend", { severity: sev, title: sev === "watch" ? "Lactate trending upward" : "Lactate elevated", parameters: ["Lac"], current: show(l, "Lac"),
    previous: prev ? `${show(prev, "Lac")} (day ${prev.missionDay})` : undefined, reference: `Lac ${METRICS.Lac.refLow}–${METRICS.Lac.refHigh} mmol/L (alert > ${L.elevated})`,
    baseline: t ? `${t.baselineMean.toFixed(2)} mmol/L` : undefined, significance: "Possible reduced tissue perfusion or oxygen delivery, increased glycolysis (stress, exertion) or sample handling effect.",
    reasons, uncertainty: "Lactate rises with exertion and delayed analysis; confirm with a repeat sample and clinical context." })];
}

// ---------- Hemoglobin ----------
function hemoglobin(c: Ctx): Observation[] {
  const l = c.cur, H = c.cfg.hemoglobin;
  const i = interpretability(l, "tHb");
  if (!i.ok) return [];
  const v = num(l, "tHb"), reasons: string[] = [];
  let sev: Severity = "info";
  const st = statusIn(l, "tHb");
  if (st === "critical") { sev = "critical"; reasons.push(`Hemoglobin ${v.toFixed(1)} g/dL below critical limit ${i.range.critLow}.`); }
  else if (st === "out-of-range") { sev = "warning"; reasons.push(`Hemoglobin ${v.toFixed(1)} g/dL outside ${i.range.low}–${i.range.high} (${sexOf(l.astronautId) === "F" ? "female" : "male"} interval).`); }
  const t = trendOf(c.hist, "tHb");
  if (t) {
    const pct = ((t.baselineMean - v) / t.baselineMean) * 100;
    if (t.baselineMean - v >= H.dropGdl && pct >= H.baselineDropPct) { reasons.push(`${(t.baselineMean - v).toFixed(1)} g/dL (${pct.toFixed(0)}%) below personal baseline ${t.baselineMean.toFixed(1)} g/dL.`); if (sev === "info") sev = "watch"; }
  }
  const prev = previous(c, ["tHb"]);
  if (prev && (new Date(l.collectedAt).getTime() - new Date(prev.collectedAt).getTime()) / 86400000 <= H.dropWindowDays && num(prev, "tHb") - v >= H.dropGdl) {
    reasons.push(`Fell ${(num(prev, "tHb") - v).toFixed(1)} g/dL within ${H.dropWindowDays} days (abrupt change).`); sev = sev === "critical" ? sev : "warning";
  }
  if (sev === "info") return [];
  return [base(c, "hemoglobin", "change", { severity: sev, title: sev === "watch" ? "Hemoglobin declining from personal baseline" : "Hemoglobin abnormal or falling", parameters: ["tHb", "Hct"], calculated: ["Hct"],
    current: `${show(l, "tHb")} · ${show(l, "Hct")}`, previous: prev ? `${show(prev, "tHb")} (day ${prev.missionDay})` : undefined,
    reference: `tHb ${i.range.low}–${i.range.high} g/dL`, baseline: t ? `${t.baselineMean.toFixed(1)} ± ${t.baselineSd.toFixed(2)} g/dL` : undefined,
    significance: "Consistent with spaceflight-associated hemolysis/anemia, blood loss, hemodilution or nutritional causes; reduces oxygen-carrying capacity.",
    reasons, uncertainty: "Hematocrit is calculated from hemoglobin. Gradual decline is expected in long-duration flight; the cause cannot be established from this test." })];
}

// ---------- Oxygenation / oximetry ----------
function oxygenation(c: Ctx): Observation[] {
  const l = c.cur, O = c.cfg.oxygenation, D = c.cfg.dyshemoglobin, out: Observation[] = [];
  const ok = (k: MetricKey) => interpretability(l, k).ok;
  if (ok("pO2")) {
    const v = num(l, "pO2"), reasons: string[] = []; let sev: Severity = "info";
    if (v < O.pO2Low) { reasons.push(`pO₂ ${v.toFixed(1)} < ${O.pO2Low} mmHg.`); sev = statusIn(l, "pO2") === "critical" ? "critical" : "warning"; }
    const r = paO2FiO2(l);
    if (r.value !== null) { reasons.push(`PaO₂/FiO₂ = ${r.value.toFixed(0)} (calculated).`); if (r.value < O.ratioLow) { sev = "warning"; reasons.push(`Below ${O.ratioLow}.`); } }
    else reasons.push(`PaO₂/FiO₂ ${r.reason}`);
    if (sev !== "info") out.push(base(c, "oxygenation", "po2", { severity: sev, title: "Low oxygen tension", parameters: ["pO2"], current: show(l, "pO2"), reference: rng("pO2", l) + " mmHg",
      significance: "Possible reduced oxygen availability (cabin pO₂, ventilation/perfusion mismatch).", reasons, calculated: [],
      uncertainty: l.sampleType === "arterial" ? "Single arterial value." : "Capillary pO₂ may underestimate arterial oxygenation; arterial sample needed to confirm." }));
  }
  const dys: [MetricKey, number, number][] = [["COHb", D.cohbWarn, D.cohbSevere], ["MetHb", D.methbWarn, D.methbSevere]];
  for (const [k, w, s] of dys) {
    if (!ok(k)) continue;
    const v = num(l, k);
    if (v <= w) continue;
    const reasons = [`${show(l, k)} > ${w}%.`];
    if (ok("sO2") && ok("FO2Hb")) reasons.push(`sO₂ ${fmt("sO2", num(l, "sO2"))}% vs FO₂Hb ${fmt("FO2Hb", num(l, "FO2Hb"))}%: sO₂ can look normal while oxygen-carrying capacity is reduced.`);
    out.push(base(c, "oxygenation", k, { severity: v >= s ? "critical" : "warning", title: `${METRICS[k].name} elevated`, parameters: [k, "FO2Hb"], current: show(l, k), reference: `${METRICS[k].label} ≤ ${w} %`,
      significance: k === "COHb" ? "Possible combustion-product or CO exposure; check cabin air quality." : "Possible oxidant exposure; reduces oxygen delivery.", reasons, uncertainty: "Co-oximetry measurement; confirm with repeat sample." }));
  }
  return out;
}

export function analyzeLabs(all: LabResult[], sampleId?: string, cfg: ClinicalConfig = CLINICAL_CONFIG): Observation[] {
  const sorted = [...all].sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  const idx = sampleId ? sorted.findIndex((l) => l.id === sampleId) : sorted.length - 1;
  if (idx < 0) return [];
  const ctx: Ctx = { all: sorted, hist: sorted.slice(0, idx + 1), cur: sorted[idx], cfg };
  const out = [...quality(ctx), ...acidBase(ctx), ...electrolytes(ctx), ...lactate(ctx), ...hemoglobin(ctx), ...oxygenation(ctx)];
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
export { mean };
