// Generates data/ephemeris.json with astronomy-engine (MIT). Frame: J2000 mean ecliptic & equinox, km and km/s.
import * as A from "astronomy-engine";
import { writeFileSync } from "node:fs";

const KM = A.KM_PER_AU, AUD = KM / 86400; // AU/day -> km/s
const R = A.Rotation_EQJ_ECL();
const rot = (m, v) => [m.rot[0][0]*v[0]+m.rot[1][0]*v[1]+m.rot[2][0]*v[2], m.rot[0][1]*v[0]+m.rot[1][1]*v[1]+m.rot[2][1]*v[2], m.rot[0][2]*v[0]+m.rot[1][2]*v[1]+m.rot[2][2]*v[2]];
// astronomy-engine rotation matrices apply as out_i = sum_j rot[j][i] * in_j (see RotateVector)
const st = (s) => { const p = rot(R, [s.x, s.y, s.z]).map((x) => x * KM), v = rot(R, [s.vx, s.vy, s.vz]).map((x) => x * AUD); return [...p.map((x) => Math.round(x)), ...v.map((x) => +x.toFixed(7))]; };

function table(label, origin, fn, startISO, endISO, stepDays) {
  const t0 = Date.parse(startISO), t1 = Date.parse(endISO), samples = [];
  for (let t = t0; t <= t1 + 1; t += stepDays * 86400000) samples.push(st(fn(A.MakeTime(new Date(t)))));
  return { label, origin, start: startISO, stepDays, count: samples.length, samples };
}
const out = {
  meta: {
    source: "astronomy-engine 2.1.19 (VSOP87 planetary theory, ELP/MPP02-derived lunar model), MIT licence.",
    generator: "scripts/generate-ephemeris.mjs",
    generatedFrom: "analytic planetary/lunar theory; sub-arcminute accuracy; not a substitute for DE-series ephemerides",
    frame: "J2000 mean ecliptic and equinox (right-handed, +Z ecliptic north)",
    timeScale: "UTC calendar dates (UT/TT difference of ~1 min is ignored)",
    units: { position: "km", velocity: "km/s" },
    interpolation: "cubic Hermite using position and velocity",
    note: "Heliocentric (Sun-centred) for Earth and Mars; geocentric (Earth-centred) for the Moon. Never mix origins without an explicit transform.",
  },
  tables: {
    earth: table("Earth", "Sun", (t) => A.HelioState(A.Body.Earth, t), "2030-12-01T00:00:00Z", "2033-01-01T00:00:00Z", 2),
    mars: table("Mars", "Sun", (t) => A.HelioState(A.Body.Mars, t), "2030-12-01T00:00:00Z", "2033-01-01T00:00:00Z", 2),
    moon: table("Moon", "Earth", (t) => A.GeoMoonState(t), "2031-04-01T00:00:00Z", "2033-01-01T00:00:00Z", 0.5),
  },
};
writeFileSync(new URL("../data/ephemeris.json", import.meta.url), JSON.stringify(out));
console.log("ok", Object.fromEntries(Object.entries(out.tables).map(([k, v]) => [k, v.count])));
