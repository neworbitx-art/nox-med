// Deterministic synthetic dataset generator for NOX MED (all data is SIMULATED).
// Run: npm run generate
import { writeFileSync } from "node:fs";
import type { ExerciseEvent, ExerciseType, HourlyEnvSample, Astronaut, EnvironmentalSample, LabResult, Mission, VitalSign, AstronautId, SampleType, QcFlag, Verification, MetricKey } from "../lib/types";

const METRIC_KEYS_ALL: MetricKey[] = ["pH", "pCO2", "pO2", "sO2", "tHb", "Hct", "COHb", "MetHb", "FO2Hb", "Na", "K", "iCa", "Cl", "Glu", "Lac", "HCO3", "BE"];

const CURRENT_DAY = 184;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: string) {
  const r = mulberry32(hash(seed));
  return { u: r, n: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const round = (v: number, d: number) => Number(v.toFixed(d));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const mission: Mission = {
  id: "NOX-01", name: "Mars Transit", totalDays: 900, currentDay: CURRENT_DAY, startDate: "2031-05-10",
  dataNotice: "",
};

const astronauts: Astronaut[] = [
  { id: "A-01", role: "Commander", age: 46, sex: "M", heightCm: 182, massKg: 84, note: "Stable physiology; reference crew member." },
  { id: "A-02", role: "Flight Engineer", age: 39, sex: "F", heightCm: 168, massKg: 63, note: "Progressive hematocrit decline (spaceflight anemia pattern)." },
  { id: "A-03", role: "Science Specialist", age: 42, sex: "F", heightCm: 171, massKg: 66, note: "High sensitivity to cabin CO₂ elevation." },
  { id: "A-04", role: "Medical Officer", age: 44, sex: "M", heightCm: 178, massKg: 79, note: "Sleep loss with metabolic stress drift." },
];

// ---- Environment (daily) ----
const er = rng("env");
const env: EnvironmentalSample[] = [];
for (let d = 1; d <= CURRENT_DAY; d++) {
  const scrubberDrift = d >= 140 ? ((d - 140) / 44) * 2.2 : 0; // CO2 scrubber degradation
  const spe = d === 121 ? 55 : d === 122 ? 140 : d === 123 ? 70 : 0; // solar particle event
  env.push({
    missionDay: d,
    co2Mmhg: round(clamp(2.7 + 0.25 * Math.sin(d / 3) + 0.15 * er.n() + scrubberDrift, 1.5, 9), 2),
    o2Pct: round(20.9 + 0.12 * er.n(), 2),
    pressureKpa: round(d === 97 ? 99.9 : 101.3 + 0.12 * er.n(), 2),
    tempC: round(22.5 + 0.4 * Math.sin(d / 5) + 0.15 * er.n(), 1),
    humidityPct: round(45 + 3 * Math.sin(d / 7) + 1 * er.n(), 1),
    radiationUSvH: round(21 + 1.2 * er.n() + spe, 1),
    noiseDb: round(56 + 1.5 * er.n(), 1),
  });
}
const co2Smooth = (d: number) => {
  const a = env.slice(Math.max(0, d - 3), d); // days d-2..d
  return a.reduce((s, x) => s + x.co2Mmhg, 0) / a.length;
};

// ---- Labs (irregular sampling, mixed sample types, QC flags) ----
interface Profile { co2k: number; hctDrop: number; gluDrift: number; kDrift: number; lacDrift: number; }
const profiles: Record<AstronautId, Profile> = {
  "A-01": { co2k: 0.8, hctDrop: 1, gluDrift: 0, kDrift: 0, lacDrift: 0 },
  "A-02": { co2k: 1.2, hctDrop: 6, gluDrift: 0, kDrift: 0, lacDrift: 0 },
  "A-03": { co2k: 3.2, hctDrop: 1.5, gluDrift: 0, kDrift: 0, lacDrift: 0.1 },
  "A-04": { co2k: 1.0, hctDrop: 1, gluDrift: 16, kDrift: 0.6, lacDrift: 0.5 },
};
const START = Date.parse(mission.startDate + "T00:00:00Z");

const labs: LabResult[] = [];
for (const a of astronauts) {
  const r = rng("lab-" + a.id);
  const p = profiles[a.id];
  const male = a.sex === "M";

  // Irregular schedule: gaps of 2–6 days, always ending on the current day; A-02 has a missed-sampling gap.
  let days = [1];
  for (let d = 1; ;) { d += [2, 3, 3, 4, 5, 6][Math.floor(r.u() * 6)]; if (d >= CURRENT_DAY - 1) break; days.push(d); }
  days.push(CURRENT_DAY);
  if (a.id === "A-02") days = days.filter((d) => d < 119 || d > 141);

  days.forEach((d, i) => {
    const last = i === days.length - 1;
    const f = d / CURRENT_DAY;
    const late = clamp((d - 120) / 64, 0, 1);
    const hour = 7 + Math.floor(r.u() * 4), minute = Math.floor(r.u() * 60);
    const collectedAt = new Date(START + (d - 1) * 86400000 + (hour * 60 + minute) * 60000).toISOString().replace(".000Z", "Z");
    const sampleType: SampleType = last ? "capillary" : i % 9 === 4 ? "venous" : i % 13 === 7 ? "arterial" : "capillary";

    let pCO2 = 40 + p.co2k * (co2Smooth(d) - 2.7) + 1.3 * r.n();
    let hco3 = 24.5 + 0.12 * (pCO2 - 40) + 0.2 * r.n() - (a.id === "A-04" ? 0.4 * late : 0);
    let pO2 = 92 + 4 * r.n() - (a.id === "A-03" ? 3 * late : 0);
    if (sampleType === "venous") { pCO2 += 5 + 0.8 * r.n(); hco3 += 1; pO2 = 38 + 4 * r.n(); }
    const pH = 6.1 + Math.log10(hco3 / (0.0307 * pCO2));
    const be = 0.93 * (hco3 - 24.4 + 14.8 * (pH - 7.4));
    const coHb = clamp(0.8 + 0.15 * r.n(), 0.3, 1.5);
    const metHb = clamp(0.6 + 0.15 * r.n(), 0.2, 1.2);
    const sat = 100 / (23400 / (pO2 ** 3 + 150 * pO2) + 1);
    const sO2 = Math.min(99.5, sat + 0.3 * r.n());
    const fo2hb = sO2 * (1 - (coHb + metHb) / 100);
    const hctLatent = (male ? 45 : 41) - p.hctDrop * (1 - Math.exp(-d / 70)) + 0.7 * r.n();
    const tHb = round(hctLatent / 3.0 + 0.12 * r.n(), 1);
    let K = 4.1 + p.kDrift * f ** 2 + 0.12 * r.n();
    let lactate = 1.0 + p.lacDrift * f ** 2 + 0.15 * r.n();
    if (sampleType === "venous") lactate += 0.1;

    const qcFlags: QcFlag[] = [];
    let verification: Verification = "verified";
    if (!last && a.id === "A-04" && i === 12) { K += 0.9; qcFlags.push({ code: "HEMOLYSIS", analytes: ["K"], message: "Hemolysis index high; K⁺ may be spuriously elevated" }); }
    if (!last && a.id === "A-01" && i === 20) { pO2 = 131; qcFlags.push({ code: "AIR_BUBBLE", analytes: ["pO2", "sO2", "FO2Hb"], message: "Air bubble detected in syringe; oxygen values unreliable" }); }
    if (!last && a.id === "A-02" && i === 28) { verification = "rejected"; qcFlags.push({ code: "CLOT", analytes: METRIC_KEYS_ALL, message: "Clot suspected; sample rejected by operator" }); }
    if (last && a.id === "A-04") verification = "pending";

    labs.push({
      id: `L-${a.id}-D${d}`, astronautId: a.id, missionDay: d, collectedAt, sampleType,
      analyzer: "ABL90 FLEX PLUS", origin: "simulated", verification, qcFlags,
      ...(sampleType === "arterial" ? { fio2: 0.209 } : {}),
      values: {
        pH: round(pH, 3), pCO2: round(pCO2, 1), HCO3: round(hco3, 1), BE: round(be, 1),
        pO2: round(pO2, 1), sO2: round(sO2, 1), FO2Hb: round(fo2hb, 1), COHb: round(coHb, 1), MetHb: round(metHb, 1),
        tHb, Hct: round(tHb * 3, 1),
        Na: round(140 + 1.1 * r.n(), 1), K: round(K, 2),
        iCa: round(1.22 + 0.015 * r.n() - 0.02 * f, 2), Cl: round(103 + 1.1 * r.n(), 1),
        Glu: round(88 + p.gluDrift * f ** 2 + 3.5 * r.n(), 0), Lac: round(lactate, 2),
      },
    });
  });
}

// ---- Vitals / wearables (daily, with simulated dropouts) ----
const base: Record<AstronautId, { hr: number; hrv: number; sbp: number; dbp: number; sleep: number }> = {
  "A-01": { hr: 58, hrv: 62, sbp: 118, dbp: 76, sleep: 7.0 },
  "A-02": { hr: 64, hrv: 55, sbp: 112, dbp: 72, sleep: 6.8 },
  "A-03": { hr: 60, hrv: 58, sbp: 115, dbp: 74, sleep: 7.1 },
  "A-04": { hr: 62, hrv: 60, sbp: 120, dbp: 78, sleep: 7.2 },
};
const vitals: VitalSign[] = [];
const exercise: ExerciseEvent[] = [];
const EX_TYPES: { type: ExerciseType; dur: [number, number]; hrAdd: number }[] = [
  { type: "Treadmill (running)", dur: [30, 45], hrAdd: 85 },
  { type: "Resistive (ARED)", dur: [45, 60], hrAdd: 60 },
  { type: "Cycle ergometer", dur: [30, 45], hrAdd: 70 },
];
for (const a of astronauts) {
  const r = rng("vit-" + a.id);
  const r2 = rng("act-" + a.id); // separate stream: adding activity fields leaves earlier vitals unchanged
  const b = base[a.id];
  for (let d = 1; d <= CURRENT_DAY; d++) {
    const dropout = r.u() < 0.025 || (a.id === "A-02" && d >= 150 && d <= 155);
    const exc = Math.max(0, env[d - 1].co2Mmhg - 2.7);
    const sensitivity = a.id === "A-03" ? 1 : 0.25;
    const stress = a.id === "A-04" ? clamp((d - 125) / 59, 0, 1) : 0;
    if (dropout) continue;
    const resting = round(b.hr + 0.8 * r.n() + 1.2 * sensitivity * exc + 8 * stress, 0);
    // Exercise: ~90 % of days have a session, ~25 % a second one; A-04 exercises less as stress rises
    const events: ExerciseEvent[] = [];
    const nEv = (r2.u() < 0.9 - 0.35 * stress ? 1 : 0) + (r2.u() < 0.25 - 0.15 * stress ? 1 : 0);
    for (let k = 0; k < nEv; k++) {
      const t = EX_TYPES[Math.floor(r2.u() * 3)];
      const dur = Math.round(t.dur[0] + r2.u() * (t.dur[1] - t.dur[0]));
      const hour = k === 0 ? 10 + Math.floor(r2.u() * 4) : 16 + Math.floor(r2.u() * 3);
      const minute = Math.floor(r2.u() * 60);
      const avg = Math.round(resting + t.hrAdd + 4 * r2.n());
      events.push({
        id: `X-${a.id}-D${d}-${k + 1}`, astronautId: a.id, missionDay: d, type: t.type, durationMin: dur, avgHr: avg, peakHr: Math.round(avg + 12 + 8 * r2.u()),
        startedAt: new Date(START + (d - 1) * 86400000 + (hour * 60 + minute) * 60000).toISOString().replace(".000Z", "Z"), origin: "simulated",
      });
    }
    exercise.push(...events);
    const exMin = events.reduce((s, e) => s + e.durationMin, 0);
    vitals.push({
      astronautId: a.id, missionDay: d, origin: "simulated",
      restingHr: resting,
      hrvMs: round(b.hrv + 3 * r.n() - 1.5 * sensitivity * exc - 14 * stress, 0),
      spo2: round(clamp(97.6 + 0.4 * r.n() - 0.25 * sensitivity * exc, 90, 100), 1),
      systolic: round(b.sbp + 2.5 * r.n() + 6 * stress, 0),
      diastolic: round(b.dbp + 2 * r.n() + 3 * stress, 0),
      skinTempC: round(33.5 + 0.25 * r.n(), 1),
      respRate: round(14 + 0.6 * r.n() + 0.9 * sensitivity * exc, 0),
      sleepHours: round(clamp(b.sleep + 0.35 * r.n() - 1.4 * stress, 3.5, 9), 1),
      meanHr: round(resting + 12 + (exMin / 60) * 10 + 1.5 * r2.n(), 0),
      maxHr: events.length ? Math.max(...events.map((e) => e.peakHr)) : round(resting + 38 + 4 * r2.n(), 0),
      activeMin: Math.round(exMin + 75 + 12 * r2.n() - 20 * stress),
      exerciseMin: exMin,
    });
  }
}

// ---- Hourly cabin telemetry (daily value + diurnal cycle + noise), with sensor outages ----
const hr = rng("env-hourly");
const hourly: HourlyEnvSample[] = [];
for (let d = 1; d <= CURRENT_DAY; d++) {
  const e = env[d - 1];
  // Solar-particle-event days: distribute the daily excess dose over a peaked profile so the hourly mean matches the daily value
  const excess = Math.max(0, e.radiationUSvH - 24);
  const prof = (h: number) => Math.exp(-(((h - 14) / 5) ** 2));
  const profSum = Array.from({ length: 24 }, (_, h) => prof(h)).reduce((x, y) => x + y, 0);
  for (let h = 0; h < 24; h++) {
    const hour = (d - 1) * 24 + h;
    const allOffline = d === 61 && h >= 3 && h <= 19; // telemetry bus outage (17 h)
    const co2Offline = hour >= 129 * 24 + 10 && hour < 130 * 24 + 16; // CO₂ sensor offline for 30 h
    const u = hr.n();
    const diur = Math.sin(((h - 6) / 24) * 2 * Math.PI); // activity / sleep cycle
    if (allOffline) continue;
    hourly.push({
      hour,
      co2Mmhg: co2Offline ? null : round(clamp(e.co2Mmhg + 0.16 * diur + 0.07 * u, 1.2, 9), 2),
      o2Pct: round(e.o2Pct + 0.04 * u, 2),
      pressureKpa: round(d === 97 ? 99.9 + 0.06 * u : e.pressureKpa + 0.05 * u, 2),
      tempC: round(e.tempC + 0.3 * diur + 0.08 * u, 1),
      humidityPct: round(e.humidityPct - 1.5 * diur + 0.5 * u, 1),
      radiationUSvH: round(Math.max(8, e.radiationUSvH - excess + (excess * 24 * prof(h)) / profSum + 0.5 * u), 1),
    });
  }
}

const w = (f: string, o: unknown) => writeFileSync(new URL(`../data/${f}`, import.meta.url), JSON.stringify(o));
w("mission.json", mission); w("astronauts.json", astronauts); w("labs.json", labs);
w("vitals.json", vitals); w("environment.json", env); w("environment-hourly.json", hourly); w("exercise.json", exercise);
console.log(`labs=${labs.length} vitals=${vitals.length} env=${env.length} hourly=${hourly.length} exercise=${exercise.length}`);
