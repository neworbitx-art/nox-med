// Two-body orbital mechanics used by the NOX trajectory models. All distances km, times s unless noted, frame J2000 ecliptic.
export type V3 = [number, number, number];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => mul(a, 1 / norm(a));

export const AU_KM = 149597870.7;
export const DAY_S = 86400;
/** Gravitational parameters, km^3/s^2 (IAU/JPL values). */
export const GM = { sun: 1.32712440018e11, earth: 398600.4418, moon: 4902.800066, mars: 42828.375214 } as const;
/** Mean equatorial radii, km. */
export const RADIUS = { sun: 695700, earth: 6378.137, moon: 1737.4, mars: 3396.19 } as const;
export const OBLIQUITY_J2000_DEG = 23.4392911;
const D2R = Math.PI / 180;

/** Equatorial (J2000) vector -> ecliptic (J2000). */
export function eqToEcl(v: V3): V3 { const e = OBLIQUITY_J2000_DEG * D2R, c = Math.cos(e), s = Math.sin(e); return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]; }
/** Unit pole vectors (ecliptic J2000). Earth: exactly the equatorial pole. Mars: IAU WGCCRE 2015 pole at J2000 (RA 317.68143 deg, Dec 52.88650 deg). */
export function poleFromRaDec(raDeg: number, decDeg: number): V3 { const a = raDeg * D2R, d = decDeg * D2R; return unit(eqToEcl([Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)])); }
export const EARTH_POLE: V3 = poleFromRaDec(0, 90);
export const MARS_POLE: V3 = poleFromRaDec(317.68143, 52.8865);

// ── universal-variable Kepler propagation (Curtis, Orbital Mechanics for Engineering Students, ch. 3) ──
const stumpC = (z: number) => (z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24 + (z * z) / 720);
const stumpS = (z: number) => (z > 1e-8 ? (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / Math.pow(z, 1.5) : z < -1e-8 ? (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / Math.pow(-z, 1.5) : 1 / 6 - z / 120 + (z * z) / 5040);

/** Propagate a two-body state by dt seconds. */
export function propagate(r0: V3, v0: V3, mu: number, dt: number): { r: V3; v: V3 } {
  if (dt === 0) return { r: r0, v: v0 };
  const r0n = norm(r0), vr0 = dot(r0, v0) / r0n, alpha = 2 / r0n - dot(v0, v0) / mu, sm = Math.sqrt(mu);
  let chi = sm * Math.abs(alpha) * dt;
  if (Math.abs(alpha) < 1e-12) chi = sm * dt / r0n;
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi, C = stumpC(z), S = stumpS(z);
    const F = ((r0n * vr0) / sm) * chi * chi * C + (1 - alpha * r0n) * chi ** 3 * S + r0n * chi - sm * dt;
    const dF = ((r0n * vr0) / sm) * chi * (1 - z * S) + (1 - alpha * r0n) * chi * chi * C + r0n;
    const d = F / dF; chi -= d;
    if (Math.abs(d) < 1e-9 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi, C = stumpC(z), S = stumpS(z);
  const f = 1 - (chi * chi * C) / r0n, g = dt - (chi ** 3 * S) / sm;
  const r = add(mul(r0, f), mul(v0, g)), rn = norm(r);
  const fd = (sm / (rn * r0n)) * (z * S - 1) * chi, gd = 1 - (chi * chi * C) / rn;
  return { r, v: add(mul(r0, fd), mul(v0, gd)) };
}

/** Lambert solver (universal variables, prograde about +Z, single revolution). Returns departure and arrival velocities, km/s. */
export function lambert(r1: V3, r2: V3, dt: number, mu: number): { v1: V3; v2: V3 } | null {
  const r1n = norm(r1), r2n = norm(r2), c = dot(r1, r2) / (r1n * r2n);
  const dth = cross(r1, r2)[2] >= 0 ? Math.acos(Math.max(-1, Math.min(1, c))) : 2 * Math.PI - Math.acos(Math.max(-1, Math.min(1, c)));
  const A = Math.sin(dth) * Math.sqrt((r1n * r2n) / (1 - Math.cos(dth)));
  if (Math.abs(A) < 1e-9) return null;
  const y = (z: number) => r1n + r2n + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z));
  const F = (z: number) => Math.pow(y(z) / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(y(z)) - Math.sqrt(mu) * dt;
  let lo = -40; while (y(lo) < 0 && lo < 0) lo += 0.5;
  let hi = 4 * Math.PI * Math.PI - 1e-3;
  if (F(lo) > 0 || F(hi) < 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (F(mid) < 0) lo = mid; else hi = mid; }
  const z = (lo + hi) / 2, yy = y(z), f = 1 - yy / r1n, g = A * Math.sqrt(yy / mu), gd = 1 - yy / r2n;
  return { v1: mul(sub(r2, mul(r1, f)), 1 / g), v2: mul(sub(mul(r2, gd), r1), 1 / g) };
}

// ── circular orbit about a planet with a given pole ──
export interface CircularOrbit { primary: "earth" | "mars" | "moon"; altitudeKm: number; inclinationDeg: number; raanDeg: number; argLatDeg0: number; pole: V3 }
export function orbitBasis(pole: V3): { x: V3; y: V3; z: V3 } {
  // x = intersection of the primary's equator with the Earth equator (vernal-equinox direction for Earth itself), y completes the frame.
  const z = unit(pole); let x = cross(EARTH_POLE, z); x = norm(x) < 1e-9 ? [1, 0, 0] : unit(x); return { x, y: cross(z, x), z };
}
export const circularRadius = (o: CircularOrbit) => RADIUS[o.primary] + o.altitudeKm;
export const circularPeriodS = (o: CircularOrbit) => 2 * Math.PI * Math.sqrt(Math.pow(circularRadius(o), 3) / GM[o.primary]);
/** State relative to the primary after dtS seconds from the epoch (argument of latitude = argLatDeg0 at dt=0). */
export function circularState(o: CircularOrbit, dtS: number): { r: V3; v: V3 } {
  const a = circularRadius(o), n = Math.sqrt(GM[o.primary] / a ** 3), u = o.argLatDeg0 * D2R + n * dtS;
  const i = o.inclinationDeg * D2R, O = o.raanDeg * D2R, B = orbitBasis(o.pole);
  const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  const loc = (p: [number, number, number]): V3 => add(add(mul(B.x, p[0]), mul(B.y, p[1])), mul(B.z, p[2]));
  const r = loc([a * (cO * cu - sO * ci * su), a * (sO * cu + cO * ci * su), a * si * su]);
  const v = loc([a * n * (-cO * su - sO * ci * cu), a * n * (-sO * su + cO * ci * cu), a * n * si * cu]);
  return { r, v };
}
export const orbitNormal = (o: CircularOrbit): V3 => { const s = circularState(o, 0); return unit(cross(s.r, s.v)); };
