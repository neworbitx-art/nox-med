import type { MetricKey, QcFlag, SampleType, UploadedLab } from "./types";
import { PLAUSIBLE } from "./importer";
import { METRICS, CALCULATED_KEYS } from "./metrics";

/**
 * ABL90-style report parsing. Pure functions only (no DOM) so they can be unit-tested.
 * Principles: never invent a value; anything not found is "unavailable"; every extracted value must be
 * confirmed by a person (verification) before it can be saved.
 */

export type AnalyteKey = MetricKey | "FHHb" | "ctBil" | "AG" | "AGK";
export const ANALYTE_KEYS: AnalyteKey[] = ["pH", "pCO2", "pO2", "HCO3", "BE", "Lac", "Na", "K", "Cl", "iCa", "Glu", "tHb", "Hct", "sO2", "FO2Hb", "COHb", "MetHb", "FHHb", "ctBil", "AG", "AGK"];
export const EXTRA_META: Record<"FHHb" | "ctBil" | "AG" | "AGK", { label: string; unit: string; decimals: number; plausible: [number, number] }> = {
  FHHb: { label: "FHHb", unit: "%", decimals: 1, plausible: [0, 100] },
  ctBil: { label: "ctBil", unit: "mg/dL", decimals: 1, plausible: [0, 60] },
  AG: { label: "Anion gap", unit: "mmol/L", decimals: 1, plausible: [-10, 50] },
  AGK: { label: "Anion gap (K⁺)", unit: "mmol/L", decimals: 1, plausible: [-10, 60] },
};
export const analyteMeta = (k: AnalyteKey) => (k in EXTRA_META ? EXTRA_META[k as keyof typeof EXTRA_META] : { label: METRICS[k as MetricKey].label, unit: METRICS[k as MetricKey].unit, decimals: METRICS[k as MetricKey].decimals, plausible: PLAUSIBLE[k as MetricKey] });
export const plausibleOf = (k: AnalyteKey): [number, number] => analyteMeta(k).plausible;
/** Calculated by the analyzer (ABL90 prints a trailing "c" on these) */
export const CALC_ANALYTES = new Set<AnalyteKey>([...CALCULATED_KEYS, "AG", "AGK"] as AnalyteKey[]);

export interface Extracted {
  raw: string;            // text as read from the report
  value?: number;         // normalized to NOX MED units
  unit?: string;          // unit found on the report
  converted?: boolean;    // unit converted to NOX MED unit
  calculated: boolean;
  questionable: boolean;  // analyzer "?" marker
  refFlag?: "high" | "low";
  note?: string;
}
export interface ReportFlag { analyte?: AnalyteKey; code: string; message: string }
export interface ExtractedReport {
  analyzer?: string;
  date?: { iso: string; ambiguous: boolean; raw: string };
  time?: { hhmm: string; raw: string };
  patientId?: string;     // shown for operator mapping only; never stored
  sampleType?: SampleType;
  temperatureC?: number;
  fio2?: number;
  fields: Partial<Record<AnalyteKey, Extracted>>;
  flags: ReportFlag[];
  recognizedLines: number;
  totalLines: number;
}

const norm = (s: string) =>
  s.replace(/[−–—]/g, "-").replace(/₂/g, "2").replace(/₃/g, "3").replace(/²/g, "2").replace(/⁺/g, "+").replace(/⁻/g, "-").replace(/[ \t ]+/g, " ").trim();

const NUM = /(-?\d+(?:[.,]\d+)?)/;
const num = (s: string) => Number(s.replace(",", "."));

/** Label patterns, tested against the line after leading markers are removed. Order matters. */
const LABELS: { key: AnalyteKey; re: RegExp; calc?: boolean }[] = [
  { key: "pH", re: /^pH(?!\s*\()/i },
  { key: "pCO2", re: /^pCO2(?!\s*\()/i },
  { key: "pO2", re: /^pO2(?!\s*\()/i },
  { key: "tHb", re: /^c?tHb\b/i },
  { key: "sO2", re: /^sO2\b/i },
  { key: "FO2Hb", re: /^FO2Hb\b/i },
  { key: "COHb", re: /^F?COHb\b/i },
  { key: "FHHb", re: /^F?HHb\b/i },
  { key: "MetHb", re: /^F?MetHb\b/i },
  { key: "K", re: /^c?K\+?(?=\s|\d|$)/ },
  { key: "Na", re: /^c?Na\+?(?=\s|\d|$)/ },
  { key: "iCa", re: /^c?Ca\s?(?:2\+|\+\+)/ },
  { key: "Cl", re: /^c?Cl-?(?=\s|\d|$)/ },
  { key: "Glu", re: /^c?Glu\b/i },
  { key: "Lac", re: /^c?Lac\b/i },
  { key: "ctBil", re: /^c?tBil\b/i },
  { key: "BE", re: /^c?Base\s*\(?/i, calc: true },
  { key: "HCO3", re: /^c?HCO3-?/i, calc: true },
  { key: "AGK", re: /^Anion\s*Gap\s*,\s*K/i, calc: true },
  { key: "AG", re: /^Anion\s*Gap/i, calc: true },
  { key: "Hct", re: /^Hct/i, calc: true },
];

function analyteOfToken(tok: string): AnalyteKey | undefined {
  const t = norm(tok).replace(/^[?*↑↓\s]+/, "");
  return LABELS.find((l) => l.re.test(t) || l.re.test(t + " "))?.key;
}

type Section = "gas" | "oxi" | "elec" | "meta" | "temp" | "oxystate" | "calc" | "notes";
const SECTIONS: [RegExp, Section][] = [
  [/corregid|temperature[- ]corrected|temp\.? corrected/i, "temp"],
  [/estado de oxigenaci|oxygen status/i, "oxystate"],
  [/valores calculados|calculated values/i, "calc"],
  [/^notas\b|^notes\b/i, "notes"],
  [/gases en sangre|blood gas/i, "gas"],
  [/oximetr/i, "oxi"],
  [/electr[oó]litos|electrolytes/i, "elec"],
  [/metabolit/i, "meta"],
];

const UNIT_RE = /^(mmHg|kPa|mmol\/L|mmol\/kg|g\/dL|g\/L|mg\/dL|µmol\/L|umol\/L|Vol%|%|L\/L)/i;

/** Convert to NOX MED units where the conversion is exact and unambiguous; otherwise keep the value and add a note. */
function convert(key: AnalyteKey, v: number, unit: string | undefined): { v: number; converted: boolean; note?: string } {
  const u = (unit ?? "").toLowerCase();
  if ((key === "pCO2" || key === "pO2") && u === "kpa") return { v: Math.round(v * 7.50062 * 10) / 10, converted: true, note: "converted from kPa" };
  if (key === "tHb" && u === "g/l") return { v: Math.round(v) / 10, converted: true, note: "converted from g/L" };
  if (key === "Glu" && u === "mmol/l") return { v: Math.round(v * 18.016), converted: true, note: "converted from mmol/L" };
  if (key === "Hct" && u === "l/l") return { v: Math.round(v * 1000) / 10, converted: true, note: "converted from L/L" };
  const expect = analyteMeta(key).unit.toLowerCase();
  if (unit && !u.startsWith(expect) && !(expect === "%" && u === "vol%")) return { v, converted: false, note: `unit "${unit}" differs from expected ${analyteMeta(key).unit}; verify` };
  return { v, converted: false };
}

function parseDate(text: string): ExtractedReport["date"] {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, ambiguous: false, raw: m[0] };
  m = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);
  if (!m) return undefined;
  const a = Number(m[1]), b = Number(m[2]), y = m[3];
  const pad = (n: number) => String(n).padStart(2, "0");
  // The example ABL90 layout prints MM/DD/YYYY. When both parts are ≤ 12 the order cannot be known.
  if (a > 12 && b <= 12) return { iso: `${y}-${pad(b)}-${pad(a)}`, ambiguous: false, raw: m[0] };
  if (b > 12 && a <= 12) return { iso: `${y}-${pad(a)}-${pad(b)}`, ambiguous: false, raw: m[0] };
  if (a > 12 && b > 12) return undefined;
  return { iso: `${y}-${pad(a)}-${pad(b)}`, ambiguous: a !== b, raw: m[0] };
}

function parseTime(text: string): ExtractedReport["time"] {
  const m = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s?m\.?/i) ?? text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?(?!\d)()/);
  if (!m) return undefined;
  let h = Number(m[1]); const mi = Number(m[2]); const ap = (m[3] ?? "").toLowerCase();
  if (mi > 59 || h > 23 || (ap && (h < 1 || h > 12))) return undefined;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return { hhmm: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`, raw: m[0] };
}

export function sampleTypeFrom(s: string): SampleType {
  const t = s.toLowerCase();
  if (/^art/.test(t)) return "arterial";
  if (/^ven/.test(t)) return "venous";
  if (/^cap/.test(t)) return "capillary";
  return "unknown";
}

export function parseAblText(raw: string): ExtractedReport {
  const lines = raw.split(/\r?\n/).map(norm).filter(Boolean);
  const rep: ExtractedReport = { fields: {}, flags: [], recognizedLines: 0, totalLines: lines.length };
  let section: Section | null = null;

  // Header block (first ~12 lines): analyzer model, date, time
  const head = lines.slice(0, 14).join("\n");
  rep.analyzer = head.match(/ABL\s?\d{2,3}(?:\s?(?:FLEX|PLUS|SERIES))?/i)?.[0]?.replace(/\s+/g, " ").toUpperCase();
  rep.date = parseDate(head);
  rep.time = parseTime(head);

  for (const line of lines) {
    const sec = SECTIONS.find(([re]) => re.test(line) && !NUM.test(line.replace(/\bpH\(T\)/i, "")) );
    if (sec && !/^\W*[↑↓?]?\s*(pH|pCO2|pO2)\b/i.test(line)) { section = sec[1]; rep.recognizedLines++; continue; }

    const idm = line.match(/^(?:ID\s+(?:de\s+)?paciente|Patient\s+ID|ID)\s*[:\s]\s*(\S.*)$/i);
    if (idm && !/^de\b/i.test(idm[1])) { rep.patientId = idm[1].trim(); rep.recognizedLines++; continue; }
    const tm = line.match(/^(?:Tipo\s+(?:de\s+)?muestra|Sample\s+type)\s*[:\s]\s*(\S+)/i);
    if (tm) { rep.sampleType = sampleTypeFrom(tm[1]); rep.recognizedLines++; continue; }
    const tc = line.match(/^T\s+(-?\d+(?:[.,]\d+)?)\s*°?\s*C\b/);
    if (tc) { rep.temperatureC = num(tc[1]); rep.recognizedLines++; continue; }
    const fi = line.match(/^(?:FO2\s*\(I\)|FiO2)\s+(\d+(?:[.,]\d+)?)\s*%/i);
    if (fi) { const f = num(fi[1]) / 100; rep.fio2 = f; rep.recognizedLines++; continue; }

    // Analyzer notes: "<analyte> <code>: <message>"
    const nm = line.match(/^([?*]?\s*[A-Za-z][A-Za-z0-9+\-]*(?:\([^)]*\))?)\s+(\d{4}):?\s+(.+)$/);
    if (nm && (section === "notes" || /calibra|error|flag|advert|warning/i.test(nm[3]))) {
      const analyte = analyteOfToken(nm[1]);
      rep.flags.push({ analyte, code: `ABL-${nm[2]}`, message: `${nm[2]}: ${nm[3]}` });
      rep.recognizedLines++; continue;
    }
    if (section === "notes") {
      if (/calibra|error|warning|advert/i.test(line)) rep.flags.push({ code: "ABL-NOTE", message: line });
      continue;
    }
    if (section === "temp" || section === "oxystate") continue;

    const mk = line.match(/^([↑↓?*]\s*)+/);
    const markers = mk ? mk[0] : "";
    const body = line.slice(markers.length).trim();
    const label = LABELS.find((l) => l.re.test(body));
    if (!label) continue;
    // Ionized Ca in the "calculated" block is the pH-7.4-normalized value, not the measurement.
    if (label.key === "iCa" && section === "calc") continue;
    if (rep.fields[label.key]) continue; // keep first occurrence only
    const rest = body.replace(label.re, "");
    const nmatch = rest.match(NUM);
    if (!nmatch) continue;
    const after = rest.slice((nmatch.index ?? 0) + nmatch[0].length).trim();
    const unit = after.match(UNIT_RE)?.[1];
    const base = num(nmatch[1]);
    const conv = convert(label.key, base, unit);
    rep.fields[label.key] = {
      raw: nmatch[1] + (unit ? ` ${unit}` : ""), value: conv.v, unit, converted: conv.converted,
      calculated: !!label.calc || CALC_ANALYTES.has(label.key),
      questionable: markers.includes("?"),
      refFlag: markers.includes("↑") ? "high" : markers.includes("↓") ? "low" : undefined,
      note: conv.note,
    };
    rep.recognizedLines++;
  }
  // "?" markers without an accompanying note still become flags
  for (const [k, f] of Object.entries(rep.fields) as [AnalyteKey, Extracted][]) {
    if (f.questionable && !rep.flags.some((x) => x.analyte === k)) rep.flags.push({ analyte: k, code: "ABL-?", message: "Analyzer marked this result as questionable (?)" });
  }
  return rep;
}

// ───────────────────────── Draft, validation, conversion ─────────────────────────

export interface DraftField {
  text: string;
  source: "extracted" | "manual" | "unavailable";
  calculated: boolean;
  questionable: boolean;
  unit: string;
  note?: string;
  checked: boolean; // operator confirmed against the source document
}
export interface Draft {
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  subject: string;     // pseudonymous label
  reportPatientId?: string; // display only
  sampleType: SampleType;
  temperature: string;
  fio2: string;        // percent
  fields: Record<AnalyteKey, DraftField>;
  flags: ReportFlag[];
  analyzer: string;
  source: UploadedLab["source"];
  dateAmbiguous: boolean;
}

export const emptyField = (k: AnalyteKey): DraftField => ({ text: "", source: "unavailable", calculated: CALC_ANALYTES.has(k), questionable: false, unit: analyteMeta(k).unit, checked: false });

export function emptyDraft(source: Draft["source"], subject = "Subject 1"): Draft {
  return {
    date: "", time: "", subject, sampleType: "unknown", temperature: "", fio2: "", analyzer: "Radiometer ABL90-class", source, dateAmbiguous: false,
    fields: Object.fromEntries(ANALYTE_KEYS.map((k) => [k, emptyField(k)])) as Record<AnalyteKey, DraftField>, flags: [],
  };
}

/** Turn extraction output into an editable draft. Nothing is pre-verified. */
export function draftFromExtraction(rep: ExtractedReport, subject = "Subject 1"): Draft {
  const d = emptyDraft("pdf-text", subject);
  d.date = rep.date?.iso ?? ""; d.dateAmbiguous = !!rep.date?.ambiguous;
  d.time = rep.time?.hhmm ?? "";
  d.reportPatientId = rep.patientId;
  d.sampleType = rep.sampleType ?? "unknown";
  d.temperature = rep.temperatureC !== undefined ? String(rep.temperatureC) : "";
  d.fio2 = rep.fio2 !== undefined ? String(Math.round(rep.fio2 * 1000) / 10) : "";
  if (rep.analyzer) d.analyzer = `Radiometer ${rep.analyzer}`;
  for (const k of ANALYTE_KEYS) {
    const f = rep.fields[k];
    if (f?.value !== undefined) d.fields[k] = { text: String(f.value), source: "extracted", calculated: f.calculated, questionable: f.questionable, unit: analyteMeta(k).unit, note: f.note, checked: false };
  }
  d.flags = rep.flags;
  return d;
}

export interface Issue { level: "error" | "warning"; field?: string; message: string }

const hco3Expected = (ph: number, pco2: number) => 0.0307 * pco2 * Math.pow(10, ph - 6.1);

export function validateDraft(d: Draft, now = Date.now()): Issue[] {
  const out: Issue[] = [];
  const err = (message: string, field?: string) => out.push({ level: "error", field, message });
  const warn = (message: string, field?: string) => out.push({ level: "warning", field, message });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date + "T00:00:00Z"))) err("Sample date is missing or invalid.", "date");
  if (!/^\d{2}:\d{2}$/.test(d.time) || Number(d.time.slice(0, 2)) > 23 || Number(d.time.slice(3)) > 59) err("Sample time is missing or invalid (HH:MM, 24 h).", "time");
  if (!d.subject.trim()) err("Enter a pseudonymous subject label (not a real name).", "subject");
  if (d.dateAmbiguous) warn("Day and month could not be distinguished on the report; confirm the date.", "date");
  const ts = Date.parse(`${d.date}T${d.time || "00:00"}:00Z`);
  if (!Number.isNaN(ts) && ts > now + 36 * 3600e3) err("Sample time is in the future.", "date");
  if (d.sampleType === "unknown") warn("Sample type unknown: gas values will be stored but not interpreted.", "sampleType");

  if (d.temperature.trim()) { const t = Number(d.temperature.replace(",", ".")); if (Number.isNaN(t) || t < 20 || t > 42) err("Patient temperature must be 20–42 °C.", "temperature"); }
  if (d.fio2.trim()) {
    const f = Number(d.fio2.replace(",", "."));
    if (Number.isNaN(f) || f < 21 || f > 100) err("FiO₂ must be 21–100 %.", "fio2");
    else if (d.sampleType !== "arterial") warn("FiO₂ is stored but PaO₂/FiO₂ is only computed for arterial samples.", "fio2");
  }

  const vals: Partial<Record<AnalyteKey, number>> = {};
  let n = 0;
  for (const k of ANALYTE_KEYS) {
    const f = d.fields[k];
    if (f.source === "unavailable" || f.text.trim() === "") continue;
    const v = Number(f.text.replace(",", "."));
    const [lo, hi] = plausibleOf(k);
    if (!Number.isFinite(v)) { err(`${analyteMeta(k).label}: "${f.text}" is not a number.`, k); continue; }
    if (v < lo || v > hi) { err(`${analyteMeta(k).label}: ${v} is outside the plausible range ${lo}–${hi} ${analyteMeta(k).unit} (check units / misread digit).`, k); continue; }
    if (!f.checked) err(`${analyteMeta(k).label}: confirm this value against the source document.`, k);
    if (f.questionable) warn(`${analyteMeta(k).label}: analyzer marked this result as questionable.`, k);
    vals[k] = v; n++;
  }
  if (n === 0) err("No measurements entered. Missing analytes stay unavailable, but at least one value is required.");

  const { pH, pCO2, HCO3, tHb, Hct, FO2Hb, COHb, MetHb, FHHb } = vals;
  if (pH !== undefined && pCO2 !== undefined && HCO3 !== undefined) {
    const e = hco3Expected(pH, pCO2);
    if (Math.abs(e - HCO3) > 2.5) warn(`HCO₃⁻ ${HCO3} differs from the Henderson–Hasselbalch value (${e.toFixed(1)}) for this pH/pCO₂; check for a transcription error.`, "HCO3");
  }
  if (tHb !== undefined && Hct !== undefined && Math.abs(Hct - 3 * tHb) > 0.15 * 3 * tHb) warn("Hct and tHb are not mutually consistent (Hct ≈ 3 × tHb); check for a transcription error.", "Hct");
  if ([FO2Hb, COHb, MetHb, FHHb].every((x) => x !== undefined)) {
    const s = FO2Hb! + COHb! + MetHb! + FHHb!;
    if (Math.abs(s - 100) > 1.5) warn(`Hemoglobin fractions sum to ${s.toFixed(1)} % (expected ≈100 %).`, "FO2Hb");
  }
  for (const f of d.flags) warn(`Analyzer warning preserved${f.analyte ? ` for ${analyteMeta(f.analyte).label}` : ""}: ${f.message}`, f.analyte);
  return out;
}

export function toUploadedLab(d: Draft, now = new Date()): UploadedLab {
  const values: Partial<Record<MetricKey, number>> = {};
  const extra: Record<string, number> = {};
  const calculated: MetricKey[] = [];
  for (const k of ANALYTE_KEYS) {
    const f = d.fields[k];
    if (f.source === "unavailable" || f.text.trim() === "") continue;
    const v = Number(f.text.replace(",", "."));
    if (k in EXTRA_META) extra[k] = v; else { values[k as MetricKey] = v; if (f.calculated) calculated.push(k as MetricKey); }
  }
  const measured = (Object.keys(values) as MetricKey[]);
  const qcFlags: QcFlag[] = d.flags.map((f) => ({ code: f.code, message: f.message, analytes: f.analyte && !(f.analyte in EXTRA_META) ? [f.analyte as MetricKey] : measured }));
  for (const k of ANALYTE_KEYS) if (d.fields[k].questionable && !d.flags.some((f) => f.analyte === k) && !(k in EXTRA_META))
    qcFlags.push({ code: "ABL-?", message: "Analyzer marked this result as questionable (?)", analytes: [k as MetricKey] });
  const t = d.temperature.trim() ? Number(d.temperature.replace(",", ".")) : undefined;
  const fio2 = d.fio2.trim() ? Number(d.fio2.replace(",", ".")) / 100 : undefined;
  return {
    id: `UPL-${now.getTime()}-${Math.floor(Math.random() * 1e4)}`,
    subjectLabel: d.subject.trim(), collectedAt: `${d.date}T${d.time}:00Z`, sampleType: d.sampleType, analyzer: d.analyzer,
    verification: "verified", qcFlags, ...(t !== undefined ? { temperatureC: t } : {}), ...(fio2 !== undefined ? { fio2 } : {}),
    values, calculated, extra, source: d.source, savedAt: now.toISOString(),
  };
}
