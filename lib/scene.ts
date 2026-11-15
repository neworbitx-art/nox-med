// Pure helpers that turn simulation time into scene-space positions for the Navigator. No React / three.js here.
import { AU_KM, add, mul, norm, sub, unit, type V3 } from "./orbits";
import { ephemerisState } from "./ephemeris";
import { compress, toScene, DISPLAY, HELIO_UNITS_PER_AU } from "./display";
import { MISSIONS, missionById, type MissionRecord } from "./missions";
import { trajectoryFor, dayOfMs, type TrajPoint, type Trajectory } from "./trajectory";

export type ViewMode = "overview" | "local" | "interplanetary";
export const msOf = (m: MissionRecord, day: number) => trajectoryFor(m.id).epochMs + (day - 1) * 86400000;

/** Mission-day of another mission at a given UTC time (the global scene clock is calendar time). */
export const dayAt = (id: string, ms: number) => dayOfMs(trajectoryFor(id).epochMs, ms);
/** Point on a mission's modeled trajectory at calendar time ms; null when the mission is not active then, or the ephemeris does not cover it. */
export function pointAt(id: string, ms: number): TrajPoint | null {
  const tr = trajectoryFor(id), d = dayAt(id, ms);
  return d < tr.minDay - 1e-9 || d > tr.maxDay + 1e-9 ? null : tr.at(d);
}

export const helioScene = (km: V3): V3 => toScene(mul(km, HELIO_UNITS_PER_AU / AU_KM));
export function bodiesHelio(ms: number) {
  const e = ephemerisState("earth", ms), m = ephemerisState("mars", ms); if (!e || !m) return null;
  return { earth: helioScene(e.r), mars: helioScene(m.r), sunToEarthDir: unit(e.r), sunToMarsDir: unit(m.r) };
}

export const LOCAL_RING_RADIUS = DISPLAY.moonRadius * 1.9;
/** Display-space position (Earth/Mars-centred Local view) of a trajectory point. The lunar capture is blended schematically (documented). */
export function localScene(p: TrajPoint, tr: Trajectory, entryDir?: V3): V3 {
  const body = tr.primary;
  if (p.captureBlend && p.captureBlend > 0 && p.moonGeo) {
    const moonDisp = compress(p.moonGeo, "earth"), s = p.captureBlend, k = s * s * (3 - 2 * s);
    const dir = p.phase === "Lunar orbit" ? unit(p.moonRel!) : entryDir ?? unit(p.moonRel!);
    const target = add(moonDisp, mul(dir, LOCAL_RING_RADIUS));
    const base = compress(p.rel, "earth");
    const out = add(mul(base, 1 - k), mul(target, k));
    return toScene(out);
  }
  return toScene(compress(p.rel, body));
}
export const entryDirOf = (tr: Trajectory): V3 | undefined => { const c = tr.checkpoints.find((x) => x.id === "soi"); const p = c ? tr.at(c.plannedDay) : null; return p?.moonRel ? unit(p.moonRel) : undefined; };
export const moonScene = (moonGeo: V3): V3 => toScene(compress(moonGeo, "earth"));

/** Which missions are active (modeled) at calendar time ms. */
export const activeAt = (ms: number) => MISSIONS.filter((m) => pointAt(m.id, ms) !== null);
export const lengthUnits = (a: V3, b: V3) => norm(sub(a, b));
void missionById;
