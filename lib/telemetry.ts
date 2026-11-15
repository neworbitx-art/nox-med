/**
 * Environmental + wearable telemetry helpers (all SIMULATED data).
 * Time convention: "t" = elapsed mission days (1.0 = mission start, 00:00 UTC), identical to lab collection times
 * via elapsedDays(), so every series shares one true time axis.
 */
import type { ExerciseEvent, HourlyEnvSample, LabResult, VitalSign } from "./types";
import { elapsedDays, hourlyEnv } from "./data";
import { mean, pearson, spearman } from "./analysis";
import { comparable } from "./validity";

export const MMHG_PER_KPA = 7.50062;

/** Partial pressure of O₂ (mmHg) = O₂ fraction × total pressure. Dry-gas approximation (water vapour ignored). */
export const o2PartialMmhg = (o2Pct: number, pressureKpa: number) => (o2Pct / 100) * pressureKpa * MMHG_PER_KPA;
/** Volume fraction (%) equivalent of a CO₂ partial pressure at a given total pressure. NOT blood pCO₂. */
export const co2FractionPct = (co2Mmhg: number, pressureKpa: number) => (co2Mmhg / (pressureKpa * MMHG_PER_KPA)) * 100;
export const co2Ppm = (co2Mmhg: number, pressureKpa: number) => co2FractionPct(co2Mmhg, pressureKpa) * 1e4;

export type EnvVar = "co2" | "o2pp" | "pressure" | "temp" | "humidity" | "radiation" | "dose";
export interface EnvVarDef { label: string; unit: string; decimals: number; note: string; low?: number; high?: number; warn?: number; derived?: boolean }
export const ENV_VARS: Record<EnvVar, EnvVarDef> = {
  co2: { label: "Cabin CO₂ partial pressure", unit: "mmHg", decimals: 2, high: 4, warn: 5.3, note: "Ambient gas partial pressure measured in cabin air (not blood pCO₂). Alert lines are prototype thresholds." },
  o2pp: { label: "Cabin O₂ partial pressure", unit: "mmHg", decimals: 1, low: 148, derived: true, note: "Calculated: O₂ fraction × total pressure (dry-gas approximation)." },
  pressure: { label: "Total atmospheric pressure", unit: "kPa", decimals: 2, low: 100.5, high: 102, note: "Total cabin pressure; 1 kPa = 7.50 mmHg." },
  temp: { label: "Cabin temperature", unit: "°C", decimals: 1, low: 20, high: 25, note: "Bulk cabin air temperature." },
  humidity: { label: "Relative humidity", unit: "%", decimals: 1, low: 30, high: 60, note: "Percent of saturation at cabin temperature." },
  radiation: { label: "Radiation dose rate", unit: "µSv/h", decimals: 1, high: 100, note: "Cabin ambient dose-equivalent rate; same value assumed for all crew." },
  dose: { label: "Cumulative radiation dose", unit: "mSv", decimals: 2, derived: true, note: "Sum of recorded hourly dose rates; hours with no telemetry are NOT imputed (lower bound)." },
};
export const ENV_KEYS = Object.keys(ENV_VARS) as EnvVar[];

export interface EnvPoint { hour: number; t: number; v: Record<EnvVar, number | null> }
export const hourT = (hour: number) => hour / 24 + 1;

let cache: EnvPoint[] | null = null;
export function envPoints(src: HourlyEnvSample[] = hourlyEnv): EnvPoint[] {
  if (src === hourlyEnv && cache) return cache;
  let dose = 0;
  const out = src.map((s): EnvPoint => {
    if (s.radiationUSvH !== null) dose += s.radiationUSvH / 1000; // µSv/h × 1 h → mSv
    return { hour: s.hour, t: hourT(s.hour), v: {
      co2: s.co2Mmhg, pressure: s.pressureKpa, temp: s.tempC, humidity: s.humidityPct, radiation: s.radiationUSvH,
      o2pp: s.o2Pct !== null && s.pressureKpa !== null ? o2PartialMmhg(s.o2Pct, s.pressureKpa) : null,
      dose: s.radiationUSvH !== null ? dose : null,
    } };
  });
  if (src === hourlyEnv) cache = out;
  return out;
}

export interface TPoint { t: number; v: number }
export type Resolution = "hourly" | "daily";

/** Series of recorded values only. Missing hours/sensors produce no point (never zero or interpolated). */
export function envSeries(v: EnvVar, t0: number, t1: number, res: Resolution, pts: EnvPoint[] = envPoints()): TPoint[] {
  const inWin = pts.filter((p) => p.t >= t0 && p.t <= t1 && p.v[v] !== null);
  if (res === "hourly") return inWin.map((p) => ({ t: p.t + 0.5 / 24, v: p.v[v] as number }));
  const byDay = new Map<number, number[]>();
  for (const p of inWin) { const d = Math.floor(p.t); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p.v[v] as number); }
  // A daily mean needs ≥ 12 recorded hours (cumulative dose uses the last recorded value of the day)
  return [...byDay.entries()].filter(([, a]) => a.length >= 12).sort((a, b) => a[0] - b[0])
    .map(([d, a]) => ({ t: d + 0.5, v: v === "dose" ? a[a.length - 1] : mean(a) }));
}

/** Intervals with no recorded data (gap larger than 1.5 × step). */
export function missingIntervals(points: TPoint[], step: number, t0: number, t1: number): [number, number][] {
  const out: [number, number][] = [];
  const g = step * 1.5;
  if (!points.length) return [[t0, t1]];
  if (points[0].t - t0 > g) out.push([t0, points[0].t - step / 2]);
  for (let i = 1; i < points.length; i++) if (points[i].t - points[i - 1].t > g) out.push([points[i - 1].t + step / 2, points[i].t - step / 2]);
  if (t1 - points[points.length - 1].t > g) out.push([points[points.length - 1].t + step / 2, t1]);
  return out;
}

export interface WindowStat { mean: number | null; n: number; coverage: number }
/** Mean of recorded hourly values in [t0, t1); coverage = recorded hours / hours in window. */
export function windowStat(v: EnvVar, t0: number, t1: number, pts: EnvPoint[] = envPoints()): WindowStat {
  const hours = Math.max(1, Math.round((t1 - t0) * 24));
  const a = pts.filter((p) => p.t >= t0 && p.t < t1 && p.v[v] !== null).map((p) => p.v[v] as number);
  return { mean: a.length ? mean(a) : null, n: a.length, coverage: a.length / hours };
}

export interface LabAlignment {
  lab: LabResult;
  t: number;
  /** Cabin CO₂ at the hour of collection (hour containing the timestamp, if recorded) */
  cabinAt: number | null;
  mean24: WindowStat;
  mean72: WindowStat;
  vitals?: VitalSign;
  /** Most recent exercise event ending ≤ 6 h before collection */
  exercise?: { event: ExerciseEvent; minutesBefore: number };
}

export const MIN_COVERAGE = 0.75;

export function alignLabs(labs: LabResult[], vitals: VitalSign[], events: ExerciseEvent[], pts: EnvPoint[] = envPoints()): LabAlignment[] {
  return labs.map((lab) => {
    const t = elapsedDays(lab.collectedAt);
    const hr = Math.floor((t - 1) * 24 + 1e-9);
    const here = pts.find((p) => p.hour === hr);
    let exercise: LabAlignment["exercise"];
    for (const e of events) {
      if (e.astronautId !== lab.astronautId) continue;
      const end = Date.parse(e.startedAt) + e.durationMin * 60000;
      const mins = (Date.parse(lab.collectedAt) - end) / 60000;
      if (mins >= 0 && mins <= 360 && (!exercise || mins < exercise.minutesBefore)) exercise = { event: e, minutesBefore: Math.round(mins) };
    }
    return { lab, t, cabinAt: here?.v.co2 ?? null, mean24: windowStat("co2", t - 1, t, pts), mean72: windowStat("co2", t - 3, t, pts),
      vitals: vitals.find((v) => v.astronautId === lab.astronautId && v.missionDay === lab.missionDay), exercise };
  });
}

export interface Association { n: number; pearson: number; spearman: number }
/** Association between preceding-24 h mean cabin CO₂ and reliable arterial/capillary blood pCO₂. Association only — not causation. */
export function cabinBloodAssociation(rows: LabAlignment[]): Association | null {
  const use = rows.filter((r) => comparable(r.lab, "pCO2") && r.mean24.mean !== null && r.mean24.coverage >= MIN_COVERAGE);
  if (use.length < 5) return null;
  const xs = use.map((r) => r.mean24.mean as number), ys = use.map((r) => r.lab.values.pCO2 as number);
  return { n: use.length, pearson: pearson(xs, ys), spearman: spearman(xs, ys) };
}

export function standardize(points: TPoint[], base: { mean: number; sd: number }): TPoint[] {
  const sd = base.sd > 1e-9 ? base.sd : 1;
  return points.map((p) => ({ t: p.t, v: (p.v - base.mean) / sd }));
}
export function baselineOf(points: TPoint[], t0 = 1, t1 = 31): { mean: number; sd: number } | null {
  const a = points.filter((p) => p.t >= t0 && p.t < t1).map((p) => p.v);
  if (a.length < 5) return null;
  const m = mean(a);
  return { mean: m, sd: Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) };
}

export const clockOf = (t: number) => {
  const d = Math.floor(t), mins = Math.round((t - d) * 1440);
  return `D${d} ${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}Z`;
};

/** Nearest recorded point within maxGap days (returns null across data gaps). */
export function nearest(points: TPoint[], t: number, maxGap: number): TPoint | null {
  let lo = 0, hi = points.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].t < t) lo = m + 1; else hi = m; }
  const c = [points[lo], points[lo - 1]].filter(Boolean).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return Math.abs(c.t - t) <= maxGap ? c : null;
}
