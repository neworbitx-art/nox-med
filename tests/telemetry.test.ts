import { describe, expect, it } from "vitest";
import { baseLabs, baseVitals, environment, exerciseEvents, hourlyEnv, elapsedDays } from "@/lib/data";
import { ENV_VARS, alignLabs, cabinBloodAssociation, co2FractionPct, co2Ppm, envPoints, envSeries, missingIntervals, nearest, o2PartialMmhg, standardize, windowStat } from "@/lib/telemetry";
import { pearson, spearman } from "@/lib/analysis";
import type { LabResult } from "@/lib/types";

describe("unit conversions keep partial pressure, percent and ppm distinct", () => {
  it("converts cabin CO₂ partial pressure to equivalent % and ppm", () => {
    expect(co2FractionPct(2.7, 101.3)).toBeCloseTo(0.355, 3);
    expect(co2Ppm(2.7, 101.3)).toBeCloseTo(3553, -1);
  });
  it("calculates O₂ partial pressure from fraction × total pressure", () => {
    expect(o2PartialMmhg(20.9, 101.3)).toBeCloseTo(158.8, 1);
  });
  it("labels derived quantities and never calls cabin CO₂ blood pCO₂", () => {
    expect(ENV_VARS.o2pp.derived).toBe(true);
    expect(ENV_VARS.co2.note).toMatch(/not blood pCO₂/);
    expect(ENV_VARS.dose.note).toMatch(/NOT imputed/);
  });
});

describe("hourly environmental dataset", () => {
  it("is deterministic, simulated-scale and approximately consistent with daily means", () => {
    expect(hourlyEnv.length).toBe(4399);
    const d = 100;
    const hs = hourlyEnv.filter((h) => Math.floor(h.hour / 24) === d - 1);
    const m = hs.reduce((s, h) => s + (h.co2Mmhg as number), 0) / hs.length;
    expect(Math.abs(m - environment[d - 1].co2Mmhg)).toBeLessThan(0.1);
  });
  it("contains real gaps: whole-telemetry outage and CO₂-only sensor outage", () => {
    const hours = new Set(hourlyEnv.map((h) => h.hour));
    expect(hours.has(60 * 24 + 10)).toBe(false);
    expect(hourlyEnv.some((h) => h.co2Mmhg === null && h.pressureKpa !== null)).toBe(true);
  });
  it("never imputes missing data in series output", () => {
    const s = envSeries("co2", 61, 62, "hourly");
    expect(s.length).toBeLessThan(24);
    const gaps = missingIntervals(s, 1 / 24, 61, 62);
    expect(gaps.length).toBeGreaterThan(0);
  });
  it("requires ≥12 recorded hours for a daily mean", () => {
    expect(envSeries("co2", 61, 61.999, "hourly")).toHaveLength(24 - 17);
    expect(envSeries("co2", 61, 61.999, "daily")).toHaveLength(0);
    expect(envSeries("co2", 62, 62.999, "daily")).toHaveLength(1);
  });
  it("accumulates radiation dose only over recorded hours (monotonic)", () => {
    const d = envPoints().map((p) => p.v.dose).filter((x): x is number => x !== null);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
    expect(d[d.length - 1]).toBeGreaterThan(3);
  });
  it("shows the simulated solar particle event around day 122", () => {
    expect(Math.max(...hourlyEnv.filter((h) => Math.floor(h.hour / 24) === 121).map((h) => h.radiationUSvH as number))).toBeGreaterThan(200);
  });
});

describe("wearables and exercise", () => {
  it("has the new wearable fields on every record", () => {
    for (const v of baseVitals) {
      expect(v.meanHr).toBeGreaterThan(v.restingHr);
      expect(v.maxHr).toBeGreaterThanOrEqual(v.meanHr);
      expect(v.activeMin).toBeGreaterThanOrEqual(v.exerciseMin);
      expect(v.origin).toBe("simulated");
    }
  });
  it("logs exercise only on days with a wearable record and sums to exerciseMin", () => {
    const days = new Set(baseVitals.map((v) => `${v.astronautId}-${v.missionDay}`));
    for (const e of exerciseEvents) expect(days.has(`${e.astronautId}-${e.missionDay}`)).toBe(true);
    const v = baseVitals[100];
    const sum = exerciseEvents.filter((e) => e.astronautId === v.astronautId && e.missionDay === v.missionDay).reduce((s, e) => s + e.durationMin, 0);
    expect(sum).toBe(v.exerciseMin);
  });
  it("keeps A-02's device outage visible as missing days", () => {
    const d = baseVitals.filter((v) => v.astronautId === "A-02" && v.missionDay >= 150 && v.missionDay <= 155);
    expect(d).toHaveLength(0);
  });
});

describe("laboratory synchronization", () => {
  const mine = baseLabs.filter((l) => l.astronautId === "A-03");
  const rows = alignLabs(mine, baseVitals, exerciseEvents);
  it("aligns every lab collection timestamp to cabin telemetry windows", () => {
    expect(rows).toHaveLength(mine.length);
    const last = rows[rows.length - 1];
    expect(last.t).toBeCloseTo(elapsedDays(last.lab.collectedAt), 6);
    expect(last.mean24.coverage).toBeGreaterThan(0.9);
    expect(last.mean24.mean).toBeGreaterThan(3.5);
  });
  it("reports low coverage rather than a misleading mean when telemetry is missing", () => {
    const fake: LabResult = { ...mine[0], id: "X", collectedAt: new Date(Date.parse("2031-05-10T00:00:00Z") + 60 * 86400000 + 12 * 3600000).toISOString() };
    const r = alignLabs([fake], baseVitals, [])[0];
    expect(r.cabinAt).toBeNull();
    expect(r.mean24.coverage).toBeLessThan(0.75);
  });
  it("detects exercise within 6 h before collection", () => {
    const ev = exerciseEvents.find((e) => e.astronautId === "A-01")!;
    const lab: LabResult = { ...baseLabs[0], astronautId: "A-01", collectedAt: new Date(Date.parse(ev.startedAt) + (ev.durationMin + 45) * 60000).toISOString() };
    const r = alignLabs([lab], baseVitals, exerciseEvents)[0];
    expect(r.exercise?.minutesBefore).toBe(45);
  });
  it("computes cabin–blood pCO₂ association from reliable samples and returns null with too few", () => {
    const a = cabinBloodAssociation(rows)!;
    expect(a.n).toBeGreaterThan(20);
    expect(a.pearson).toBeGreaterThan(0.3);
    expect(cabinBloodAssociation(rows.slice(0, 3))).toBeNull();
  });
});

describe("statistics helpers", () => {
  it("pearson and spearman", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [1, 8, 27, 64])).toBeCloseTo(1);
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
  it("standardizes against a baseline and finds nearest points only within the allowed gap", () => {
    expect(standardize([{ t: 1, v: 12 }], { mean: 10, sd: 2 })[0].v).toBe(1);
    const pts = [{ t: 1, v: 1 }, { t: 2, v: 2 }];
    expect(nearest(pts, 1.1, 0.2)?.v).toBe(1);
    expect(nearest(pts, 1.5, 0.2)).toBeNull();
  });
  it("window statistics report coverage", () => {
    const w = windowStat("co2", 100, 101);
    expect(w.coverage).toBeCloseTo(1, 1);
  });
});
