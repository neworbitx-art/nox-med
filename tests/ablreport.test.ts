import { describe, expect, it } from "vitest";
import { ANALYTE_KEYS, draftFromExtraction, parseAblText, toUploadedLab, validateDraft, emptyDraft } from "@/lib/ablreport";
import { EN_ARTERIAL, ES_VENOUS, GARBAGE } from "./fixtures/abl-reports";

const checkAll = (d: ReturnType<typeof draftFromExtraction>) => { for (const k of ANALYTE_KEYS) d.fields[k].checked = true; return d; };

describe("ABL90 report parsing (Spanish venous fixture)", () => {
  const r = parseAblText(ES_VENOUS);
  it("extracts header fields", () => {
    expect(r.analyzer).toBe("ABL90 SERIES");
    expect(r.date).toEqual({ iso: "2031-03-21", ambiguous: false, raw: "03/21/2031" });
    expect(r.time?.hhmm).toBe("09:05");
    expect(r.sampleType).toBe("venous");
    expect(r.temperatureC).toBe(37);
    expect(r.fio2).toBeCloseTo(0.21);
    expect(r.patientId).toBe("SYN-A");
  });
  it("extracts blood gas, oximetry, electrolytes and metabolites", () => {
    const v = (k: Parameters<typeof ANALYTE_KEYS.includes>[0]) => r.fields[k as keyof typeof r.fields]?.value;
    expect([v("pH"), v("pCO2"), v("pO2")]).toEqual([7.312, 52.1, 41]);
    expect([v("tHb"), v("sO2"), v("FO2Hb"), v("COHb"), v("MetHb"), v("FHHb")]).toEqual([13.9, 72, 70.9, 0.9, 0.2, 28]);
    expect([v("K"), v("Na"), v("Cl"), v("Glu"), v("Lac")]).toEqual([4, 139, 103, 95, 1.1]);
    expect(r.fields.pCO2?.refFlag).toBe("high");
    expect(r.fields.pH?.refFlag).toBe("low");
  });
  it("uses the measured ionized Ca, not the pH-7.4 calculated one", () => { expect(r.fields.iCa?.value).toBe(1.18); });
  it("ignores temperature-corrected values", () => { expect(r.fields.pH?.value).toBe(7.312); expect(r.fields.pCO2?.value).toBe(52.1); });
  it("marks calculated analytes", () => {
    expect(r.fields.BE).toMatchObject({ value: -1.9, calculated: true });
    expect(r.fields.HCO3).toMatchObject({ value: 24.8, calculated: true });
    expect(r.fields.Hct).toMatchObject({ value: 42.5, calculated: true });
    expect(r.fields.pH?.calculated).toBe(false);
  });
  it("preserves calibration warnings with analyzer code and message", () => {
    const g = r.flags.find((f) => f.analyte === "Glu");
    expect(g?.code).toBe("ABL-0210");
    expect(g?.message).toContain("calibración");
    expect(r.flags.some((f) => f.analyte === "Lac" && f.code === "ABL-0210")).toBe(true);
    expect(r.fields.Glu?.questionable).toBe(true);
  });
});

describe("English arterial fixture with unit conversion", () => {
  const r = parseAblText(EN_ARTERIAL);
  it("reads ISO date and 24 h time", () => { expect(r.date?.iso).toBe("2031-03-22"); expect(r.time?.hhmm).toBe("14:30"); expect(r.sampleType).toBe("arterial"); });
  it("converts kPa, g/L, glucose mmol/L and L/L explicitly", () => {
    expect(r.fields.pCO2).toMatchObject({ value: 39.8, converted: true });
    expect(r.fields.pO2?.value).toBe(105);
    expect(r.fields.tHb?.value).toBe(14);
    expect(r.fields.Glu?.value).toBe(90);
    expect(r.fields.Hct?.value).toBe(43);
  });
  it("leaves absent analytes unavailable", () => { expect(r.fields.iCa).toBeUndefined(); expect(r.fields.FO2Hb).toBeUndefined(); });
});

describe("unreadable text", () => {
  it("does not fabricate values", () => {
    const r = parseAblText(GARBAGE);
    expect(Object.keys(r.fields)).toHaveLength(0);
    expect(r.date).toBeUndefined();
  });
});

describe("date handling", () => {
  it("flags ambiguous day/month", () => { expect(parseAblText("01/02/2031 10:00").date?.ambiguous).toBe(true); });
  it("resolves DD/MM when day > 12", () => { expect(parseAblText("25/03/2031 10:00").date).toMatchObject({ iso: "2031-03-25", ambiguous: false }); });
  it("converts PM", () => { expect(parseAblText("03/21/2031 02:15 PM").time?.hhmm).toBe("14:15"); });
});

describe("verification and validation", () => {
  it("requires every extracted value to be confirmed", () => {
    const d = draftFromExtraction(parseAblText(ES_VENOUS), "Subject 1");
    const issues = validateDraft(d, Date.parse("2031-03-30T00:00:00Z"));
    expect(issues.filter((i) => i.level === "error" && /confirm/.test(i.message)).length).toBeGreaterThan(10);
    expect(Object.values(d.fields).every((f) => !f.checked)).toBe(true);
  });
  it("passes when confirmed and keeps calibration warnings as warnings", () => {
    const d = checkAll(draftFromExtraction(parseAblText(ES_VENOUS), "Subject 1"));
    const issues = validateDraft(d, Date.parse("2031-03-30T00:00:00Z"));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.some((i) => i.level === "warning" && /calibración/.test(i.message))).toBe(true);
  });
  it("rejects implausible values, missing date and empty drafts", () => {
    const d = checkAll(draftFromExtraction(parseAblText(ES_VENOUS), "Subject 1"));
    d.fields.pH.text = "73.4"; d.date = "";
    const msgs = validateDraft(d).filter((i) => i.level === "error").map((i) => i.message).join("|");
    expect(msgs).toMatch(/pH/); expect(msgs).toMatch(/date/);
    expect(validateDraft(emptyDraft("manual")).some((i) => /No measurements/.test(i.message))).toBe(true);
  });
  it("warns on inconsistent pH/pCO2/HCO3", () => {
    const d = checkAll(draftFromExtraction(parseAblText(ES_VENOUS), "Subject 1"));
    d.fields.HCO3.text = "35";
    expect(validateDraft(d, Date.parse("2031-03-30T00:00:00Z")).some((i) => i.field === "HCO3" && /Henderson/.test(i.message))).toBe(true);
  });
  it("rejects future sample times", () => {
    const d = checkAll(draftFromExtraction(parseAblText(ES_VENOUS), "Subject 1"));
    expect(validateDraft(d, Date.parse("2031-03-01T00:00:00Z")).some((i) => /future/.test(i.message))).toBe(true);
  });
});

describe("conversion to a stored record", () => {
  const d = checkAll(draftFromExtraction(parseAblText(ES_VENOUS), "Subject 1"));
  const lab = toUploadedLab(d, new Date("2031-03-21T12:00:00Z"));
  it("stores a pseudonymous label, never the report's patient ID or name", () => {
    const json = JSON.stringify(lab);
    expect(lab.subjectLabel).toBe("Subject 1");
    expect(json).not.toContain("SYN-A");
    expect(json).not.toContain("00001");
  });
  it("keeps calculated, extra and flags", () => {
    expect(lab.calculated.sort()).toEqual(["BE", "HCO3", "Hct"]);
    expect(lab.extra.FHHb).toBe(28);
    expect(lab.qcFlags.find((f) => f.analytes.includes("Glu"))?.code).toBe("ABL-0210");
    expect(lab.sampleType).toBe("venous");
    expect(lab.collectedAt).toBe("2031-03-21T09:05:00Z");
  });
  it("omits unavailable analytes", () => { const e = emptyDraft("manual"); e.fields.pH = { ...e.fields.pH, text: "7.4", source: "manual", checked: true }; expect(Object.keys(toUploadedLab(e).values)).toEqual(["pH"]); });
});
