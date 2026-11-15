import raw from "@/data/ephemeris.json";
import type { V3 } from "./orbits";

export type EphBody = "earth" | "mars" | "moon";
interface Table { label: string; origin: string; start: string; stepDays: number; count: number; samples: number[][] }
const eph = raw as unknown as { meta: Record<string, unknown>; tables: Record<EphBody, Table> };
export const EPHEMERIS_META = eph.meta as { source: string; frame: string; units: { position: string; velocity: string }; interpolation: string; note: string; generator: string; timeScale: string };
export const EPHEMERIS_ORIGIN: Record<EphBody, string> = { earth: eph.tables.earth.origin, mars: eph.tables.mars.origin, moon: eph.tables.moon.origin };

const start = (b: EphBody) => Date.parse(eph.tables[b].start);
export function ephemerisRange(b: EphBody): [number, number] { const t = eph.tables[b]; return [start(b), start(b) + (t.count - 1) * t.stepDays * 86400000]; }

/** Cubic Hermite interpolation of position (km) and velocity (km/s) at UTC ms. Null outside the stored range (never extrapolates). */
export function ephemerisState(b: EphBody, ms: number): { r: V3; v: V3 } | null {
  const t = eph.tables[b], h = t.stepDays * 86400, x = (ms - start(b)) / (t.stepDays * 86400000);
  if (!(x >= 0 && x <= t.count - 1)) return null;
  const i = Math.min(t.count - 2, Math.floor(x)), s = x - i, a = t.samples[i], c = t.samples[i + 1];
  const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const d00 = (6 * s2 - 6 * s) / h, d10 = (3 * s2 - 4 * s + 1), d01 = (-6 * s2 + 6 * s) / h, d11 = (3 * s2 - 2 * s);
  const r = [0, 1, 2].map((k) => h00 * a[k] + h10 * h * a[k + 3] + h01 * c[k] + h11 * h * c[k + 3]) as V3;
  const v = [0, 1, 2].map((k) => d00 * a[k] + d10 * a[k + 3] + d01 * c[k] + d11 * c[k + 3]) as V3;
  return { r, v };
}
