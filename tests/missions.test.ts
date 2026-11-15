import { DATASETS } from "@/lib/data";
import { describe, expect, it } from "vitest";
import { ACTIVE_MISSION_ID, MISSIONS, levelOf, missionById, shipHealthFor, worst } from "@/lib/missions";
import { checkpointsOf, trajectoryFor } from "@/lib/trajectory";
import { OVERVIEW_SYSTEMS } from "@/lib/crewprofile";
import { SYSTEM_LINKS } from "@/lib/anatomy";

describe("missions", () => {
  it("has multiple unique missions and one active session mission", () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
    expect(missionById(ACTIVE_MISSION_ID)?.hasCrewData).toBe(true);
    expect(MISSIONS.every((m) => m.hasCrewData)).toBe(true); // NOX-02..04 carry labelled synthetic datasets
  });
  it("every mission has required fields", () => {
    for (const m of MISSIONS) {
      expect(m.name && m.code && m.destinationLabel).toBeTruthy();
      expect(m.crew.length).toBeGreaterThan(0);
      expect(checkpointsOf(m.id).length).toBeGreaterThan(0);
      expect(m.vehicle.id && m.startDate && m.dataSource).toBeTruthy();
      const tr = trajectoryFor(m.id);
      tr.at(m.vehicle.day)!.helio.forEach((v) => expect(Number.isFinite(v)).toBe(true));
      checkpointsOf(m.id).forEach((c) => { expect(c.plannedDay).toBeGreaterThanOrEqual(tr.minDay); expect(c.plannedDay).toBeLessThanOrEqual(tr.maxDay); tr.at(c.plannedDay)!.helio.forEach((v) => expect(Number.isFinite(v)).toBe(true)); });
    }
  });
  it("classifies ship readings by band", () => {
    expect(levelOf("co2", 3)).toBe("nominal");
    expect(levelOf("co2", 4.6)).toBe("watch");
    expect(levelOf("co2", 5.5)).toBe("warning");
    expect(levelOf("co2", 8)).toBe("critical");
    expect(levelOf("o2", 19)).toBe("warning");
    expect(levelOf("co2", null)).toBe("unknown");
    expect(worst(["unknown", "unknown"])).toBe("unknown");
    expect(worst(["unknown", "watch"])).toBe("watch");
    expect(worst(["nominal", "warning", "watch"])).toBe("warning");
  });
  it("computes ship health with all required readings and subsystems", () => {
    for (const m of MISSIONS) {
      const h = shipHealthFor(m);
      expect(h.readings.map((r) => r.key)).toEqual(["co2", "o2", "pressure", "temp", "humidity", "radiation"]);
      expect(h.subsystems.map((s) => s.key)).toEqual(expect.arrayContaining(["power", "comms", "scrubber", "structure"]));
      expect(h.snapshot.live).toBe(false);
    }
    const a = shipHealthFor(missionById(ACTIVE_MISSION_ID)!);
    expect(a.overall).toBe("watch");
    expect(a.readings.every((r) => r.value !== null)).toBe(true);
  });
  it("non-NOX-01 missions use labelled synthetic datasets, not NOX-01 records", () => {
    for (const m of MISSIONS.filter((x) => x.id !== ACTIVE_MISSION_ID)) {
      const h = shipHealthFor(m);
      expect(h.snapshot.source).toMatch(/Synthetic/);
      expect(m.dataSource).toMatch(/Synthetic/);
      expect(DATASETS[m.id].mission.dataNotice).toMatch(/SYNTHETIC/);
      const ids = new Set(DATASETS[m.id].astronauts.map((a) => a.id));
      expect(DATASETS[m.id].labs.every((l) => ids.has(l.astronautId) && l.origin === "simulated")).toBe(true);
      expect(m.crew.every((c) => c.astronautId && ids.has(c.astronautId))).toBe(true);
    }
  });
  it("crew health drifts with time in long missions (hematocrit down, sleep down for the stressed crew member)", () => {
    const d = DATASETS["NOX-04"], hct = (id: string, from: number, to: number) => { const v = d.labs.filter((l) => l.astronautId === id && l.missionDay >= from && l.missionDay <= to && l.verification !== "rejected").map((l) => l.values.Hct!); return v.reduce((x, y) => x + y, 0) / v.length; };
    expect(hct("R-02", 1, 20) - hct("R-02", 190, 211)).toBeGreaterThan(3);
    const sl = (from: number, to: number) => { const v = d.vitals.filter((x) => x.astronautId === "R-02" && x.missionDay >= from && x.missionDay <= to).map((x) => x.sleepHours); return v.reduce((x, y) => x + y, 0) / v.length; };
    expect(sl(1, 60) - sl(180, 211)).toBeGreaterThan(0.8);
  });
  it("overview systems: cardiovascular, respiratory and hematological are functional; the rest are marked future", () => {
    expect(OVERVIEW_SYSTEMS).toHaveLength(9);
    expect(OVERVIEW_SYSTEMS.filter((s) => s.atlas).map((s) => s.id)).toEqual(["cardiovascular", "respiratory", "blood"]);
    for (const id of ["cardiovascular", "respiratory", "blood", "metabolic", "endocrine"] as const) expect(SYSTEM_LINKS[id]?.length).toBeGreaterThan(0);
  });
});
