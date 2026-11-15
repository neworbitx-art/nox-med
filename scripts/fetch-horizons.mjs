// Writes data/ephemeris.json from JPL Horizons (https://ssd-api.jpl.nasa.gov/doc/horizons.html) in the same schema as generate-ephemeris.mjs.
// NOT RUN in the original build environment (JPL was unreachable there), so this script is untested. Run it with network access, then rerun `npm test`.
import { writeFileSync } from "node:fs";

const FRAME = "ECLIPTIC"; // Horizons REF_PLANE=ECLIPTIC with the J2000 mean equinox
async function vectors(command, center, start, stop, stepDays) {
  const q = new URLSearchParams({ format: "json", COMMAND: `'${command}'`, EPHEM_TYPE: "VECTORS", CENTER: `'${center}'`, START_TIME: `'${start}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: `'${stepDays} d'`, REF_PLANE: FRAME, REF_SYSTEM: "ICRF", OUT_UNITS: "KM-S", VEC_TABLE: "2", CSV_FORMAT: "YES" });
  const r = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${q}`); const j = await r.json();
  const body = j.result.split("$$SOE")[1].split("$$EOE")[0].trim().split("\n");
  return body.map((l) => { const c = l.split(",").map((x) => x.trim()); return [Math.round(+c[2]), Math.round(+c[3]), Math.round(+c[4]), +(+c[5]).toFixed(7), +(+c[6]).toFixed(7), +(+c[7]).toFixed(7)]; });
}
const T = (label, origin, samples, start, stepDays) => ({ label, origin, start, stepDays, count: samples.length, samples });
const out = {
  meta: { source: "JPL Horizons API (ssd.jpl.nasa.gov)", generator: "scripts/fetch-horizons.mjs", frame: "J2000 mean ecliptic and equinox (right-handed, +Z ecliptic north)", timeScale: "TDB (as returned by Horizons)", units: { position: "km", velocity: "km/s" }, interpolation: "cubic Hermite using position and velocity", note: "Heliocentric (Sun-centred) for Earth and Mars; geocentric (Earth-centred) for the Moon. Never mix origins without an explicit transform." },
  tables: {
    earth: T("Earth", "Sun", await vectors("399", "500@10", "2030-12-01", "2033-01-01", 2), "2030-12-01T00:00:00Z", 2),
    mars: T("Mars", "Sun", await vectors("499", "500@10", "2030-12-01", "2033-01-01", 2), "2030-12-01T00:00:00Z", 2),
    moon: T("Moon", "Earth", await vectors("301", "500@399", "2031-04-01", "2033-01-01", 0.5), "2031-04-01T00:00:00Z", 0.5),
  },
};
writeFileSync(new URL("../data/ephemeris.json", import.meta.url), JSON.stringify(out));
console.log("written", Object.fromEntries(Object.entries(out.tables).map(([k, v]) => [k, v.count])));
