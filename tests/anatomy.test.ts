import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STRUCTURES, STRUCTURE_BY_ID, CARDIO_LINKS, GROUP_FOCUS, GROUPS } from "@/lib/anatomy";
import { DEMO_RECORDS, recordsForSystem, episodesFor, SYSTEMS, PORTRAITS, type MedicalRecord } from "@/lib/crewprofile";
import { buildRows } from "@/components/anatomy/PhysiologicalDataPanel";
import { baseLabs } from "@/lib/data";

function glbNodeNames(): string[] {
  const b = readFileSync("public/models/cardiovascular.glb");
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
  return json.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined).map((n: { name: string }) => n.name);
}

describe("anatomy catalog", () => {
  it("matches the GLB meshes exactly", () => {
    const names = glbNodeNames().sort();
    expect(names).toHaveLength(26);
    expect(names).toEqual(STRUCTURES.map((s) => s.id).sort());
  });
  it("has groups and unique ids", () => {
    expect(new Set(STRUCTURES.map((s) => s.id)).size).toBe(STRUCTURES.length);
    GROUPS.forEach((g) => expect(STRUCTURES.some((s) => s.group === g)).toBe(true));
    expect(STRUCTURE_BY_ID["left-ventricle"].group).toBe("Heart chambers");
  });
  it("links all required measurements", () => {
    const keys = CARDIO_LINKS.map((l) => l.lab ?? l.vital);
    ["restingHr", "systolic", "diastolic", "tHb", "Hct", "pO2", "sO2", "pH", "pCO2", "Lac", "K", "iCa"].forEach((k) => expect(keys).toContain(k));
    Object.values(GROUP_FOCUS).flat().forEach((k) => expect(keys).toContain(k));
  });
  it("only cardiovascular has an atlas", () => {
    expect(SYSTEMS.filter((s) => s.atlas).map((s) => s.id)).toEqual(["cardiovascular"]);
  });
});

describe("linked records", () => {
  const recs: MedicalRecord[] = DEMO_RECORDS.map((r, i) => ({ ...r, id: `r${i}` }));
  it("filters by astronaut and system", () => {
    for (const id of ["A-01", "A-02", "A-03", "A-04"] as const) {
      recordsForSystem(recs, id, "cardiovascular").forEach((r) => expect(r.astronautId).toBe(id));
    }
    expect(recordsForSystem([], "A-01", "cardiovascular")).toEqual([]);
  });
  it("all records are fictional", () => { recs.forEach((r) => expect(r.fictional).toBe(true)); });
  it("switching astronaut changes data rows", () => {
    const a = buildRows("A-01", baseLabs, CARDIO_LINKS), b = buildRows("A-02", baseLabs, CARDIO_LINKS);
    expect(a.map((r) => r.text).join()).not.toBe(b.map((r) => r.text).join());
  });
});

describe("portraits and episodes", () => {
  it("has one portrait per astronaut", () => { expect(PORTRAITS.map((p) => p.id).sort()).toEqual(["A-01", "A-02", "A-03", "A-04"]); });
  it("never lists observations for future phases", () => {
    const eps = episodesFor("A-01", 10, 50, 180);
    eps.filter((e) => e.phase === "postflight" || e.phase === "future-assignment" || e.phase === "previous-mission" || e.phase === "preflight").forEach((e) => expect(e.hasObservations).toBe(false));
    expect(eps.find((e) => e.phase === "active-mission")!.hasObservations).toBe(true);
  });
});
