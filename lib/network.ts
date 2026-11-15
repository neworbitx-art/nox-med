// Mission-network (default Navigator) layout. Pure functions, no React/three.
// This is a SCHEMATIC projection of the modeled trajectories (lib/trajectory.ts), not true geometry:
//  - Earth–Moon: a rotating frame (Earth fixed, Moon held on the +X axis) with the same radial compression law as the Local view, K = 0.28 here.
//  - Earth / Mars orbits: the model's orbital phase is kept; the orbit plane is re-oriented for legibility and its radius exaggerated.
//  - Earth–Mars transfer: the heliocentric path is "unrolled": x = swept heliocentric angle fraction, y = radial excess over the straight Earth→Mars radius, normalised.
// Positions are therefore time-consistent with the trajectory model (same phase/fraction at the same instant) but distances and angles are NOT physical.
import { AU_KM, RADIUS, add, cross, dot, mul, norm, sub, unit, type V3 } from "./orbits";
import { ephemerisState } from "./ephemeris";
import { missionById } from "./missions";
import { msOfDay, trajectoryFor, type TrajPoint, type Trajectory } from "./trajectory";

const D2R = Math.PI / 180;
export const NET = {
  earth: [-34, -4.5, 0] as V3, earthR: 7, moonR: 1.55, mars: [37, -3.5, 0] as V3, marsR: 4.2,
  kEarth: 0.28, earthOrbitR: 11.6, marsOrbitR: 7.4, ringR: 2.9, bulge: 27,
  /** default camera */ cam: { pos: [0, 10, 84] as V3, target: [0, -1.5, 0] as V3 },
};
export const NET_DISCLOSURE = "Mission-network view: schematic projection of the modeled trajectories. Body sizes, distances, orbit radii and plane orientations are exaggerated or re-oriented for legibility; phases and timing follow the trajectory model.";

const rotZ = (v: V3, a: number): V3 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
const addS = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const moonState = (ms: number) => ephemerisState("moon", ms);
const moonTheta = (ms: number) => { const m = moonState(ms); return m ? Math.atan2(m.r[1], m.r[0]) : 0; };
/** Earth-centred radial compression into the network layout (ecliptic axes, display units). */
function compE(rel: V3): V3 { const d = norm(rel); if (d === 0) return [0, 0, 0]; const k = (NET.earthR * Math.pow(d / RADIUS.earth, NET.kEarth)) / d; return mul(rel, k); }
// Earth–Moon rotating frame: the ecliptic Y axis is shown as screen-up so the trajectory bows in the screen plane (a proper rotation about the Earth–Moon axis, 180°, so the trajectory bows below the Earth–Moon line); vertical extent flattened ×0.62.
const LUNAR_Y = 0.62; // vertical flattening of the Earth–Moon schematic
const toLunar = (d: V3): V3 => [d[0], -d[1] * LUNAR_Y, -d[2]];
const toEarth = (disp: V3): V3 => addS(NET.earth, toLunar(disp));

export const moonNet = (ms: number): V3 | null => { const m = moonState(ms); return m ? toEarth(compE(rotZ(m.r, -moonTheta(ms)))) : null; };

// Orbit-plane display bases (scene axes). Chosen so the default camera sees an inclined ellipse, as in the reference composition.
const basis = (rollDeg: number, tiltDeg: number): { U: V3; W: V3 } => {
  const r = rollDeg * D2R, a = tiltDeg * D2R;
  const U: V3 = [Math.cos(r), Math.sin(r), 0], W0: V3 = [0, Math.sin(a), Math.cos(a)], k = dot(W0, U), W1: V3 = [W0[0] - k * U[0], W0[1] - k * U[1], W0[2] - k * U[2]];
  return { U, W: unit(W1) }; // orthonormal pair: the display orbit is a true (tilted) circle
};
const PLANE = { earth: basis(-9, 24), mars: basis(24, 30) };
const CENTER = { earth: NET.earth, mars: NET.mars };
const ORBIT_R = { earth: NET.earthOrbitR, mars: NET.marsOrbitR };
const orbitAt = (body: "earth" | "mars", phi: number): V3 => {
  const { U, W } = PLANE[body], R = ORBIT_R[body], c = Math.cos(phi), s = Math.sin(phi);
  return [CENTER[body][0] + R * (c * U[0] + s * W[0]), CENTER[body][1] + R * (c * U[1] + s * W[1]), CENTER[body][2] + R * (c * U[2] + s * W[2])];
};

interface Ctx {
  u?: V3; w?: V3; phi0?: number; body?: "earth" | "mars";
  th0?: number; sweep?: number; r0?: number; r1?: number; rMax?: number; P0?: V3; P1?: V3;
  entry?: V3;
}
const ctxCache = new Map<string, Ctx>();
function ctxOf(tr: Trajectory): Ctx {
  const hit = ctxCache.get(tr.missionId); if (hit) return hit;
  const c: Ctx = {};
  const planeFrom = (day: number) => { const a = tr.at(day)!.rel, b = tr.at(day + 0.001)!.rel, n = unit(cross(a, b)), u = unit(a); c.u = u; c.w = cross(n, u); };
  // Orbit missions: the display phase offset puts the vehicle at a legible spot (Earth ring: left; Mars ring: lower-left) at its current mission day.
  const place = (target: number) => { const now = missionById(tr.missionId)?.vehicle.day ?? tr.minDay, q = tr.at(Math.min(tr.maxDay, Math.max(tr.minDay, now)))!; c.phi0 = target * D2R - Math.atan2(dot(q.rel, c.w!), dot(q.rel, c.u!)); };
  if (tr.category === "earth-orbit") { planeFrom(tr.minDay); c.body = "earth"; place(165); }
  else if (tr.category === "mars-orbit") { planeFrom(tr.minDay); c.body = "mars"; place(105); }
  else if (tr.category === "earth-mars-transfer") {
    const arr = tr.pathEndDay; planeFrom(arr + 0.0005); c.body = "mars"; c.phi0 = 150 * D2R;
    const a = tr.at(1)!.helio, b = tr.at(arr)!.helio;
    c.th0 = Math.atan2(a[1], a[0]); c.sweep = wrapSweep(Math.atan2(b[1], b[0]) - c.th0); c.r0 = norm(a); c.r1 = norm(b);
    c.P0 = addS(NET.earth, [NET.earthR * 1.02 * Math.cos(38 * D2R), NET.earthR * 1.02 * Math.sin(38 * D2R), 0]);
    c.P1 = orbitAt("mars", 150 * D2R);
    let mx = c.r0; for (let i = 0; i <= 160; i++) mx = Math.max(mx, norm(tr.at(1 + ((arr - 1) * i) / 160)!.helio)); c.rMax = Math.max(mx, c.r0 + 1);
  } else if (tr.category === "lunar-transfer") {
    const soi = tr.checkpoints.find((x) => x.id === "soi"), p = soi ? tr.at(soi.plannedDay) : null;
    if (soi && p?.moonRel) c.entry = rotZ(unit(p.moonRel), -moonTheta(msOfDay(tr.missionId, soi.plannedDay)));
  }
  ctxCache.set(tr.missionId, c); return c;
}
const wrapSweep = (d: number) => { const t = 2 * Math.PI; return ((((d + 0.3) % t) + t) % t) - 0.3; };

/** Network-layout scene position of a trajectory point at UTC time ms. */
export function netPoint(tr: Trajectory, p: TrajPoint, ms: number): V3 {
  const c = ctxOf(tr);
  if (tr.category === "lunar-transfer") {
    const th = -moonTheta(ms), rel = rotZ(p.rel, th);
    if (p.captureBlend && p.captureBlend > 0 && p.moonGeo) {
      const moonDisp = compE(rotZ(p.moonGeo, th)), s = Math.min(1, p.captureBlend * 1.6), k = s * s * (3 - 2 * s);
      const dir = p.phase === "Lunar orbit" && p.moonRel ? rotZ(unit(p.moonRel), th) : c.entry ?? unit(rotZ(p.moonRel!, th));
      const target = add(moonDisp, mul(dir, NET.ringR)), base = compE(rel);
      const mixP = toEarth(add(mul(base, 1 - k), mul(target, k))), moonP = toEarth(moonDisp), off = sub(mixP, moonP), dn = norm(off), min = NET.moonR * 1.35;
      // keep the vehicle outside the (exaggerated) Moon sphere during the schematic approach
      return dn < min ? add(moonP, mul(dn > 1e-9 ? unit(off) : unit(sub(toEarth(target), moonP)), min)) : mixP;
    }
    return toEarth(compE(rel));
  }
  if (c.body && (tr.category !== "earth-mars-transfer" || p.phase === "Mars orbit")) {
    const phi = Math.atan2(dot(p.rel, c.w!), dot(p.rel, c.u!)) + (c.phi0 ?? 0);
    return orbitAt(c.body, phi);
  }
  // Earth–Mars cruise: unrolled heliocentric path
  const s = Math.max(0, Math.min(1, wrapSweep(Math.atan2(p.helio[1], p.helio[0]) - c.th0!) / c.sweep!));
  // y = radial rise above the departure radius (normalised to the path's own maximum), with the end pulled onto the Mars-orbit anchor (smoothstep) so the arc is a clean bow.
  const rise = (r: number) => ((r - c.r0!) / (c.rMax! - c.r0!)) * NET.bulge, base = c.P0![1] + (c.P1![1] - c.P0![1]) * 0, end = c.P1![1] - (base + rise(c.r1!)), k = s * s * (3 - 2 * s);
  const y = base + rise(norm(p.helio)) + end * k * k;
  return [c.P0![0] + (c.P1![0] - c.P0![0]) * s, y, c.P0![2] + (c.P1![2] - c.P0![2]) * s];
}
export function netPointAt(missionId: string, day: number): V3 | null {
  const tr = trajectoryFor(missionId), p = tr.at(day); return p ? netPoint(tr, p, msOfDay(missionId, day)) : null;
}
/** Closed display orbit for orbit missions (and the Mars phase of the transfer mission). */
export function netOrbitRing(missionId: string, n = 160): V3[] | null {
  const tr = trajectoryFor(missionId), c = ctxOf(tr); if (!c.body || tr.category === "lunar-transfer") return null;
  return Array.from({ length: n }, (_, i) => orbitAt(c.body!, (i / n) * 2 * Math.PI));
}
/** Capture ring around the Moon for the lunar mission (display radius exaggerated). */
export function netLunarRing(missionId: string, n = 48): V3[] {
  const tr = trajectoryFor(missionId), loi = tr.checkpoints.find((x) => x.id === "loi")!.plannedDay, th = -moonTheta(msOfDay(missionId, loi)), out: V3[] = [];
  for (let i = 0; i <= n; i++) { const q = tr.at(loi + (i / n) * 0.0817 + 1e-6); if (q?.moonRel) out.push(toLunar(mul(rotZ(unit(q.moonRel), th), NET.ringR))); }
  return out;
}
/** Maneuvers (burns/insertions) vs plain checkpoints, for marker styling. */
export const isManeuver = (id: string) => /^(tmi|tli|loi|moi|trim|deorbit)$/.test(id);

export interface TelemetryReadout { phase: string; dist: { label: string; km: number } | null; speed: { label: string; kmS: number } | null }
/** Distance and speed derived from the trajectory model at mission day `day` (never live telemetry). */
export function modelTelemetry(missionId: string, day: number): TelemetryReadout | null {
  const tr = trajectoryFor(missionId), p = tr.at(day); if (!p) return null;
  const dt = 30 / 86400, a = tr.at(day - dt), b = tr.at(day + dt);
  const sun = tr.category === "earth-mars-transfer" && p.phase !== "Mars orbit";
  const primary = tr.category === "mars-orbit" || p.phase === "Mars orbit" ? "Mars" : "Earth";
  let speed: TelemetryReadout["speed"] = null;
  if (a && b) { const d = norm(sub(sun ? b.helio : b.rel, sun ? a.helio : a.rel)) / 60; speed = { label: sun ? "v (vs Sun)" : `v (vs ${primary})`, kmS: d }; }
  const orbit = tr.category === "earth-orbit" || tr.category === "mars-orbit" || p.phase === "Mars orbit";
  const dist = orbit ? { label: `ALT (${primary})`, km: norm(p.rel) - RADIUS[primary === "Mars" ? "mars" : "earth"] } : { label: `DIST (${primary})`, km: norm(p.rel) };
  return { phase: p.phase, dist, speed };
}
