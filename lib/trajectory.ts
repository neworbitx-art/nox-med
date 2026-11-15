// Mission trajectory models. Frame: J2000 mean ecliptic, km. Positions come from the stored ephemeris (planets/Moon) plus two-body
// propagation (Kepler/Lambert). Patched-conic simplification: planetary spheres of influence are treated as points, no perturbations.
import { ephemerisState, ephemerisRange } from "./ephemeris";
import { AU_KM, DAY_S, EARTH_POLE, GM, MARS_POLE, RADIUS, add, circularPeriodS, circularRadius, circularState, cross, dot, lambert, mul, norm, propagate, sub, unit, type CircularOrbit, type V3 } from "./orbits";
import { missionById, type MissionRecord } from "./missions";

export type TrajectoryCategory = "earth-orbit" | "lunar-transfer" | "earth-mars-transfer" | "mars-orbit";
export const CATEGORY_LABEL: Record<TrajectoryCategory, string> = { "earth-orbit": "Earth orbit", "lunar-transfer": "Lunar transfer", "earth-mars-transfer": "Earth–Mars transfer", "mars-orbit": "Mars orbit" };
export type Primary = "earth" | "mars";

export interface TrajPoint {
  day: number;                 // mission day, 1.0 = mission start 00:00 UTC
  helio: V3;                   // km, Sun-centred
  rel: V3;                     // km, relative to the local primary (Earth or Mars); for heliocentric cruise = relative to the departure planet's position at that instant
  phase: string;
  moonRel?: V3 | null;         // km, relative to the Moon (lunar capture/orbit only)
  captureBlend?: number;       // 0..1: schematic approach/capture blend used by the Earth–Moon view
  moonGeo?: V3 | null;         // Moon position relative to Earth, km, at this time
}
export interface TrajCheckpoint { id: string; label: string; description: string; phase: string; plannedDay: number; actualDay: number | null; note: string }
export interface Metric { label: string; value: string }
export interface Trajectory {
  missionId: string; category: TrajectoryCategory; primary: Primary; epochMs: number; minDay: number; maxDay: number;
  checkpoints: TrajCheckpoint[]; assumptions: string[]; metrics: Metric[]; method: string;
  at: (day: number) => TrajPoint | null;
  samples: (n: number, fromDay?: number, toDay?: number) => TrajPoint[];
  /** Day on which the simulated path ends being drawn (e.g. SOI entry for the lunar coast). */
  pathEndDay: number;
}

const D2R = Math.PI / 180, dayToMs = (epoch: number, day: number) => epoch + (day - 1) * 86400000;
const helioOf = (b: "earth" | "mars", ms: number) => ephemerisState(b, ms);
const fmt = (x: number, d = 1) => x.toFixed(d);
export const dayOfMs = (epoch: number, ms: number) => (ms - epoch) / 86400000 + 1;

function elements(r: V3, v: V3, mu: number) {
  const rn = norm(r), a = 1 / (2 / rn - dot(v, v) / mu), h = cross(r, v), ev = sub(mul(cross(v, h), 1 / mu), unit(r));
  return { a, e: norm(ev), incDeg: Math.acos(h[2] / norm(h)) / D2R };
}

const LEO: Omit<CircularOrbit, "primary"> = { altitudeKm: 420, inclinationDeg: 51.6, raanDeg: 40, argLatDeg0: 0, pole: EARTH_POLE };
const MARS_ORB: Omit<CircularOrbit, "primary"> = { altitudeKm: 500, inclinationDeg: 93, raanDeg: 30, argLatDeg0: 0, pole: MARS_POLE };

function make(base: Pick<Trajectory, "missionId" | "category" | "primary" | "epochMs" | "minDay" | "maxDay" | "checkpoints" | "assumptions" | "metrics" | "method" | "pathEndDay">, at: Trajectory["at"]): Trajectory {
  const samples = (n: number, from = base.minDay, to = base.pathEndDay) => {
    const out: TrajPoint[] = [];
    for (let i = 0; i <= n; i++) { const p = at(from + ((to - from) * i) / n); if (p) out.push(p); }
    return out;
  };
  return { ...base, at, samples };
}

// ───────────── Earth orbit (NOX-03) ─────────────
function earthOrbit(m: MissionRecord, epoch: number): Trajectory {
  const orb: CircularOrbit = { primary: "earth", ...LEO }, T = circularPeriodS(orb);
  const at = (day: number): TrajPoint | null => {
    const ms = dayToMs(epoch, day), e = helioOf("earth", ms); if (!e) return null;
    const s = circularState(orb, (day - 1) * DAY_S);
    return { day, helio: add(e.r, s.r), rel: s.r, phase: "Low Earth orbit" };
  };
  const D = (id: string, label: string, plannedDay: number, description: string): TrajCheckpoint => ({ id, label, description, phase: "Low Earth orbit", plannedDay, actualDay: null, note: "Planned time is a design assumption; the orbit is not perturbed by this event in the model." });
  return make({
    missionId: m.id, category: "earth-orbit", primary: "earth", epochMs: epoch, minDay: 1, maxDay: m.vehicle.totalDays, pathEndDay: 1 + T / DAY_S,
    checkpoints: [D("eva", "EVA window", 37, "Planned extravehicular activity window."), D("resupply", "Resupply", 100, "Cargo resupply rendezvous."), D("deorbit", "Deorbit", 163, "Crew return deorbit burn (not modeled).")],
    assumptions: ["Circular orbit, design assumption (not real NOX telemetry).", "Two-body motion: no J2 precession, drag or reboosts.", "Orbit plane fixed in the J2000 frame; initial phase at mission start is arbitrary."],
    metrics: [{ label: "Altitude", value: `${orb.altitudeKm} km (circular)` }, { label: "Inclination", value: `${orb.inclinationDeg}°` }, { label: "RAAN (J2000 equator)", value: `${orb.raanDeg}°` }, { label: "Period", value: `${fmt(T / 60, 1)} min` }, { label: "Revolutions per day", value: fmt(DAY_S / T, 2) }],
    method: "Analytic circular orbit about Earth, oriented with the Earth pole in the J2000 ecliptic frame; Earth position from the stored ephemeris.",
  }, at);
}

// ───────────── Mars orbit (NOX-04) ─────────────
function marsOrbit(m: MissionRecord, epoch: number): Trajectory {
  const orb: CircularOrbit = { primary: "mars", ...MARS_ORB }, T = circularPeriodS(orb);
  const at = (day: number): TrajPoint | null => {
    const ms = dayToMs(epoch, day), e = helioOf("mars", ms); if (!e) return null;
    const s = circularState(orb, (day - 1) * DAY_S);
    return { day, helio: add(e.r, s.r), rel: s.r, phase: "Mars orbit" };
  };
  const C = (id: string, label: string, plannedDay: number, description: string, note: string): TrajCheckpoint => ({ id, label, description, phase: "Mars orbit", plannedDay, actualDay: null, note });
  return make({
    missionId: m.id, category: "mars-orbit", primary: "mars", epochMs: epoch, minDay: 1, maxDay: m.vehicle.totalDays, pathEndDay: 1 + T / DAY_S,
    checkpoints: [C("moi", "MOI", 1, "Mars orbit insertion (start of the modeled orbit phase).", "The interplanetary leg of this mission is not modeled; the model starts in Mars orbit."), C("relay", "Relay checkout", 190, "Surface-relay link checkout.", "Planned time is a design assumption."), C("trim", "Orbit trim", 433, "Planned orbit-maintenance burn.", "Planned time is a design assumption; the burn is not modeled.")],
    assumptions: ["Circular orbit, design assumption (not real telemetry).", "Two-body motion about Mars: no J2, drag, or station-keeping.", "Interplanetary leg of NOX-04 is not modeled."],
    metrics: [{ label: "Altitude", value: `${orb.altitudeKm} km (circular)` }, { label: "Inclination (Mars equator)", value: `${orb.inclinationDeg}°` }, { label: "Period", value: `${fmt(T / 3600, 2)} h` }, { label: "Revolutions per day", value: fmt(DAY_S / T, 2) }],
    method: "Analytic circular orbit about Mars oriented with the IAU 2015 Mars pole (RA 317.68143°, Dec 52.8865°) in the J2000 ecliptic frame; Mars position from the stored ephemeris.",
  }, at);
}

// ───────────── Lunar transfer (NOX-02) ─────────────
export const LUNAR_SOI_KM = 66200; // Laplace sphere of influence of the Moon, rounded
function lunarTransfer(m: MissionRecord, epoch: number): Trajectory {
  const rp = RADIUS.earth + 185, mu = GM.earth;
  const moonAt = (ms: number) => ephemerisState("moon", ms)!;
  // Solve the transfer time so that the apogee coincides with the Moon's position at arrival (patched conic, aim at the lunar centre).
  let tof = 4.9 * DAY_S;
  for (let i = 0; i < 12; i++) { const ra = norm(moonAt(epoch + tof * 1000).r), a = (rp + ra) / 2; tof = Math.PI * Math.sqrt(a ** 3 / mu); }
  const mA = moonAt(epoch + tof * 1000), ra = norm(mA.r), a = (rp + ra) / 2;
  const nrm = unit(cross(mA.r, mA.v)), r0 = mul(unit(mA.r), -rp), vp = Math.sqrt(mu * (2 / rp - 1 / a)), v0 = mul(cross(nrm, unit(r0)), vp);
  const state = (dtS: number) => propagate(r0, v0, mu, dtS);
  // SOI entry: first time the vehicle is within the Moon's SOI.
  let soi = tof; for (let t = 0; t < tof; t += 300) { const p = state(t).r, mo = moonAt(epoch + t * 1000).r; if (norm(sub(p, mo)) < LUNAR_SOI_KM) { soi = t; break; } }
  const loiDay = 1 + tof / DAY_S, soiDay = 1 + soi / DAY_S;
  // Capture orbit: circular, 100 km altitude, in the plane of the approach (radius vector at SOI entry and the vehicle's velocity relative to the Moon), starting in the approach direction.
  const soiRel = sub(state(soi).r, moonAt(epoch + soi * 1000).r), soiVrel = sub(state(soi).v, moonAt(epoch + soi * 1000).v);
  const rLo = RADIUS.moon + 100, nLo = unit(cross(soiRel, soiVrel)), rhat = unit(soiRel), loR0 = mul(rhat, rLo), loV0 = mul(cross(nLo, rhat), Math.sqrt(GM.moon / rLo));
  const at = (day: number): TrajPoint | null => {
    const ms = dayToMs(epoch, day), e = helioOf("earth", ms), mo = ephemerisState("moon", ms); if (!e || !mo) return null;
    const t = (day - 1) * DAY_S;
    if (day <= loiDay) {
      const s = state(t), blend = day <= soiDay ? 0 : Math.min(1, (day - soiDay) / (loiDay - soiDay));
      return { day, helio: add(e.r, s.r), rel: s.r, phase: day <= soiDay ? "Translunar coast" : "Lunar approach & capture", moonRel: sub(s.r, mo.r), captureBlend: blend, moonGeo: mo.r };
    }
    const lo = propagate(loR0, loV0, GM.moon, (day - loiDay) * DAY_S), rel = add(mo.r, lo.r);
    return { day, helio: add(e.r, rel), rel, phase: "Lunar orbit", moonRel: lo.r, captureBlend: 1, moonGeo: mo.r };
  };
  const C = (id: string, label: string, plannedDay: number, phase: string, description: string, note: string): TrajCheckpoint => ({ id, label, description, phase, plannedDay, actualDay: null, note });
  const dvTLI = vp - Math.sqrt(mu / rp);
  return make({
    missionId: m.id, category: "lunar-transfer", primary: "earth", epochMs: epoch, minDay: 1, maxDay: m.vehicle.totalDays, pathEndDay: soiDay,
    checkpoints: [
      C("tli", "TLI", 1, "Translunar coast", "Trans-lunar injection from a 185 km circular parking orbit.", "Impulsive burn at perigee (model)."),
      C("mcc", "MCC", 1 + Math.round(tof / DAY_S / 2 * 4) / 4, "Translunar coast", "Mid-course correction.", "Planned time is a design assumption; the correction is not modeled (Δv = 0)."),
      C("soi", "Lunar SOI entry", soiDay, "Lunar approach & capture", "Entry into the Moon's sphere of influence.", "Computed from the modeled path."),
      C("loi", "LOI", loiDay, "Lunar approach & capture", "Lunar orbit insertion.", "Capture is shown schematically: the patched-conic aim point is the lunar centre, so the real periselene geometry and burn are not modeled."),
    ],
    assumptions: ["Two-body (Earth) coast from a 185 km parking orbit; no lunar or solar perturbation of the coast.", "Moon position from the stored ephemeris; apogee distance equals the Moon's distance at arrival, so the transfer is a patched-conic aim at the Moon, not a free-return design.", "Approach and capture inside the lunar SOI is schematic; lunar orbit is a 100 km circular design assumption in the plane of the approach.", "Return leg is not modeled."],
    metrics: [{ label: "Transfer time (TLI to arrival)", value: `${fmt(tof / DAY_S, 2)} d` }, { label: "Perigee / apogee radius", value: `${fmt(rp, 0)} / ${fmt(ra, 0)} km` }, { label: "Transfer semi-major axis", value: `${fmt(a, 0)} km` }, { label: "TLI Δv from parking orbit (impulsive)", value: `${fmt(dvTLI * 1000, 0)} m/s` }, { label: "Lunar SOI entry", value: `T+${fmt(soi / DAY_S, 2)} d` }],
    method: "Kepler (universal-variable) propagation of an Earth-centred transfer ellipse whose apogee is solved against the stored lunar ephemeris; schematic capture.",
  }, at);
}

// ───────────── Earth–Mars transfer (NOX-01) ─────────────
export function marsTransferSolution(epoch: number) {
  const e0 = helioOf("earth", epoch)!;
  let best: { tof: number; sum: number; v1: V3; v2: V3 } | null = null;
  for (let tofD = 200; tofD <= 400; tofD += 1) {
    const mA = helioOf("mars", epoch + tofD * 86400000); if (!mA) continue;
    const L = lambert(e0.r, mA.r, tofD * DAY_S, GM.sun); if (!L) continue;
    const dep = norm(sub(L.v1, e0.v)), arr = norm(sub(L.v2, mA.v)), sum = dep + arr;
    if (!best || sum < best.sum) best = { tof: tofD, sum, v1: L.v1, v2: L.v2 };
  }
  return best!;
}
function marsTransfer(m: MissionRecord, epoch: number): Trajectory {
  const sol = marsTransferSolution(epoch), e0 = helioOf("earth", epoch)!, mA = helioOf("mars", epoch + sol.tof * 86400000)!, orb: CircularOrbit = { primary: "mars", ...MARS_ORB };
  const arrDay = 1 + sol.tof, el = elements(e0.r, sol.v1, GM.sun);
  const at = (day: number): TrajPoint | null => {
    const ms = dayToMs(epoch, day), e = helioOf("earth", ms), mr = helioOf("mars", ms); if (!e || !mr) return null;
    if (day <= arrDay) { const s = propagate(e0.r, sol.v1, GM.sun, (day - 1) * DAY_S); return { day, helio: s.r, rel: sub(s.r, e.r), phase: "Trans-Mars cruise" }; }
    const s = circularState(orb, (day - arrDay) * DAY_S);
    return { day, helio: add(mr.r, s.r), rel: s.r, phase: "Mars orbit" };
  };
  const vinfDep = norm(sub(sol.v1, e0.v)), vinfArr = norm(sub(sol.v2, mA.v)), rp = RADIUS.earth + 185;
  const dvDep = Math.sqrt(vinfDep ** 2 + (2 * GM.earth) / rp) - Math.sqrt(GM.earth / rp);
  const arrivalDate = new Date(epoch + sol.tof * 86400000).toISOString().slice(0, 10);
  const C = (id: string, label: string, plannedDay: number, phase: string, description: string, note: string): TrajCheckpoint => ({ id, label, description, phase, plannedDay, actualDay: null, note });
  const dTheta = Math.acos(dot(unit(e0.r), unit(mA.r))) / D2R;
  return make({
    missionId: m.id, category: "earth-mars-transfer", primary: "earth", epochMs: epoch, minDay: 1, maxDay: arrDay + 5, pathEndDay: arrDay,
    checkpoints: [
      C("tmi", "TMI burn", 1, "Trans-Mars cruise", "Trans-Mars injection.", "Impulsive burn at Earth's position (model); Earth escape hyperbola not modeled."),
      C("mcc1", "MCC-1", 16, "Trans-Mars cruise", "First trajectory correction maneuver.", "Planned time is a design assumption; Δv = 0 in the model."),
      C("mcc2", "MCC-2", Math.round(1 + sol.tof * 0.5), "Trans-Mars cruise", "Second trajectory correction maneuver.", "Planned time is a design assumption; Δv = 0 in the model."),
      C("mcc3", "MCC-3", arrDay - 30, "Trans-Mars cruise", "Third trajectory correction maneuver.", "Planned time is a design assumption; Δv = 0 in the model."),
      C("moi", "MOI", arrDay, "Mars orbit", "Mars orbit insertion.", "Propulsive capture not modeled: the vehicle is placed in a 500 km circular orbit (design assumption)."),
    ],
    assumptions: ["Sun-centred two-body transfer between Earth's and Mars's ephemeris positions (Lambert, prograde, single revolution).", "Transfer time chosen by minimising total v∞ (departure + arrival) over 200–400 d for the stated departure date. The 2031-05-10 date is not an optimal launch window, so the result is a long, high-v∞ trajectory, not a mission-design recommendation.", "Planetary spheres of influence treated as points (patched conic); no gravity assists, no perturbations, no maneuvers.", "Surface stay and return leg are not modeled."],
    metrics: [{ label: "Departure (TMI)", value: new Date(epoch).toISOString().slice(0, 10) }, { label: "Arrival (MOI)", value: arrivalDate }, { label: "Transfer time", value: `${sol.tof} d` }, { label: "Departure v∞", value: `${fmt(vinfDep, 2)} km/s (C3 ${fmt(vinfDep ** 2, 1)} km²/s²)` }, { label: "Arrival v∞", value: `${fmt(vinfArr, 2)} km/s` }, { label: "TMI Δv from 185 km parking orbit (impulsive)", value: `${fmt(dvDep * 1000, 0)} m/s` }, { label: "Transfer a / e / i", value: `${fmt(el.a / AU_KM, 3)} AU / ${fmt(el.e, 3)} / ${fmt(el.incDeg, 2)}°` }, { label: "Earth–Mars heliocentric angle at departure", value: `${fmt(dTheta, 1)}°` }],
    method: "Lambert solution between ephemeris positions of Earth (departure) and Mars (arrival), Kepler-propagated in the Sun-centred J2000 ecliptic frame. Not an educational Hohmann approximation.",
  }, at);
}

const cache = new Map<string, Trajectory>();
export function trajectoryFor(missionId: string): Trajectory {
  const hit = cache.get(missionId); if (hit) return hit;
  const m = missionById(missionId); if (!m) throw new Error(`Unknown mission ${missionId}`);
  const epoch = Date.parse(m.startDate + "T00:00:00Z");
  const t = m.route === "earth-orbit" ? earthOrbit(m, epoch) : m.route === "lunar-transfer" ? lunarTransfer(m, epoch) : m.route === "earth-mars-transfer" ? marsTransfer(m, epoch) : marsOrbit(m, epoch);
  cache.set(missionId, t); return t;
}
export const checkpointsOf = (missionId: string) => trajectoryFor(missionId).checkpoints;
export const checkpointStatus = (m: MissionRecord, c: TrajCheckpoint): "Completed" | "Upcoming" => (c.plannedDay <= m.vehicle.day ? "Completed" : "Upcoming");
export const msOfDay = (missionId: string, day: number) => dayToMs(trajectoryFor(missionId).epochMs, day);
export { ephemerisRange };
