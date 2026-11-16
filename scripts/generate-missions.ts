// Deterministic SYNTHETIC datasets for NOX-02/03/04 (all values simulated; no real crew exist). Run: npm run generate:missions
// Same generative model as scripts/generate-data.ts (NOX-01), parameterised per mission so crew health can be trended over mission time.
import { writeFileSync } from "node:fs";
import type { ExerciseEvent, ExerciseType, HourlyEnvSample, Astronaut, EnvironmentalSample, LabResult, VitalSign, SampleType, QcFlag, Verification, MetricKey } from "../lib/types.ts";

const METRICS: MetricKey[] = ["pH", "pCO2", "pO2", "sO2", "tHb", "Hct", "COHb", "MetHb", "FO2Hb", "Na", "K", "iCa", "Cl", "Glu", "Lac", "HCO3", "BE"];
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: string) { const r = mulberry32(hash(seed)); return { u: r, n: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) }; }
const round = (v: number, d: number) => Number(v.toFixed(d));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface Crew { a: Astronaut; co2k: number; hctDrop: number; gluDrift: number; kDrift: number; lacDrift: number; stressOnset: number; stressSpan: number; po2Loss: number; base: { hr: number; hrv: number; sbp: number; dbp: number; sleep: number }; sensitivity: number }
interface Cfg {
  id: string; name: string; startDate: string; currentDay: number; totalDays: number; seedCo2: number; co2Amp: number; scrubberStart: number; scrubberRise: number;
  radBase: number; radAmp: number; spe: Record<number, number>; tempBase: number; pressureKpa: number; humBase: number; noiseDb: number; labGaps: number[]; crew: Crew[];
}
const A = (id: string, role: string, age: number, sex: "F" | "M", h: number, m: number, note: string): Astronaut => ({ id, role, age, sex, heightCm: h, massKg: m, note });

const CFGS: Cfg[] = [
  { id: "NOX-02", name: "Lunar Gateway Sortie", startDate: "2031-11-05", currentDay: 5, totalDays: 21, seedCo2: 3.0, co2Amp: 0.2, scrubberStart: 999, scrubberRise: 0, radBase: 38, radAmp: 2, spe: {}, tempBase: 22.0, pressureKpa: 101.3, humBase: 44, noiseDb: 58, labGaps: [1, 1, 2],
    crew: [
      { a: A("L-01", "Commander", 48, "M", 180, 82, "Early-adaptation fluid shift; otherwise stable."), co2k: 0.9, hctDrop: 1, gluDrift: 0, kDrift: 0, lacDrift: 0, stressOnset: 999, stressSpan: 1, po2Loss: 0, base: { hr: 60, hrv: 58, sbp: 119, dbp: 77, sleep: 7.0 }, sensitivity: 0.3 },
      { a: A("L-02", "Pilot", 41, "F", 167, 61, "Mild CO₂ sensitivity in a compact cabin."), co2k: 2.4, hctDrop: 1.5, gluDrift: 0, kDrift: 0, lacDrift: 0.05, stressOnset: 999, stressSpan: 1, po2Loss: 0, base: { hr: 63, hrv: 56, sbp: 113, dbp: 72, sleep: 6.9 }, sensitivity: 0.8 },
      { a: A("L-03", "Mission specialist", 37, "F", 170, 64, "Stable physiology."), co2k: 1.0, hctDrop: 1, gluDrift: 0, kDrift: 0, lacDrift: 0, stressOnset: 999, stressSpan: 1, po2Loss: 0, base: { hr: 61, hrv: 60, sbp: 114, dbp: 73, sleep: 7.2 }, sensitivity: 0.3 },
    ] },
  { id: "NOX-03", name: "Earth Orbit Station Rotation", startDate: "2031-09-13", currentDay: 58, totalDays: 180, seedCo2: 3.4, co2Amp: 0.25, scrubberStart: 30, scrubberRise: 1.6, radBase: 15, radAmp: 3, spe: { 41: 30, 42: 18 }, tempBase: 22.3, pressureKpa: 101.3, humBase: 46, noiseDb: 62, labGaps: [2, 3, 3, 4, 5],
    crew: [
      { a: A("E-01", "Station commander", 50, "M", 181, 85, "Gradual sleep shortening across the rotation."), co2k: 1.4, hctDrop: 2, gluDrift: 4, kDrift: 0.1, lacDrift: 0.1, stressOnset: 25, stressSpan: 120, po2Loss: 0, base: { hr: 59, hrv: 60, sbp: 120, dbp: 78, sleep: 7.1 }, sensitivity: 0.5 },
      { a: A("E-02", "Flight engineer", 36, "F", 169, 62, "Progressive hematocrit decline (spaceflight anemia pattern); rising CO₂ response."), co2k: 2.2, hctDrop: 5, gluDrift: 7, kDrift: 0.15, lacDrift: 0.1, stressOnset: 20, stressSpan: 100, po2Loss: 2, base: { hr: 63, hrv: 57, sbp: 112, dbp: 72, sleep: 6.9 }, sensitivity: 0.9 },
    ] },
  { id: "NOX-04", name: "Mars Orbit Relay", startDate: "2031-04-13", currentDay: 211, totalDays: 540, seedCo2: 2.9, co2Amp: 0.25, scrubberStart: 150, scrubberRise: 2.0, radBase: 24, radAmp: 1.5, spe: { 141: 50, 142: 120, 143: 60 }, tempBase: 22.4, pressureKpa: 101.3, humBase: 45, noiseDb: 57, labGaps: [2, 3, 3, 4, 5, 6],
    crew: [
      { a: A("R-01", "Commander", 45, "F", 171, 66, "Stable physiology with mild hematocrit decline over the long stay."), co2k: 1.0, hctDrop: 3, gluDrift: 2, kDrift: 0.05, lacDrift: 0, stressOnset: 999, stressSpan: 1, po2Loss: 0, base: { hr: 60, hrv: 59, sbp: 116, dbp: 74, sleep: 7.1 }, sensitivity: 0.3 },
      { a: A("R-02", "Flight engineer", 40, "M", 178, 80, "Isolation-related sleep loss with metabolic stress drift and progressive anemia."), co2k: 1.8, hctDrop: 7, gluDrift: 15, kDrift: 0.55, lacDrift: 0.45, stressOnset: 110, stressSpan: 100, po2Loss: 3, base: { hr: 62, hrv: 60, sbp: 121, dbp: 79, sleep: 7.2 }, sensitivity: 0.6 },
    ] },
];

const EX_TYPES: { type: ExerciseType; dur: [number, number]; hrAdd: number }[] = [
  { type: "Treadmill (running)", dur: [30, 45], hrAdd: 85 }, { type: "Resistive (ARED)", dur: [45, 60], hrAdd: 60 }, { type: "Cycle ergometer", dur: [30, 45], hrAdd: 70 },
];

for (const c of CFGS) {
  const CUR = c.currentDay, START = Date.parse(c.startDate + "T00:00:00Z"), er = rng("env-" + c.id);
  const env: EnvironmentalSample[] = [];
  for (let d = 1; d <= CUR; d++) {
    const drift = d >= c.scrubberStart ? clamp((d - c.scrubberStart) / Math.max(1, CUR - c.scrubberStart), 0, 1) * c.scrubberRise : 0;
    env.push({
      missionDay: d, co2Mmhg: round(clamp(c.seedCo2 + c.co2Amp * Math.sin(d / 3) + 0.15 * er.n() + drift, 1.5, 9), 2), o2Pct: round(20.9 + 0.12 * er.n(), 2),
      pressureKpa: round(c.pressureKpa + 0.12 * er.n(), 2), tempC: round(c.tempBase + 0.4 * Math.sin(d / 5) + 0.15 * er.n(), 1), humidityPct: round(c.humBase + 3 * Math.sin(d / 7) + er.n(), 1),
      radiationUSvH: round(c.radBase + c.radAmp * Math.abs(Math.sin(d / 2.3)) + 1.2 * er.n() + (c.spe[d] ?? 0), 1), noiseDb: round(c.noiseDb + 1.5 * er.n(), 1),
    });
  }
  const co2Smooth = (d: number) => { const a = env.slice(Math.max(0, d - 3), d); return a.reduce((s, x) => s + x.co2Mmhg, 0) / a.length; };
  const labs: LabResult[] = [], vitals: VitalSign[] = [], exercise: ExerciseEvent[] = [];
  for (const p of c.crew) {
    const a = p.a, male = a.sex === "M", r = rng("lab-" + c.id + a.id), r1 = rng("vit-" + c.id + a.id), r2 = rng("act-" + c.id + a.id);
    let days = [1]; for (let d = 1; ;) { d += c.labGaps[Math.floor(r.u() * c.labGaps.length)]; if (d >= CUR) break; days.push(d); } if (CUR > 1) days.push(CUR);
    const bp = (d: number) => clamp((d - p.stressOnset) / p.stressSpan, 0, 1);
    days.forEach((d, i) => {
      const last = i === days.length - 1, f = d / CUR, stress = bp(d), hour = 7 + Math.floor(r.u() * 4), minute = Math.floor(r.u() * 60);
      const collectedAt = new Date(START + (d - 1) * 86400000 + (hour * 60 + minute) * 60000).toISOString().replace(".000Z", "Z");
      const sampleType: SampleType = last ? "capillary" : i % 9 === 4 ? "venous" : i % 13 === 7 ? "arterial" : "capillary";
      let pCO2 = 40 + p.co2k * (co2Smooth(d) - c.seedCo2) + 1.3 * r.n(), hco3 = 24.5 + 0.12 * (pCO2 - 40) + 0.2 * r.n() - 0.4 * stress, pO2 = 92 + 4 * r.n() - p.po2Loss * stress;
      if (sampleType === "venous") { pCO2 += 5 + 0.8 * r.n(); hco3 += 1; pO2 = 38 + 4 * r.n(); }
      const pH = 6.1 + Math.log10(hco3 / (0.0307 * pCO2)), be = 0.93 * (hco3 - 24.4 + 14.8 * (pH - 7.4)), coHb = clamp(0.8 + 0.15 * r.n(), 0.3, 1.5), metHb = clamp(0.6 + 0.15 * r.n(), 0.2, 1.2);
      const sat = 100 / (23400 / (pO2 ** 3 + 150 * pO2) + 1), sO2 = Math.min(99.5, sat + 0.3 * r.n()), fo2hb = sO2 * (1 - (coHb + metHb) / 100);
      // hematocrit: early fluid-shift bump (days 1-4), then slow decline over the mission
      const hct = (male ? 45 : 41) + (d <= 6 ? 1.2 * Math.exp(-d / 3) : 0) - p.hctDrop * (1 - Math.exp(-d / 70)) + 0.7 * r.n(), tHb = round(hct / 3.0 + 0.12 * r.n(), 1);
      let K = 4.1 + p.kDrift * f ** 2 + 0.12 * r.n(), lactate = 1.0 + p.lacDrift * f ** 2 + 0.15 * r.n(); if (sampleType === "venous") lactate += 0.1;
      const qc: QcFlag[] = []; let ver: Verification = "verified";
      if (!last && i === 6 && p.stressOnset < 900) { K += 0.9; qc.push({ code: "HEMOLYSIS", analytes: ["K"], message: "Hemolysis index high; K⁺ may be spuriously elevated" }); }
      if (last && p.stressOnset < 900 && c.id === "NOX-04") ver = "pending";
      labs.push({ id: `L-${a.id}-D${d}`, astronautId: a.id, missionDay: d, collectedAt, sampleType, analyzer: "ABL90 FLEX PLUS", origin: "simulated", verification: ver, qcFlags: qc, ...(sampleType === "arterial" ? { fio2: 0.209 } : {}),
        values: { pH: round(pH, 3), pCO2: round(pCO2, 1), HCO3: round(hco3, 1), BE: round(be, 1), pO2: round(pO2, 1), sO2: round(sO2, 1), FO2Hb: round(fo2hb, 1), COHb: round(coHb, 1), MetHb: round(metHb, 1), tHb, Hct: round(tHb * 3, 1),
          Na: round(140 + 1.1 * r.n(), 1), K: round(K, 2), iCa: round(1.22 + 0.015 * r.n() - 0.02 * f, 2), Cl: round(103 + 1.1 * r.n(), 1), Glu: round(88 + p.gluDrift * f ** 2 + 3.5 * r.n(), 0), Lac: round(lactate, 2) } });
    });
    for (let d = 1; d <= CUR; d++) {
      if (r1.u() < 0.025) continue;
      const exc = Math.max(0, env[d - 1].co2Mmhg - c.seedCo2), stress = bp(d), resting = round(p.base.hr + 0.8 * r1.n() + 1.2 * p.sensitivity * exc + 8 * stress, 0), events: ExerciseEvent[] = [];
      const nEv = (r2.u() < 0.9 - 0.35 * stress ? 1 : 0) + (r2.u() < 0.25 - 0.15 * stress ? 1 : 0);
      for (let k = 0; k < nEv; k++) {
        const t = EX_TYPES[Math.floor(r2.u() * 3)], dur = Math.round(t.dur[0] + r2.u() * (t.dur[1] - t.dur[0])), hour = k === 0 ? 10 + Math.floor(r2.u() * 4) : 16 + Math.floor(r2.u() * 3), minute = Math.floor(r2.u() * 60), avg = Math.round(resting + t.hrAdd + 4 * r2.n());
        events.push({ id: `X-${a.id}-D${d}-${k + 1}`, astronautId: a.id, missionDay: d, type: t.type, durationMin: dur, avgHr: avg, peakHr: Math.round(avg + 12 + 8 * r2.u()), startedAt: new Date(START + (d - 1) * 86400000 + (hour * 60 + minute) * 60000).toISOString().replace(".000Z", "Z"), origin: "simulated" });
      }
      exercise.push(...events); const exMin = events.reduce((s, e) => s + e.durationMin, 0);
      vitals.push({ astronautId: a.id, missionDay: d, origin: "simulated", restingHr: resting, hrvMs: round(p.base.hrv + 3 * r1.n() - 1.5 * p.sensitivity * exc - 14 * stress, 0), spo2: round(clamp(97.6 + 0.4 * r1.n() - 0.25 * p.sensitivity * exc, 90, 100), 1),
        systolic: round(p.base.sbp + 2.5 * r1.n() + 6 * stress, 0), diastolic: round(p.base.dbp + 2 * r1.n() + 3 * stress, 0), skinTempC: round(33.5 + 0.25 * r1.n(), 1), respRate: round(14 + 0.6 * r1.n() + 0.9 * p.sensitivity * exc, 0),
        sleepHours: round(clamp(p.base.sleep + 0.35 * r1.n() - 1.4 * stress, 3.5, 9), 1), meanHr: round(resting + 12 + (exMin / 60) * 10 + 1.5 * r2.n(), 0), maxHr: events.length ? Math.max(...events.map((e) => e.peakHr)) : round(resting + 38 + 4 * r2.n(), 0),
        activeMin: Math.round(exMin + 75 + 12 * r2.n() - 20 * stress), exerciseMin: exMin });
    }
  }
  const hr = rng("hourly-" + c.id), hourly: HourlyEnvSample[] = [];
  for (let d = 1; d <= CUR; d++) {
    const e = env[d - 1], excess = Math.max(0, e.radiationUSvH - (c.radBase + c.radAmp + 3)), prof = (h: number) => Math.exp(-(((h - 14) / 5) ** 2)), profSum = Array.from({ length: 24 }, (_, h) => prof(h)).reduce((x, y) => x + y, 0);
    for (let h = 0; h < 24; h++) { const u = hr.n(), diur = Math.sin(((h - 6) / 24) * 2 * Math.PI);
      hourly.push({ hour: (d - 1) * 24 + h, co2Mmhg: round(clamp(e.co2Mmhg + 0.16 * diur + 0.07 * u, 1.2, 9), 2), o2Pct: round(e.o2Pct + 0.04 * u, 2), pressureKpa: round(e.pressureKpa + 0.05 * u, 2), tempC: round(e.tempC + 0.3 * diur + 0.08 * u, 1),
        humidityPct: round(e.humidityPct - 1.5 * diur + 0.5 * u, 1), radiationUSvH: round(Math.max(4, e.radiationUSvH - excess + (excess * 24 * prof(h)) / profSum + 0.5 * u), 1) }); }
  }
  const mission = { id: c.id, name: c.name, totalDays: c.totalDays, currentDay: CUR, startDate: c.startDate, dataNotice: "" };
  writeFileSync(new URL(`../data/missions/${c.id}.json`, import.meta.url), JSON.stringify({ mission, astronauts: c.crew.map((x) => x.a), labs, vitals, exercise, environment: env, hourly }));
  console.log(c.id, `labs=${labs.length} vitals=${vitals.length} env=${env.length} hourly=${hourly.length} exercise=${exercise.length}`);
}
