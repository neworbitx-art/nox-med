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
    expect(MISSIONS.filter((m) => m.hasCrewData)).toHaveLength(1);
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
  it("never fabricates telemetry for missions without it", () => {
    for (const m of MISSIONS.filter((x) => x.id !== ACTIVE_MISSION_ID)) {
      const h = shipHealthFor(m);
      expect(h.overall).toBe("unknown");
      expect(h.readings.every((r) => r.value === null && r.status === "unknown")).toBe(true);
      expect(h.warnings).toEqual([]);
      expect(h.snapshot.timestamp).toBeNull();
    }
  });
  it("overview systems: cardiovascular, respiratory and hematological are functional; the rest are marked future", () => {
    expect(OVERVIEW_SYSTEMS).toHaveLength(9);
    expect(OVERVIEW_SYSTEMS.filter((s) => s.atlas).map((s) => s.id)).toEqual(["cardiovascular", "respiratory", "blood"]);
    for (const id of ["cardiovascular", "respiratory", "blood", "metabolic", "endocrine"] as const) expect(SYSTEM_LINKS[id]?.length).toBeGreaterThan(0);
  });
});
