import { describe, expect, it } from "vitest";
import type { LabResult, MetricKey, QcFlag, SampleType } from "@/lib/types";
import { analyzeLabs, paO2FiO2 } from "@/lib/clinical";
import { statusIn, interpretability } from "@/lib/validity";
import { baseLabs, ASTRONAUT_IDS } from "@/lib/data";
import { generateAlerts } from "@/lib/alerts";
import { baseVitals, environment } from "@/lib/data";

const NORMAL: Partial<Record<MetricKey, number>> = { pH: 7.4, pCO2: 40, pO2: 92, sO2: 97, FO2Hb: 95.5, tHb: 14.5, Hct: 43.5, COHb: 0.8, MetHb: 0.6, Na: 140, K: 4.2, iCa: 1.22, Cl: 103, Glu: 90, Lac: 1.0, HCO3: 24.5, BE: 0 };
let n = 0;
function lab(values: Partial<Record<MetricKey, number>>, o: Partial<LabResult> & { type?: SampleType; flags?: QcFlag[] } = {}): LabResult {
  n++;
  const day = o.missionDay ?? n;
  return { id: `T-${n}`, astronautId: "A-01", missionDay: day, collectedAt: new Date(Date.UTC(2031, 4, 10 + day - 1, 8)).toISOString(), sampleType: o.type ?? "arterial", analyzer: "test", origin: "simulated",
    verification: "verified", qcFlags: o.flags ?? [], values: { ...NORMAL, ...values }, ...o };
}
const history = (count = 14, v: Partial<Record<MetricKey, number>> = {}) => Array.from({ length: count }, (_, i) => lab(v, { missionDay: i + 1 }));
const titles = (l: LabResult[], id?: string) => analyzeLabs(l, id).map((o) => o.title);
const find = (l: LabResult[], domain: string) => analyzeLabs(l).filter((o) => o.domain === domain);

describe("acid-base rules", () => {
  it("normal sample yields only an info observation", () => {
    const o = analyzeLabs([lab({})]);
    expect(o.map((x) => x.severity)).toEqual(["info"]);
  });
  it("flags respiratory acidosis with expected compensation range", () => {
    const o = find([lab({ pH: 7.3, pCO2: 55, HCO3: 26.5 })], "acid-base")[0];
    expect(o.title).toMatch(/respiratory acidosis/);
    expect(o.reasons.join(" ")).toMatch(/Expected HCO₃⁻/);
    expect(o.calculated).toContain("HCO3");
    expect(o.title).toMatch(/possible/i);
  });
  it("detects metabolic acidosis and applies Winter's formula", () => {
    const o = find([lab({ pH: 7.25, pCO2: 28, HCO3: 12 })], "acid-base")[0];
    expect(o.title).toMatch(/metabolic acidosis/);
    expect(o.reasons.join(" ")).toMatch(/Winter/);
    expect(o.reasons.join(" ")).toMatch(/within expected compensation/);
  });
  it("flags inadequate respiratory compensation as additional respiratory acidosis", () => {
    const o = find([lab({ pH: 7.1, pCO2: 38, HCO3: 11.5 })], "acid-base")[0];
    expect(o.reasons.join(" ")).toMatch(/additional respiratory acidosis/);
    expect(o.severity).toBe("critical");
  });
  it("detects mixed acidosis", () => {
    expect(find([lab({ pH: 7.17, pCO2: 55, HCO3: 19.9 })], "acid-base")[0].title).toMatch(/mixed respiratory and metabolic acidosis/);
  });
  it("detects respiratory and metabolic alkalosis", () => {
    expect(find([lab({ pH: 7.55, pCO2: 28, HCO3: 24 })], "acid-base")[0].title).toMatch(/respiratory alkalosis/);
    expect(find([lab({ pH: 7.5, pCO2: 46, HCO3: 36 })], "acid-base")[0].title).toMatch(/metabolic alkalosis/);
  });
  it("reports compensated patterns with normal pH as possible mixed/compensated", () => {
    expect(find([lab({ pH: 7.37, pCO2: 52, HCO3: 29 })], "acid-base")[0].title).toMatch(/compensated respiratory acidosis or metabolic alkalosis/);
  });
  it("flags internally inconsistent pH/pCO₂/HCO₃⁻ instead of interpreting", () => {
    const o = find([lab({ pH: 7.4, pCO2: 40, HCO3: 12 })], "acid-base");
    expect(o[0].title).toMatch(/inconsistent/);
    expect(o).toHaveLength(1);
  });
  it("never labels a result as a definitive diagnosis", () => {
    for (const v of [{ pH: 7.3, pCO2: 55, HCO3: 26.5 }, { pH: 7.25, pCO2: 28, HCO3: 12 }]) {
      const o = find([lab(v)], "acid-base")[0];
      expect(o.uncertainty).toMatch(/not a diagnosis/);
    }
  });
});

describe("sample type and validity", () => {
  it("does not interpret venous pO₂ as oxygenation", () => {
    const l = lab({ pO2: 38, sO2: 68, FO2Hb: 66 }, { type: "venous" });
    expect(interpretability(l, "pO2").ok).toBe(false);
    expect(statusIn(l, "pO2")).toBe("not-interpretable");
    const o = analyzeLabs([l]);
    expect(o.some((x) => x.domain === "oxygenation" && x.title.includes("Low oxygen"))).toBe(false);
    expect(o.some((x) => x.title.includes("Venous sample"))).toBe(true);
  });
  it("uses venous reference intervals for pH and pCO₂", () => {
    const l = lab({ pH: 7.34, pCO2: 48, HCO3: 25.4 }, { type: "venous" });
    expect(statusIn(l, "pCO2")).toBe("normal");
    expect(statusIn(lab({ pCO2: 48 }, { type: "arterial" }), "pCO2")).toBe("out-of-range");
  });
  it("calculates PaO₂/FiO₂ only for arterial samples with FiO₂", () => {
    expect(paO2FiO2(lab({ pO2: 100 }, { type: "venous", fio2: 0.21 })).value).toBeNull();
    expect(paO2FiO2(lab({ pO2: 100 }, { type: "capillary", fio2: 0.21 })).value).toBeNull();
    expect(paO2FiO2(lab({ pO2: 100 }, { type: "arterial" })).value).toBeNull();
    expect(paO2FiO2(lab({ pO2: 100 }, { type: "arterial", fio2: 0.2 })).value).toBeCloseTo(500);
  });
  it("does not interpret gas values when sample type is unknown", () => {
    const o = analyzeLabs([lab({ pH: 7.2, pCO2: 60, HCO3: 24 }, { type: "unknown" })]);
    expect(o.some((x) => x.domain === "acid-base")).toBe(false);
    expect(o.some((x) => x.title.includes("Sample type unknown"))).toBe(true);
  });
  it("treats QC-flagged hemolysis K⁺ as unreliable, not confirmed hyperkalemia", () => {
    const l = lab({ K: 6.4 }, { flags: [{ code: "HEMOLYSIS", analytes: ["K"], message: "hemolysis" }] });
    expect(statusIn(l, "K")).toBe("unreliable");
    const o = analyzeLabs([l]);
    expect(o.some((x) => x.domain === "electrolyte")).toBe(false);
    const q = o.find((x) => x.domain === "quality" && x.parameters.includes("K"))!;
    expect(q.validity).toBe("unreliable");
    expect(q.severity).toBe("info");
  });
  it("withholds all interpretation for rejected samples", () => {
    const o = analyzeLabs([lab({ pH: 7.1, pCO2: 70, K: 7 }, { verification: "rejected" })]);
    expect(o.every((x) => x.domain === "quality")).toBe(true);
  });
  it("marks arterialized capillary oxygen values as limited validity", () => {
    const o = find([lab({ pO2: 60 }, { type: "capillary" })], "oxygenation")[0];
    expect(o.validity).toBe("limited");
    expect(o.uncertainty).toMatch(/arterial sample needed/);
  });
});

describe("electrolytes, lactate, hemoglobin", () => {
  it("reports hyperkalemia with persistence and baseline context", () => {
    const labs = [...history(12), lab({ K: 5.6 }, { missionDay: 13 }), lab({ K: 5.8 }, { missionDay: 14 })];
    const o = find(labs, "electrolyte")[0];
    expect(o.title).toMatch(/Potassium high/);
    expect(o.reasons.join(" ")).toMatch(/persistent/);
    expect(o.previous).toBeDefined();
  });
  it("detects a rising lactate trend inside the reference interval", () => {
    const labs = [...history(12), lab({ Lac: 1.0 }, { missionDay: 13 }), lab({ Lac: 1.3 }, { missionDay: 14 }), lab({ Lac: 1.5 }, { missionDay: 15 })];
    const o = find(labs, "lactate")[0];
    expect(o.severity).toBe("watch");
    expect(o.reasons.join(" ")).toMatch(/Rising/);
  });
  it("flags elevated and severe lactate", () => {
    expect(find([lab({ Lac: 2.8 })], "lactate")[0].severity).toBe("warning");
    expect(find([lab({ Lac: 5 })], "lactate")[0].severity).toBe("critical");
  });
  it("detects hemoglobin decline from personal baseline", () => {
    const labs = [...history(12), lab({ tHb: 13.6, Hct: 40.8 }, { missionDay: 13 }), lab({ tHb: 13.0, Hct: 39 }, { missionDay: 20 })];
    const o = find(labs, "hemoglobin")[0];
    expect(o.title).toMatch(/Hemoglobin/);
    expect(o.calculated).toContain("Hct");
  });
  it("applies sex-specific hemoglobin intervals", () => {
    const female = lab({ tHb: 12.5 }, { astronautId: "A-02" });
    const male = lab({ tHb: 12.5 }, { astronautId: "A-01" });
    expect(statusIn(female, "tHb")).toBe("normal");
    expect(statusIn(male, "tHb")).toBe("out-of-range");
  });
  it("shows reduced FO₂Hb context when carboxyhemoglobin is raised", () => {
    const o = find([lab({ COHb: 12, FO2Hb: 82 })], "oxygenation").find((x) => x.parameters.includes("COHb"))!;
    expect(o.severity).toBe("critical");
    expect(o.reasons.join(" ")).toMatch(/sO₂ can look normal/);
  });
});

describe("generated dataset", () => {
  it("preserves complete metadata on every lab record", () => {
    for (const l of baseLabs) {
      expect(l.collectedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(["arterial", "venous", "capillary", "unknown"]).toContain(l.sampleType);
      expect(["verified", "pending", "rejected"]).toContain(l.verification);
      expect(l.analyzer).toBeTruthy();
      expect(l.origin).toBe("simulated");
    }
  });
  it("uses irregular sampling intervals, including a long gap", () => {
    const d = baseLabs.filter((l) => l.astronautId === "A-02").map((l) => l.missionDay);
    const gaps = new Set(d.slice(1).map((x, i) => x - d[i]));
    expect(gaps.size).toBeGreaterThan(3);
    expect(Math.max(...gaps)).toBeGreaterThan(15);
  });
  it("is deterministic", () => { expect(baseLabs.length).toBe(188); });
  it("raises no lab alerts from QC-flagged or rejected samples", () => {
    const alerts = generateAlerts(baseLabs, baseVitals, environment, ASTRONAUT_IDS, 184);
    const bad = new Set(baseLabs.filter((l) => l.qcFlags.length || l.verification === "rejected").map((l) => l.id));
    expect(bad.size).toBeGreaterThan(0);
    for (const a of alerts.filter((x) => x.category === "lab")) expect([...bad].some((id) => a.id.includes(id))).toBe(false);
  });
  it("never produces venous-based oxygenation alerts", () => {
    const venous = baseLabs.filter((l) => l.sampleType === "venous").map((l) => l.id);
    const alerts = generateAlerts(baseLabs, baseVitals, environment, ASTRONAUT_IDS, 184);
    for (const a of alerts.filter((x) => x.category === "lab" && ["pO2", "sO2", "FO2Hb"].includes(x.metric ?? ""))) expect(venous.some((id) => a.id.includes(id))).toBe(false);
  });
});
