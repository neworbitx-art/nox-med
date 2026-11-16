/**
 * Astronaut health assessment: pure, deterministic logic (no React, no storage side effects).
 * - Symptom reports and review documentation are stored SEPARATELY from laboratory results and never modify them.
 * - Every record carries the mission and astronaut it belongs to; selectors always filter on both.
 * - The Astronaut / Medical officer switch is a demonstration view selector, not authentication or access control.
 */
import type { LabResult, MetricKey, SampleType, VitalSign } from "./types";
import { METRICS, METRIC_GROUPS, METRIC_KEYS, fmt, provenanceOf } from "./metrics";
import { comparable, interpretability, rangeFor, sexOf, statusIn, validityOf, type SampleStatus, type Validity } from "./validity";
import { classifyAcidBase, trendOf } from "./analysis";
import { analyzeLabs, paO2FiO2, type Observation } from "./clinical";
import { V, type VKey } from "./wearables";

export type ViewMode = "astronaut" | "officer";
export type Role = "astronaut" | "medical-officer";
export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// ───────────────────────── symptoms ─────────────────────────
export const SYMPTOM_SEVERITIES = ["mild", "moderate", "severe"] as const;
export type SymptomSeverity = (typeof SYMPTOM_SEVERITIES)[number];
export interface SymptomReport { id: string; missionId: string; astronautId: string; symptom: string; onsetDay: number; severity: SymptomSeverity; notes: string; reportedAt: string }
export interface SymptomInput { missionId: string; astronautId: string; symptom: string; onsetDay: number; severity: SymptomSeverity; notes?: string }

export const SYMPTOM_LIMITS = { symptom: 120, notes: 1000 } as const;

export function createSymptom(input: SymptomInput, ctx: { currentDay: number; now: string; id: string }): Result<SymptomReport> {
  const errors: string[] = [];
  const symptom = (input.symptom ?? "").trim(), notes = (input.notes ?? "").trim();
  if (!input.missionId || !input.astronautId) errors.push("Mission and astronaut are required.");
  if (!symptom) errors.push("Describe the symptom.");
  if (symptom.length > SYMPTOM_LIMITS.symptom) errors.push(`Symptom description is limited to ${SYMPTOM_LIMITS.symptom} characters.`);
  if (!Number.isInteger(input.onsetDay) || input.onsetDay < 1 || input.onsetDay > ctx.currentDay) errors.push(`Onset must be a mission day between 1 and ${ctx.currentDay}.`);
  if (!(SYMPTOM_SEVERITIES as readonly string[]).includes(input.severity)) errors.push("Choose a severity.");
  if (notes.length > SYMPTOM_LIMITS.notes) errors.push(`Notes are limited to ${SYMPTOM_LIMITS.notes} characters.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { id: ctx.id, missionId: input.missionId, astronautId: input.astronautId, symptom, onsetDay: input.onsetDay, severity: input.severity, notes, reportedAt: ctx.now } };
}

export const symptomsFor = (all: SymptomReport[], missionId: string, astronautId: string) =>
  all.filter((s) => s.missionId === missionId && s.astronautId === astronautId).sort((a, b) => b.onsetDay - a.onsetDay || b.reportedAt.localeCompare(a.reportedAt));

// ───────────────────────── review documentation ─────────────────────────
export type ReviewAction = "request-review" | "acknowledge" | "reviewed" | "repeat-sample" | "escalate";
export type ReviewStatus = "none" | "requested" | "acknowledged" | "reviewed" | "repeat-requested" | "escalated";
export const ACTION_LABEL: Record<ReviewAction, string> = {
  "request-review": "Request medical officer review", acknowledge: "Acknowledge", reviewed: "Mark as reviewed", "repeat-sample": "Request repeat sample", escalate: "Escalate to flight surgeon",
};
export const ROLE_ACTIONS: Record<Role, ReviewAction[]> = { astronaut: ["acknowledge", "request-review"], "medical-officer": ["reviewed", "repeat-sample", "escalate"] };
export const STATUS_LABEL: Record<ReviewStatus, string> = {
  none: "Not reviewed", requested: "Review requested", acknowledged: "Acknowledged by astronaut", reviewed: "Reviewed by medical officer", "repeat-requested": "Repeat sample requested", escalated: "Escalated to flight surgeon",
};
const ACTION_STATUS: Record<ReviewAction, ReviewStatus> = { "request-review": "requested", acknowledge: "acknowledged", reviewed: "reviewed", "repeat-sample": "repeat-requested", escalate: "escalated" };
export const NOTE_LIMIT = 500;

export interface ReviewEntry { id: string; missionId: string; astronautId: string; observationId: string; observationTitle: string; sampleId: string; action: ReviewAction; by: Role; note: string; validity: Validity; at: string }
export type ReviewInput = Omit<ReviewEntry, "id" | "at" | "note"> & { note?: string };

export function createReview(input: ReviewInput, ctx: { now: string; id: string }): Result<ReviewEntry> {
  const errors: string[] = [];
  const note = (input.note ?? "").trim();
  if (!input.missionId || !input.astronautId || !input.observationId || !input.sampleId) errors.push("Mission, astronaut, observation and sample are required.");
  if (!ROLE_ACTIONS[input.by]?.includes(input.action)) errors.push(`"${ACTION_LABEL[input.action] ?? input.action}" is not available in this view.`);
  if (note.length > NOTE_LIMIT) errors.push(`Notes are limited to ${NOTE_LIMIT} characters.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...input, note, id: ctx.id, at: ctx.now } };
}

export const reviewsFor = (all: ReviewEntry[], missionId: string, astronautId: string) => all.filter((r) => r.missionId === missionId && r.astronautId === astronautId);

/** Current status of one observation = its latest documented action (append-only log). */
export function reviewStatus(entries: ReviewEntry[], observationId: string): { status: ReviewStatus; last: ReviewEntry | null } {
  const mine = entries.filter((e) => e.observationId === observationId);
  if (!mine.length) return { status: "none", last: null };
  const last = mine.reduce((a, b) => (b.at >= a.at ? b : a));
  return { status: ACTION_STATUS[last.action], last };
}
export const isOpenForReview = (s: ReviewStatus) => s !== "reviewed";

// ───────────────────────── persistence (storage injected so it can be tested) ─────────────────────────
export const ASSESSMENT_KEYS = { symptoms: "nox.symptoms", reviews: "nox.reviews" } as const;
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const isStr = (x: unknown): x is string => typeof x === "string";
const isSymptom = (x: unknown): x is SymptomReport => { const s = x as SymptomReport; return !!s && isStr(s.id) && isStr(s.missionId) && isStr(s.astronautId) && isStr(s.symptom) && Number.isInteger(s.onsetDay) && (SYMPTOM_SEVERITIES as readonly string[]).includes(s.severity) && isStr(s.notes) && isStr(s.reportedAt); };
const isReview = (x: unknown): x is ReviewEntry => { const r = x as ReviewEntry; return !!r && isStr(r.id) && isStr(r.missionId) && isStr(r.astronautId) && isStr(r.observationId) && isStr(r.observationTitle) && isStr(r.sampleId) && r.action in ACTION_LABEL && (r.by === "astronaut" || r.by === "medical-officer") && isStr(r.note) && isStr(r.at) && isStr(r.validity); };

export function saveAssessment(st: StorageLike, data: { symptoms: SymptomReport[]; reviews: ReviewEntry[] }) {
  try { st.setItem(ASSESSMENT_KEYS.symptoms, JSON.stringify(data.symptoms)); st.setItem(ASSESSMENT_KEYS.reviews, JSON.stringify(data.reviews)); } catch { /* storage unavailable: session-only */ }
}
export function loadAssessment(st: StorageLike): { symptoms: SymptomReport[]; reviews: ReviewEntry[] } {
  const read = <T,>(key: string, guard: (x: unknown) => x is T): T[] => { try { const raw = st.getItem(key); const j = raw ? JSON.parse(raw) : []; return Array.isArray(j) ? j.filter(guard) : []; } catch { return []; } };
  return { symptoms: read(ASSESSMENT_KEYS.symptoms, isSymptom), reviews: read(ASSESSMENT_KEYS.reviews, isReview) };
}

// ───────────────────────── observations ─────────────────────────
const RANK = { critical: 0, warning: 1, watch: 2, info: 3 } as const;

/** Observations for one astronaut: non-info items from the last 5 samples (latest wins per rule) plus the latest sample's own items. Deterministic rules only. */
export function assessmentObservations(labs: LabResult[], astronautId: string): { latest: LabResult | null; observations: Observation[] } {
  const mine = labs.filter((l) => l.astronautId === astronautId).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  const latest = mine[mine.length - 1] ?? null;
  if (!latest) return { latest: null, observations: [] };
  const byRule = new Map<string, Observation>();
  for (const s of mine.slice(-5)) for (const o of analyzeLabs(mine, s.id)) {
    if (o.severity === "info" && s.id !== latest.id) continue;
    byRule.set(`${o.domain}|${o.title}`, o);
  }
  const observations = [...byRule.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.missionDay - a.missionDay);
  return { latest, observations };
}

export interface Reliability { sampleType: SampleType | null; analyzer: string | null; verification: string | null; flags: string[]; missing: string[] }
/** How reliable is an observation: sample type, analyzer, verification, QC flags and what information is missing. */
export function reliabilityOf(o: Observation, sample: LabResult | undefined): Reliability {
  const missing: string[] = [];
  if (!o.baseline) missing.push("No personal baseline yet (needs at least 14 reliable samples).");
  if (!o.previous) missing.push("No earlier reliable sample to compare with.");
  if (sample?.verification === "pending") missing.push("Result not yet verified.");
  if (o.domain === "oxygenation" && sample && sample.fio2 === undefined) missing.push("FiO₂ was not recorded with this sample.");
  return { sampleType: sample?.sampleType ?? null, analyzer: sample?.analyzer ?? null, verification: sample?.verification ?? null, flags: sample?.qcFlags.map((f) => `${f.code}: ${f.message}`) ?? [], missing };
}

// ───────────────────────── measurements ─────────────────────────
export type Quality = "qc-clean" | "limited" | "flagged" | "not-interpreted" | "not-measured";
export interface MeasurementRow {
  key: MetricKey; label: string; name: string; group: string; unit: string;
  value: number | null; display: string;
  collectedAt: string | null; sampleType: SampleType | null; sampleId: string | null;
  provenance: "measured" | "calculated";
  quality: Quality; qualityNote: string; status: SampleStatus;
  range: { low: number; high: number } | null;
  baseline: { mean: number; sd: number; delta: number; z: number } | null;
}
export const QUALITY_LABEL: Record<Quality, string> = { "qc-clean": "QC clean", limited: "Limited", flagged: "QC flag", "not-interpreted": "Not interpreted", "not-measured": "Not measured" };

/** Every analyte from the single latest sample. Missing analytes stay missing; nothing is carried over from other samples or estimated. */
export function measurementRows(labs: LabResult[], astronautId: string): { sample: LabResult | null; rows: MeasurementRow[] } {
  const mine = labs.filter((l) => l.astronautId === astronautId).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  const sample = mine[mine.length - 1] ?? null;
  const rows: MeasurementRow[] = [];
  for (const g of METRIC_GROUPS) for (const key of METRIC_KEYS.filter((k) => METRICS[k].group === g)) {
    const m = METRICS[key];
    const base = { key, label: m.label, name: m.name, group: g, unit: m.unit, provenance: provenanceOf(key) };
    const v = sample?.values[key];
    if (!sample || v === undefined || Number.isNaN(v)) { rows.push({ ...base, value: null, display: "—", collectedAt: sample?.collectedAt ?? null, sampleType: sample?.sampleType ?? null, sampleId: sample?.id ?? null, quality: "not-measured", qualityNote: "Not reported in the latest sample.", status: "none", range: null, baseline: null }); continue; }
    const it = interpretability(sample, key), val = validityOf(sample, key);
    const quality: Quality = !it.ok ? (it.reason === "sample-type" ? "not-interpreted" : "flagged") : val.level === "valid" ? "qc-clean" : val.level === "limited" ? "limited" : "flagged";
    const range = it.ok ? { low: it.range.low, high: it.range.high } : null;
    let baseline: MeasurementRow["baseline"] = null;
    if (comparable(sample, key)) { const t = trendOf(mine, key); if (t) baseline = { mean: t.baselineMean, sd: t.baselineSd, delta: v - t.baselineMean, z: (v - t.baselineMean) / t.baselineSd }; }
    rows.push({ ...base, value: v, display: fmt(key, v), collectedAt: sample.collectedAt, sampleType: sample.sampleType, sampleId: sample.id, quality, qualityNote: it.ok ? it.note : it.note, status: statusIn(sample, key), range, baseline });
  }
  return { sample, rows };
}

/** Plain-language list of measurements that moved away from the astronaut's own baseline (same 3-SD rule as the alert engine). */
export function changeSummary(rows: MeasurementRow[], zLimit = 3): { key: MetricKey; text: string }[] {
  return rows.filter((r) => r.baseline && r.value !== null && Math.abs(r.baseline.z) >= zLimit && r.quality !== "flagged" && r.quality !== "not-interpreted")
    .map((r) => ({ key: r.key, text: `${r.name} is ${r.baseline!.delta > 0 ? "higher" : "lower"} than your usual: ${r.display} now, ${fmt(r.key, r.baseline!.mean)} usually${r.unit ? ` ${r.unit}` : ""}.` }));
}

export interface Calc { id: string; label: string; value: string | null; note: string }
/** Acid–base and related calculations for the medical officer. A value is produced only when every input is interpretable for this sample. */
export function acidBaseCalcs(l: LabResult): Calc[] {
  const ok = (...k: MetricKey[]) => k.every((x) => interpretability(l, x).ok);
  const out: Calc[] = [];
  if (ok("pH", "pCO2", "HCO3")) {
    const pH = l.values.pH!, pco2 = l.values.pCO2!, hco3 = l.values.HCO3!;
    out.push({ id: "pattern", label: "Acid–base pattern", value: classifyAcidBase(pH, pco2, hco3).label, note: "Rule-based pattern from pH, pCO₂ and HCO₃⁻; not a diagnosis." });
    const hh = 0.0307 * pco2 * 10 ** (pH - 6.1);
    out.push({ id: "hh", label: "HCO₃⁻ from Henderson–Hasselbalch", value: `${hh.toFixed(1)} mmol/L`, note: `Reported ${hco3.toFixed(1)} mmol/L; difference ${(hco3 - hh).toFixed(1)}. A large difference suggests a measurement problem.` });
    if (pH < 7.35 && hco3 < 22) out.push({ id: "winters", label: "Expected pCO₂ (Winter's formula)", value: `${(1.5 * hco3 + 8).toFixed(1)} ± 2 mmHg`, note: "Shown only for a metabolic acidosis pattern. Population estimate, steady state assumed." });
  } else out.push({ id: "pattern", label: "Acid–base pattern", value: null, note: "Needs interpretable pH, pCO₂ and HCO₃⁻ from an arterial or capillary sample." });
  if (ok("Na", "Cl", "HCO3")) out.push({ id: "ag", label: "Anion gap (Na − Cl − HCO₃⁻)", value: `${(l.values.Na! - l.values.Cl! - l.values.HCO3!).toFixed(1)} mmol/L`, note: "Potassium and albumin are not included." });
  else out.push({ id: "ag", label: "Anion gap", value: null, note: "Needs interpretable Na⁺, Cl⁻ and HCO₃⁻." });
  const pf = paO2FiO2(l);
  out.push({ id: "pf", label: "PaO₂ / FiO₂", value: pf.value === null ? null : `${pf.value.toFixed(0)} mmHg`, note: pf.reason });
  return out;
}

// ───────────────────────── wearables ─────────────────────────
export interface VitalRow { key: VKey; label: string; unit: string; value: number | null; display: string; day: number | null; baseline: number | null; delta: number | null }
export const ASSESSMENT_VITALS: VKey[] = ["restingHr", "hrvMs", "systolic", "diastolic", "respRate", "spo2", "sleepHours", "skinTempC"];
/** Latest wearable value per channel with the astronaut's own early-mission mean (days 1–30, needs 10 records) for comparison. Wearable values are device estimates, not analyzer results. */
export function vitalRows(vitals: VitalSign[], astronautId: string, keys: VKey[] = ASSESSMENT_VITALS): VitalRow[] {
  const mine = vitals.filter((v) => v.astronautId === astronautId).sort((a, b) => a.missionDay - b.missionDay);
  const last = mine[mine.length - 1], early = mine.filter((v) => v.missionDay <= 30);
  return keys.map((key) => {
    const d = V[key];
    if (!last) return { key, label: d.label, unit: d.unit, value: null, display: "—", day: null, baseline: null, delta: null };
    const value = last[key] as number, baseline = early.length >= 10 ? early.reduce((s, v) => s + (v[key] as number), 0) / early.length : null;
    return { key, label: d.label, unit: d.unit, value, display: value.toFixed(d.dec), day: last.missionDay, baseline, delta: baseline === null ? null : value - baseline };
  });
}
