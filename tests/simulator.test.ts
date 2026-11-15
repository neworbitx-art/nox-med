import { describe, expect, it } from "vitest";
import { SCENARIOS3, buildScenario, summarize, type ScenarioId } from "@/lib/simulator";
import { statusIn } from "@/lib/validity";

const IDS: ScenarioId[] = ["resp", "k", "cal"];
const at = (b: ReturnType<typeof buildScenario>, t: number) => b.samples.find((s) => s.t === t)!.lab;

describe("determinism", () => {
  it.each(IDS)("%s is identical across runs", (id) => {
    const a = buildScenario(id), b = buildScenario(id);
    expect(a.checksum).toBe(b.checksum);
    expect(JSON.stringify(a.samples.map((s) => s.lab))).toBe(JSON.stringify(b.samples.map((s) => s.lab)));
    expect(JSON.stringify(a.alerts)).toBe(JSON.stringify(b.alerts));
  });
  it("scenarios differ from each other", () => { expect(new Set(IDS.map((i) => buildScenario(i).checksum)).size).toBe(3); });
  it("has three scenarios with schedule matching duration", () => {
    expect(SCENARIOS3).toHaveLength(3);
    for (const id of IDS) { const b = buildScenario(id); expect(b.samples.at(-1)!.t).toBe(b.def.durationMin); expect(b.env.at(-1)!.t).toBe(b.def.durationMin); }
  });
});

describe("scenario 1: respiratory deterioration", () => {
  const b = buildScenario("resp");
  it("pCO2 rises, pH falls, HCO3 rises slightly", () => {
    const p0 = at(b, 0).values, p1 = at(b, 270).values;
    expect(p1.pCO2! - p0.pCO2!).toBeGreaterThan(20);
    expect(p0.pH! - p1.pH!).toBeGreaterThan(0.12);
    expect(p1.HCO3! - p0.HCO3!).toBeGreaterThan(1); expect(p1.HCO3! - p0.HCO3!).toBeLessThan(4);
  });
  it("pH, pCO2 and HCO3 stay Henderson–Hasselbalch consistent", () => {
    for (const s of b.samples) { const v = s.lab.values; expect(Math.abs(6.1 + Math.log10(v.HCO3! / (0.0307 * v.pCO2!)) - v.pH!)).toBeLessThan(0.01); }
  });
  it("pO2 falls as pCO2 rises (alveolar gas equation)", () => { expect(at(b, 270).values.pO2!).toBeLessThan(at(b, 0).values.pO2! - 20); });
  it("cabin CO2 rises, peaks, then falls", () => {
    const c = b.env.map((e) => e.co2); const peak = Math.max(...c);
    expect(peak).toBeGreaterThan(6); expect(c[0]).toBeLessThan(4); expect(c.at(-1)!).toBeLessThan(peak - 1.5);
  });
  it("raises cabin, trend, lab and clinical alerts in order, with reasons", () => {
    const cats = new Set(b.alerts.map((a) => a.category));
    for (const c of ["environment", "trend", "lab", "clinical"]) expect(cats.has(c as never)).toBe(true);
    expect(b.alerts.every((a) => a.why.length > 0)).toBe(true);
    expect(b.alerts.some((a) => a.severity === "critical" && a.metric === "pCO2")).toBe(true);
  });
  it("never claims cabin CO2 is the cause", () => {
    const co = b.alerts.find((a) => /coincides/.test(a.title))!;
    expect(co).toBeDefined();
    expect(co.uncertainty).toMatch(/not blood pCO/i); expect(co.uncertainty).toMatch(/does not show/i);
    const text = JSON.stringify([b.alerts, summarize(b, [])]).toLowerCase();
    expect(text).not.toMatch(/caused by (the )?cabin|cabin co₂ (is|was) the cause|proves?/);
    expect(summarize(b, []).findings.join(" ")).toMatch(/does not establish cause/);
  });
});

describe("scenario 2: electrolyte disturbance", () => {
  const b = buildScenario("k");
  it("potassium rises monotonically across sequential samples into the critical range", () => {
    const k = b.samples.map((s) => s.lab.values.K!);
    for (let i = 1; i < k.length; i++) expect(k[i]).toBeGreaterThan(k[i - 1]);
    expect(k[0]).toBeLessThan(4.6); expect(k.at(-1)!).toBeGreaterThan(6.5);
  });
  it("alerts escalate trend → out of range → critical", () => {
    const t = (f: (a: (typeof b.alerts)[0]) => boolean) => b.alerts.find(f)?.t;
    const trend = t((a) => a.category === "trend" && a.metric === "K")!, high = t((a) => a.category === "lab" && a.metric === "K" && a.severity === "warning")!, crit = t((a) => a.category === "lab" && a.metric === "K" && a.severity === "critical")!;
    expect(trend).toBeLessThanOrEqual(high); expect(high).toBeLessThan(crit);
  });
  it("uses venous sample logic: oxygenation not interpreted, no pO2 alerts", () => {
    expect(statusIn(at(b, 120), "pO2")).toBe("not-interpretable");
    expect(b.alerts.some((a) => a.metric === "pO2")).toBe(false);
  });
  it("environment stays nominal", () => { expect(Math.max(...b.env.map((e) => e.co2))).toBeLessThan(4); expect(b.alerts.some((a) => a.category === "environment")).toBe(false); });
  it("contains no treatment instructions", () => { expect(JSON.stringify(b.alerts)).not.toMatch(/administer|give |infus|dose of|calcium gluconate|insulin/i); });
});

describe("scenario 3: analyzer calibration failure", () => {
  const b = buildScenario("cal");
  it("prints implausible glucose and lactate with a calibration flag, then recovers", () => {
    for (const t of [45, 60, 75]) { const l = at(b, t); expect(l.qcFlags[0].code).toBe("ABL-0210"); expect(l.values.Lac!).toBeGreaterThan(8); expect(l.values.Glu!).toBeLessThan(30); expect(statusIn(l, "Lac")).toBe("unreliable"); expect(statusIn(l, "Glu")).toBe("unreliable"); }
    expect(at(b, 90).qcFlags).toHaveLength(0); expect(at(b, 90).values.Lac!).toBeLessThan(1.6);
  });
  it("other analytes stay interpretable and normal", () => { const l = at(b, 60); expect(statusIn(l, "pH")).toBe("normal"); expect(statusIn(l, "K")).toBe("normal"); });
  it("raises data-quality alerts and no clinical lactate/glucose alerts", () => {
    expect(b.alerts.filter((a) => a.category === "data-quality" && a.severity === "warning").length).toBeGreaterThanOrEqual(3);
    expect(b.alerts.some((a) => (a.metric === "Lac" || a.metric === "Glu") && (a.category === "lab" || a.category === "clinical" || a.category === "trend"))).toBe(false);
    expect(b.alerts.some((a) => a.severity === "critical")).toBe(false);
    expect(b.alerts.some((a) => /does not fit/.test(a.title))).toBe(true);
  });
  it("a threshold-only system would have raised false critical alarms", () => { expect(b.naive.length).toBeGreaterThanOrEqual(6); expect(summarize(b, []).findings.join(" ")).toMatch(/threshold-only/); });
  it("preserves the analyzer message verbatim", () => { expect(b.alerts.find((a) => a.category === "data-quality")!.detail).toContain("0210: Calibration error(s) present"); });
});

describe("summary", () => {
  it("counts review actions", () => {
    const b = buildScenario("k"); const a = b.alerts.find((x) => x.severity === "critical")!;
    const s = summarize(b, [{ alertId: a.id, kind: "ack", t: a.t + 5 }, { alertId: a.id, kind: "escalate", t: a.t + 10 }]);
    expect(s.review).toMatchObject({ actions: 2, alertsReviewed: 1, firstAckMin: 5 });
    expect(s.limits.join(" ")).toMatch(/deterministic/i);
  });
});
