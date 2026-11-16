import { describe, expect, it } from "vitest";
import { AU_KM, DAY_S, GM, RADIUS, circularPeriodS, circularState, lambert, norm, propagate, sub, EARTH_POLE, MARS_POLE, dot, type V3 } from "@/lib/orbits";
import { ephemerisRange, ephemerisState, EPHEMERIS_META } from "@/lib/ephemeris";
import { checkpointStatus, trajectoryFor, LUNAR_SOI_KM, marsTransferSolution } from "@/lib/trajectory";
import { MISSIONS, missionById } from "@/lib/missions";
import { compress, DISPLAY } from "@/lib/display";

const energy = (r: V3, v: V3, mu: number) => dot(v, v) / 2 - mu / norm(r);
const dist = (a: V3, b: V3) => norm(sub(a, b));

describe("two-body mechanics", () => {
  it("conserves energy and angular momentum while propagating an eccentric orbit", () => {
    const r0: V3 = [8000, 0, 0], v0: V3 = [0, 8.2, 1.5], mu = GM.earth;
    const e0 = energy(r0, v0, mu);
    for (const dt of [600, 5000, 40000, 3e5]) { const s = propagate(r0, v0, mu, dt); expect(Math.abs(energy(s.r, s.v, mu) - e0) / Math.abs(e0)).toBeLessThan(1e-8); }
  });
  it("returns to the start after exactly one period", () => {
    const r0: V3 = [7000, 0, 0], v0: V3 = [0, Math.sqrt(GM.earth / 7000), 0], T = 2 * Math.PI * Math.sqrt(7000 ** 3 / GM.earth);
    expect(dist(propagate(r0, v0, GM.earth, T).r, r0)).toBeLessThan(1e-3);
  });
  it("Lambert reproduces the classic Earth–Mars Hohmann transfer (circular coplanar)", () => {
    const r1: V3 = [AU_KM, 0, 0], r2: V3 = [-1.523679 * AU_KM, 0, 0], a = (1 + 1.523679) / 2 * AU_KM, tof = Math.PI * Math.sqrt(a ** 3 / GM.sun);
    expect(tof / DAY_S).toBeGreaterThan(257); expect(tof / DAY_S).toBeLessThan(261);
    // a perfectly collinear pair is degenerate for Lambert: tilt the arrival point by 0.01°
    const t = 0.01 * Math.PI / 180, r2t: V3 = [r2[0] * Math.cos(t), -r2[0] * Math.sin(t) * -1, 0];
    const L = lambert(r1, r2t, tof, GM.sun)!; expect(L).not.toBeNull();
    const vEarth = Math.sqrt(GM.sun / AU_KM); expect(Math.abs(norm(L.v1) - vEarth - 2.94)).toBeLessThan(0.1); // v_inf ≈ 2.94 km/s
  });
  it("Lambert velocities propagate to the target position", () => {
    const r1: V3 = [1.4e8, 2e7, 1e5], r2: V3 = [-3e7, 2.1e8, 3e6], tof = 250 * DAY_S, L = lambert(r1, r2, tof, GM.sun)!;
    expect(dist(propagate(r1, L.v1, GM.sun, tof).r, r2)).toBeLessThan(5);
  });
  it("circular orbit state has the right radius, speed, period and inclination", () => {
    const o = { primary: "earth" as const, altitudeKm: 420, inclinationDeg: 51.6, raanDeg: 40, argLatDeg0: 0, pole: EARTH_POLE };
    const s = circularState(o, 1234), T = circularPeriodS(o);
    expect(norm(s.r)).toBeCloseTo(RADIUS.earth + 420, 3); expect(norm(s.v)).toBeCloseTo(Math.sqrt(GM.earth / (RADIUS.earth + 420)), 5);
    expect(T / 60).toBeGreaterThan(92); expect(T / 60).toBeLessThan(93);
    expect(dist(circularState(o, T).r, circularState(o, 0).r)).toBeLessThan(1e-3);
    const h = [0, 1, 2].map((i) => (i === 0 ? s.r[1] * s.v[2] - s.r[2] * s.v[1] : i === 1 ? s.r[2] * s.v[0] - s.r[0] * s.v[2] : s.r[0] * s.v[1] - s.r[1] * s.v[0])) as V3;
    expect(Math.acos(dot(h, EARTH_POLE) / norm(h)) * 180 / Math.PI).toBeCloseTo(51.6, 3);
  });
  it("poles: Earth is tilted 23.44° from the ecliptic pole; Mars ≈ 26.7° (25.2° obliquity + 1.85° orbit inclination)", () => {
    expect(Math.acos(EARTH_POLE[2]) * 180 / Math.PI).toBeCloseTo(23.4393, 3);
    const mt = Math.acos(MARS_POLE[2]) * 180 / Math.PI; expect(mt).toBeGreaterThan(25.5); expect(mt).toBeLessThan(27.5); /* 25.19° to its orbit normal + 1.85° orbit inclination */
  });
});

describe("ephemeris", () => {
  it("declares source, frame and units", () => {
    expect(EPHEMERIS_META.source).toMatch(/astronomy-engine/); expect(EPHEMERIS_META.frame).toMatch(/J2000/); expect(EPHEMERIS_META.units.position).toBe("km");
  });
  it("gives physically sensible positions and never extrapolates", () => {
    const t = Date.parse("2031-11-09T00:00:00Z"), e = ephemerisState("earth", t)!, m = ephemerisState("mars", t)!, mo = ephemerisState("moon", t)!;
    expect(norm(e.r) / AU_KM).toBeGreaterThan(0.983); expect(norm(e.r) / AU_KM).toBeLessThan(1.017);
    expect(norm(m.r) / AU_KM).toBeGreaterThan(1.38); expect(norm(m.r) / AU_KM).toBeLessThan(1.67);
    expect(norm(mo.r)).toBeGreaterThan(356000); expect(norm(mo.r)).toBeLessThan(407000);
    expect(norm(e.v)).toBeGreaterThan(29.2); expect(norm(e.v)).toBeLessThan(30.4);
    expect(Math.abs(e.r[2]) / norm(e.r)).toBeLessThan(1e-3); // Earth lies in the ecliptic
    expect(ephemerisState("earth", Date.parse("2020-01-01T00:00:00Z"))).toBeNull();
    expect(ephemerisState("moon", ephemerisRange("moon")[1] + 86400000)).toBeNull();
  });
  it("Hermite interpolation is consistent with its own velocity (finite difference)", () => {
    const t = Date.parse("2031-11-09T07:13:00Z"), a = ephemerisState("moon", t - 1000)!, b = ephemerisState("moon", t + 1000)!, c = ephemerisState("moon", t)!;
    for (let k = 0; k < 3; k++) expect(Math.abs((b.r[k] - a.r[k]) / 2 - c.v[k])).toBeLessThan(1e-3 * Math.max(1, Math.abs(c.v[k])));
  });
});

describe("mission trajectories", () => {
  it("each mission uses its category, and all points are finite and inside the ephemeris range", () => {
    const cats: Record<string, string> = { "NOX-01": "earth-mars-transfer", "NOX-02": "lunar-transfer", "NOX-03": "earth-orbit", "NOX-04": "mars-orbit" };
    for (const m of MISSIONS) {
      const tr = trajectoryFor(m.id); expect(tr.category).toBe(cats[m.id]);
      for (let i = 0; i <= 40; i++) { const p = tr.at(tr.minDay + ((tr.maxDay - tr.minDay) * i) / 40)!; expect(p).not.toBeNull(); [...p.helio, ...p.rel].forEach((v) => expect(Number.isFinite(v)).toBe(true)); }
      expect(tr.assumptions.length).toBeGreaterThan(0); expect(tr.metrics.length).toBeGreaterThan(0);
    }
  });
  it("the Earth–Mars transfer departs from Earth and arrives at Mars at the modeled epochs", () => {
    const tr = trajectoryFor("NOX-01"), moi = tr.checkpoints.find((c) => c.id === "moi")!, tmi = tr.checkpoints.find((c) => c.id === "tmi")!;
    const ms = (d: number) => tr.epochMs + (d - 1) * 86400000;
    expect(dist(tr.at(tmi.plannedDay)!.helio, ephemerisState("earth", ms(tmi.plannedDay))!.r)).toBeLessThan(10);
    const arr = tr.at(moi.plannedDay - 1e-6)!, mars = ephemerisState("mars", ms(moi.plannedDay))!;
    expect(dist(arr.helio, mars.r)).toBeLessThan(2e4); // km, ~1e-4 AU after Lambert + propagation
    expect(tr.at(moi.plannedDay + 3)!.phase).toBe("Mars orbit");
    const sol = marsTransferSolution(tr.epochMs); expect(sol.tof).toBeGreaterThan(200); expect(moi.plannedDay).toBe(1 + sol.tof);
  });
  it("the transfer stays Sun-bound between roughly Earth's and Mars's orbital radii", () => {
    const tr = trajectoryFor("NOX-01");
    for (const p of tr.samples(60, 1, tr.pathEndDay - 1e-6)) { const r = norm(p.helio) / AU_KM; expect(r).toBeGreaterThan(0.9); expect(r).toBeLessThan(1.75); }
  });
  it("the lunar transfer starts in a 185 km parking orbit and reaches the Moon at LOI", () => {
    const tr = trajectoryFor("NOX-02"), loi = tr.checkpoints.find((c) => c.id === "loi")!, soi = tr.checkpoints.find((c) => c.id === "soi")!;
    expect(norm(tr.at(1)!.rel)).toBeCloseTo(RADIUS.earth + 185, 0);
    const p = tr.at(loi.plannedDay - 1e-6)!; expect(norm(p.moonRel!)).toBeLessThan(500); // aimed at the lunar centre (patched conic)
    expect(norm(tr.at(soi.plannedDay)!.moonRel!)).toBeCloseTo(LUNAR_SOI_KM, -3);
    expect(loi.plannedDay - 1).toBeGreaterThan(4); expect(loi.plannedDay - 1).toBeLessThan(5.6);
    expect(tr.at(loi.plannedDay + 1)!.phase).toBe("Lunar orbit");
  });
  it("LEO and Mars orbit stay at their altitude about the right primary", () => {
    for (const [id, R, alt] of [["NOX-03", RADIUS.earth, 420], ["NOX-04", RADIUS.mars, 500]] as const) {
      const tr = trajectoryFor(id); for (const d of [1, 33.3, 120.7]) expect(norm(tr.at(d)!.rel)).toBeCloseTo(R + alt, 2);
    }
    const e = ephemerisState("earth", trajectoryFor("NOX-03").epochMs + 57 * 86400000)!;
    expect(dist(trajectoryFor("NOX-03").at(58)!.helio, e.r)).toBeLessThan(7000);
  });
  it("positions are time-consistent: the same mission day always yields the same position", () => {
    for (const m of MISSIONS) { const tr = trajectoryFor(m.id), a = tr.at(m.vehicle.day)!, b = tr.at(m.vehicle.day)!; expect(a.helio).toEqual(b.helio); }
  });
  it("checkpoints are never marked completed in the future and all lie on the modeled path", () => {
    for (const m of MISSIONS) {
      const tr = trajectoryFor(m.id);
      for (const c of tr.checkpoints) {
        expect(checkpointStatus(m, c)).toBe(c.plannedDay <= m.vehicle.day ? "Completed" : "Upcoming");
        expect(c.actualDay).toBeNull(); // no actual times exist for fictional missions
        expect(tr.at(c.plannedDay)).not.toBeNull();
      }
    }
    expect(checkpointStatus(missionById("NOX-02")!, trajectoryFor("NOX-02").checkpoints.find((c) => c.id === "loi")!)).toBe("Upcoming");
  });
  it("all missions share one calendar 'now' (2031-11-09)", () => {
    for (const m of MISSIONS) expect(new Date(Date.parse(m.startDate + "T00:00:00Z") + (m.vehicle.day - 1) * 86400000).toISOString().slice(0, 10)).toBe("2031-11-09");
  });
});

describe("display scaling", () => {
  it("compression is monotonic, direction-preserving and maps the surface to the display radius", () => {
    const f = (d: number) => norm(compress([d, 0, 0], "earth"));
    expect(f(RADIUS.earth)).toBeCloseTo(DISPLAY.bodyRadius, 6);
    let prev = 0; for (const d of [7000, 10000, 40000, 384400]) { const x = f(d); expect(x).toBeGreaterThan(prev); prev = x; }
    const v = compress([3e5, 4e5, 0], "earth"); expect(v[0] / v[1]).toBeCloseTo(0.75, 9);
  });
});
