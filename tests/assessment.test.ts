import { describe, expect, it } from "vitest";
import { DATASETS } from "@/lib/data";
import {
  assessmentObservations, changeSummary, createReview, createSymptom, loadAssessment, measurementRows, reviewStatus, reviewsFor,
  saveAssessment, symptomsFor, vitalRows, acidBaseCalcs, ROLE_ACTIONS, type ReviewEntry, type SymptomReport,
} from "@/lib/assessment";

const d1 = DATASETS["NOX-01"];
const A = d1.astronauts[0].id, B = d1.astronauts[1].id;
const ctx = (n = 1) => ({ currentDay: 100, now: `2031-01-01T00:00:0${n}Z`, id: `X${n}` });
const sym = (o: Partial<Parameters<typeof createSymptom>[0]> = {}) => createSymptom({ missionId: "NOX-01", astronautId: A, symptom: "Headache", onsetDay: 50, severity: "mild", ...o }, ctx());
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("symptom documentation", () => {
  it("accepts a valid report and trims text", () => { const r = sym({ symptom: "  Nausea " }); expect(r.ok && r.value.symptom).toBe("Nausea"); });
  it("rejects empty, over-long, bad onset and bad severity", () => {
    expect(sym({ symptom: " " }).ok).toBe(false);
    expect(sym({ symptom: "x".repeat(121) }).ok).toBe(false);
    expect(sym({ onsetDay: 0 }).ok).toBe(false);
    expect(sym({ onsetDay: 101 }).ok).toBe(false);
    expect(sym({ onsetDay: 1.5 }).ok).toBe(false);
    expect(sym({ severity: "huge" as never }).ok).toBe(false);
  });
  it("scopes by mission and astronaut", () => {
    const a = (sym().ok ? (sym() as { value: SymptomReport }).value : null)!;
    const all = [a, { ...a, id: "2", astronautId: B }, { ...a, id: "3", missionId: "NOX-02" }];
    expect(symptomsFor(all, "NOX-01", A).map((s) => s.id)).toEqual([a.id]);
  });
  it("never touches lab data", () => {
    const before = JSON.stringify(d1.labs); sym(); expect(JSON.stringify(d1.labs)).toBe(before);
  });
});

describe("review documentation", () => {
  const base = { missionId: "NOX-01", astronautId: A, observationId: "o1", observationTitle: "t", sampleId: "s1", validity: "valid" as const };
  it("enforces role actions", () => {
    expect(createReview({ ...base, action: "reviewed", by: "astronaut" }, { now: "t", id: "1" }).ok).toBe(false);
    expect(createReview({ ...base, action: "acknowledge", by: "medical-officer" }, { now: "t", id: "1" }).ok).toBe(false);
    expect(ROLE_ACTIONS.astronaut).toContain("request-review");
  });
  it("status follows the latest action and stays per observation", () => {
    const mk = (id: string, action: ReviewEntry["action"], by: ReviewEntry["by"], at: string, obs = "o1") => { const r = createReview({ ...base, observationId: obs, action, by }, { now: at, id }); if (!r.ok) throw new Error(r.errors.join()); return r.value; };
    const log = [mk("1", "request-review", "astronaut", "2031-01-01T01"), mk("2", "reviewed", "medical-officer", "2031-01-01T02"), mk("3", "acknowledge", "astronaut", "2031-01-01T03", "o2")];
    expect(reviewStatus(log, "o1").status).toBe("reviewed");
    expect(reviewStatus(log, "o2").status).toBe("acknowledged");
    expect(reviewStatus(log, "o3").status).toBe("none");
    expect(reviewsFor(log, "NOX-02", A)).toHaveLength(0);
  });
  it("rejects over-long notes", () => { expect(createReview({ ...base, action: "acknowledge", by: "astronaut", note: "x".repeat(501) }, { now: "t", id: "1" }).ok).toBe(false); });
});

describe("persistence round trip", () => {
  it("saves and reloads, and drops corrupt entries", () => {
    const st = mem(); const s = (sym() as { value: SymptomReport }).value;
    saveAssessment(st, { symptoms: [s], reviews: [] });
    expect(loadAssessment(st).symptoms).toEqual([s]);
    st.setItem("nox.symptoms", JSON.stringify([s, { junk: 1 }])); expect(loadAssessment(st).symptoms).toHaveLength(1);
    st.setItem("nox.symptoms", "{not json"); expect(loadAssessment(st).symptoms).toEqual([]);
  });
});

describe("measurements and observations per astronaut", () => {
  it("rows come from that astronaut's own latest sample only", () => {
    for (const id of [A, B]) {
      const { sample, rows } = measurementRows(d1.labs, id);
      expect(sample?.astronautId).toBe(id);
      for (const r of rows) if (r.sampleId) expect(r.sampleId).toBe(sample!.id);
    }
  });
  it("missing analytes are shown as not measured, never filled in", () => {
    const l = d1.labs.filter((x) => x.astronautId === A).slice(-1)[0];
    const stripped = { ...l, values: { ...l.values } }; delete (stripped.values as Record<string, number>).Lac;
    const { rows } = measurementRows([stripped], A);
    const r = rows.find((x) => x.key === "Lac")!; expect(r.value).toBeNull(); expect(r.quality).toBe("not-measured");
  });
  it("NaN values are treated as missing", () => {
    const l = d1.labs.filter((x) => x.astronautId === A).slice(-1)[0];
    const bad = { ...l, values: { ...l.values, Lac: NaN } };
    expect(measurementRows([bad], A).rows.find((x) => x.key === "Lac")!.quality).toBe("not-measured");
  });
  it("no labs for an astronaut gives an empty result", () => { expect(measurementRows([], A).sample).toBeNull(); expect(assessmentObservations([], A).observations).toEqual([]); });
  it("observations belong to the astronaut and are deterministic", () => {
    const o1 = assessmentObservations(d1.labs, A).observations, o2 = assessmentObservations(d1.labs, A).observations;
    expect(o1.map((o) => o.id)).toEqual(o2.map((o) => o.id));
    for (const o of o1) expect(o.astronautId).toBe(A);
  });
  it("change summary uses plain wording", () => { for (const c of changeSummary(measurementRows(d1.labs, A).rows, 0)) expect(c.text).toMatch(/higher|lower/); });
  it("calculations are only produced for interpretable inputs", () => {
    const l = d1.labs.filter((x) => x.astronautId === A).slice(-1)[0];
    for (const c of acidBaseCalcs(l)) expect(c.value === null || typeof c.value === "string").toBe(true);
  });
});

describe("missions never mix", () => {
  it("each mission dataset yields only its own crew", () => {
    for (const [id, d] of Object.entries(DATASETS)) {
      const ids = new Set(d.astronauts.map((a) => a.id));
      for (const l of d.labs) expect(ids.has(l.astronautId), id).toBe(true);
    }
  });
  it("wearable rows use only the given astronaut", () => {
    const v = vitalRows(d1.vitals, A); expect(v.length).toBeGreaterThan(0);
    expect(vitalRows([], A).every((r) => r.value === null)).toBe(true);
  });
});
