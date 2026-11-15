import type { LabResult, MetricKey } from "./types";
import { comparable } from "./validity";

export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const sd = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** Least-squares slope of y on x (units of y per unit x). */
export function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

export const BASELINE_N = 10; // first N samples define the personal baseline

export interface Trend {
  key: MetricKey;
  latest: number;
  latestDay: number;
  baselineMean: number;
  baselineSd: number;
  /** z-score of the mean of the last 4 samples vs the personal baseline */
  z: number;
  slopePer30d: number;
  delta: number;
  direction: "up" | "down" | "flat";
}

/** Reliable, comparable points only (used for baselines, trends, alerts). */
export function seriesOf(labs: LabResult[], key: MetricKey) {
  return labs.filter((l) => comparable(l, key)).map((l) => ({ day: l.missionDay, v: l.values[key] as number }));
}

export function trendOf(labs: LabResult[], key: MetricKey): Trend | null {
  const s = seriesOf(labs, key);
  if (s.length < BASELINE_N + 4) return null;
  const base = s.slice(0, BASELINE_N).map((p) => p.v);
  const bm = mean(base);
  const bsd = Math.max(sd(base), 1e-6);
  const last = s.slice(-4);
  const z = (mean(last.map((p) => p.v)) - bm) / bsd;
  const recent = s.slice(-10);
  const sl = slope(recent.map((p) => p.day), recent.map((p) => p.v)) * 30;
  const latest = s[s.length - 1];
  return {
    key, latest: latest.v, latestDay: latest.day, baselineMean: bm, baselineSd: bsd, z, slopePer30d: sl,
    delta: latest.v - bm, direction: Math.abs(z) < 1.5 ? "flat" : z > 0 ? "up" : "down",
  };
}

/** Simple acid-base interpretation from pH, pCO2 and HCO3 (illustrative decision support). */
export function classifyAcidBase(pH: number, pCO2: number, hco3: number): { label: string; tone: "ok" | "warn" | "crit" } {
  const acidemia = pH < 7.35, alkalemia = pH > 7.45;
  if (!acidemia && !alkalemia) {
    if (pCO2 > 45 && hco3 > 26) return { label: "Compensated respiratory acidosis pattern", tone: "warn" };
    if (pCO2 < 35 && hco3 < 22) return { label: "Compensated respiratory alkalosis pattern", tone: "warn" };
    return { label: "Acid-base balance within reference range", tone: "ok" };
  }
  const tone = pH < 7.25 || pH > 7.55 ? "crit" : "warn";
  if (acidemia) {
    if (pCO2 > 45 && hco3 >= 22) return { label: hco3 > 26 ? "Respiratory acidosis, partially compensated" : "Respiratory acidosis", tone };
    if (hco3 < 22 && pCO2 <= 45) return { label: pCO2 < 35 ? "Metabolic acidosis, partially compensated" : "Metabolic acidosis", tone };
    return { label: "Mixed acidosis", tone };
  }
  if (pCO2 < 35) return { label: "Respiratory alkalosis", tone };
  if (hco3 > 26) return { label: "Metabolic alkalosis", tone };
  return { label: "Alkalemia, mixed pattern", tone };
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n");
}

export function download(filename: string, text: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const ranks = (a: number[]) => {
  const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array<number>(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
/** Spearman rank correlation (robust to monotonic non-linearity and outliers). */
export const spearman = (xs: number[], ys: number[]) => pearson(ranks(xs), ranks(ys));
