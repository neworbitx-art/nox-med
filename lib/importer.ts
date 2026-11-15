import type { AstronautId, LabResult, MetricKey, QcFlag, SampleType, Verification } from "./types";
import { ASTRONAUT_IDS, mission } from "./data";
import { METRIC_KEYS } from "./metrics";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, string> = {
  astronautid: "astronaut", astronaut: "astronaut", patientid: "astronaut", subject: "astronaut", id: "astronaut",
  missionday: "day", day: "day", sampleid: "sample", sample: "sample", sampletype: "type", type: "type",
  ph: "pH", pco2: "pCO2", po2: "pO2", so2: "sO2", o2sat: "sO2", thb: "tHb", cthb: "tHb", hb: "tHb", hct: "Hct", hematocrit: "Hct",
  cohb: "COHb", fcohb: "COHb", na: "Na", k: "K", ica: "iCa", ca2: "iCa", cca2: "iCa", cl: "Cl",
  fo2hb: "FO2Hb", o2hb: "FO2Hb", methb: "MetHb", fmethb: "MetHb", collectedat: "collected", timestamp: "collected", datetime: "collected",
  verification: "verification", verificationstatus: "verification", qcflags: "qc", flags: "qc", fio2: "fio2",
  glu: "Glu", cglu: "Glu", glucose: "Glu", lac: "Lac", clac: "Lac", lactate: "Lac", hco3: "HCO3", chco3: "HCO3", be: "BE", beecf: "BE",
};

// Physically plausible limits used to reject unit/format errors (not clinical ranges).
export const PLAUSIBLE: Record<MetricKey, [number, number]> = {
  pH: [6.5, 7.9], pCO2: [5, 150], pO2: [10, 700], sO2: [30, 100], tHb: [3, 25], Hct: [10, 70], COHb: [0, 60],
  FO2Hb: [20, 100], MetHb: [0, 40], Na: [100, 180], K: [1.5, 9], iCa: [0.5, 2], Cl: [70, 130], Glu: [20, 600], Lac: [0, 25], HCO3: [3, 50], BE: [-30, 30],
};

export interface ParsedRow {
  line: number;
  ok: boolean;
  errors: string[];
  result?: LabResult;
}
export interface ParseOutput { rows: ParsedRow[]; recognized: string[]; ignored: string[]; fatal?: string }

const ALL: MetricKey[] = ["pH", "pCO2", "pO2", "sO2", "FO2Hb", "tHb", "Hct", "COHb", "MetHb", "Na", "K", "iCa", "Cl", "Glu", "Lac", "HCO3", "BE"];
const QC_CODES: Record<string, { analytes: MetricKey[]; message: string }> = {
  HEMOLYSIS: { analytes: ["K"], message: "Hemolysis suspected; K⁺ may be spuriously elevated" },
  AIR_BUBBLE: { analytes: ["pO2", "sO2", "FO2Hb", "pCO2", "pH", "HCO3", "BE"], message: "Air bubble in sample; gas values unreliable" },
  CLOT: { analytes: ALL, message: "Clot suspected" },
  INSUFFICIENT: { analytes: ALL, message: "Insufficient sample volume" },
  DELAYED: { analytes: ["Lac", "Glu", "pO2", "pH", "pCO2", "HCO3", "BE"], message: "Delayed analysis; metabolic and gas values may drift" },
};

export const SAMPLE_CSV = [
  "sample_id,astronaut_id,collected_at,sample_type,verification,qc_flags,pH,pCO2,pO2,sO2,FO2Hb,tHb,COHb,MetHb,Na,K,iCa,Cl,Glu,Lac,HCO3,BE",
  "ABL-0001,A-01,2031-11-09T08:15:00Z,capillary,verified,,7.391,40.8,93.0,97.1,95.9,14.6,0.8,0.6,140.2,4.05,1.21,103.1,88,0.95,24.6,0.3",
  "ABL-0002,A-03,2031-11-09T09:40:00Z,capillary,verified,,7.331,49.6,88.5,96.2,95.0,13.1,0.9,0.7,139.6,4.20,1.20,103.4,93,1.12,25.9,0.1",
  "ABL-0003,A-04,2031-11-09T10:05:00Z,venous,pending,HEMOLYSIS,7.352,45.1,36.0,68.0,66.5,14.9,0.7,0.6,140.5,5.90,1.22,102.7,104,1.78,24.4,-0.3",
  "ABL-0004,A-02,2031-11-08T07:50:00Z,,pending,,7.375,43.0,90.0,97.0,95.8,11.8,0.8,0.6,139.9,4.10,1.19,103.0,90,1.20,24.9,0.0",
].join("\n");

function splitLine(line: string, delim: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseLabCsv(text: string, currentDay: number): ParseOutput {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], recognized: [], ignored: [], fatal: "Need a header row and at least one data row." };
  const delim = [",", ";", "\t"].map((d) => [d, lines[0].split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const headers = splitLine(lines[0], delim);
  const map = headers.map((h) => ALIASES[norm(h)]);
  const recognized = headers.filter((_, i) => map[i]);
  const ignored = headers.filter((_, i) => !map[i]);
  if (!map.includes("astronaut")) return { rows: [], recognized, ignored, fatal: "No astronaut column found (expected astronaut_id)." };
  if (!map.some((m) => m && (METRIC_KEYS as string[]).includes(m))) return { rows: [], recognized, ignored, fatal: "No recognized blood-gas columns (e.g. pH, pCO2, pO2, Lac)." };

  const stamp = Date.now();
  const START = Date.parse(mission.startDate + "T00:00:00Z");
  const rows: ParsedRow[] = lines.slice(1).map((ln, idx) => {
    const cells = splitLine(ln, delim);
    const errors: string[] = [];
    let astro = "", day: number | undefined, collected: number | undefined, sample = "", stype: SampleType = "unknown", ver: Verification = "pending", fio2: number | undefined;
    let qcRaw = "";
    const values: Partial<Record<MetricKey, number>> = {};
    map.forEach((m, i) => {
      const raw = (cells[i] ?? "").trim();
      if (!m || raw === "") return;
      if (m === "astronaut") astro = raw.toUpperCase();
      else if (m === "day") { const n = Number(raw); if (!Number.isInteger(n) || n < 1 || n > currentDay) errors.push(`mission_day must be an integer 1–${currentDay}`); else day = n; }
      else if (m === "collected") { const t = Date.parse(raw.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? "" : "Z")); if (Number.isNaN(t)) errors.push(`collected_at "${raw}" is not a valid date/time`); else collected = t; }
      else if (m === "sample") sample = raw;
      else if (m === "type") { const t = raw.toLowerCase(); if (t === "capillary" || t === "arterial" || t === "venous" || t === "unknown") stype = t; else errors.push(`unknown sample_type "${raw}"`); }
      else if (m === "verification") { const t = raw.toLowerCase(); if (t === "verified" || t === "pending" || t === "rejected") ver = t; else errors.push(`unknown verification "${raw}"`); }
      else if (m === "qc") qcRaw = raw;
      else if (m === "fio2") { let n = Number(raw.replace(",", ".")); if (n > 1) n /= 100; if (Number.isNaN(n) || n < 0.1 || n > 1) errors.push(`fio2 "${raw}" invalid`); else fio2 = n; }
      else {
        const k = m as MetricKey; const n = Number(raw.replace(",", "."));
        if (Number.isNaN(n)) errors.push(`${k}: "${raw}" is not numeric`);
        else if (n < PLAUSIBLE[k][0] || n > PLAUSIBLE[k][1]) errors.push(`${k}: ${n} outside plausible range ${PLAUSIBLE[k][0]}–${PLAUSIBLE[k][1]} (check units)`);
        else values[k] = n;
      }
    });
    if (collected !== undefined) {
      const d = Math.floor((collected - START) / 86400000) + 1;
      if (d < 1 || d > currentDay) errors.push(`collected_at falls on mission day ${d}, outside 1–${currentDay}`);
      else if (day !== undefined && day !== d) errors.push(`mission_day ${day} does not match collected_at (day ${d})`);
      else day = d;
    }
    if (day === undefined) { day = currentDay; collected ??= START + (currentDay - 1) * 86400000 + 12 * 3600000; }
    collected ??= START + (day - 1) * 86400000 + 12 * 3600000;
    const qcFlags: QcFlag[] = qcRaw ? qcRaw.split(/[|;]/).map((c) => c.trim().toUpperCase()).filter(Boolean).map((code) => ({ code, ...(QC_CODES[code] ?? { analytes: ALL, message: "Operator-supplied QC flag" }) })) : [];
    if (!(ASTRONAUT_IDS as string[]).includes(astro)) errors.push(`astronaut "${astro || "(blank)"}" not in crew A-01…A-04`);
    if (Object.keys(values).length === 0) errors.push("no valid measurements");
    const ok = errors.length === 0;
    return {
      line: idx + 2, ok, errors,
      result: ok ? { id: `IMP-${stamp}-${idx + 1}${sample ? `-${sample}` : ""}`, astronautId: astro as AstronautId, missionDay: day, collectedAt: new Date(collected).toISOString().replace(".000Z", "Z"), sampleType: stype,
        analyzer: "Imported CSV (ABL90-style export)", origin: "imported", verification: ver, qcFlags, ...(fio2 !== undefined ? { fio2 } : {}), values } : undefined,
    };
  });
  return { rows, recognized, ignored };
}
