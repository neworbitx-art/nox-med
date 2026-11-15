import type { AstronautId, LabResult, MetricKey, QcFlag, SampleType, Severity } from "./types";
import { METRICS, fmt, statusOf } from "./metrics";
import { interpretability, statusIn } from "./validity";
import { analyzeLabs, type Observation } from "./clinical";
import { ENV_VARS } from "./telemetry";

/**
 * Deterministic emergency scenario engine. Every number is a closed-form function of simulated time:
 * no randomness, no clock, no model-generated values. Rules (not an LLM) turn the measurements into alerts.
 * All output is SIMULATED and illustrative; it is not a diagnosis tool and gives no treatment instructions.
 */

export type ScenarioId = "resp" | "k" | "cal";
export const SIM_VERSION = "1";
export const SIM_START = "2031-11-09T08:00:00Z";
const T0 = Date.parse(SIM_START);
const MIN = 60000;

export interface ScenarioDef {
  id: ScenarioId; name: string; short: string; summary: string;
  durationMin: number; sampleEveryMin: number; envEveryMin: number;
  sampleType: SampleType;
  /** Metrics plotted by default, primary first */
  focus: MetricKey[];
  caveat: string;
}
export const SCENARIOS3: ScenarioDef[] = [
  { id: "resp", name: "Respiratory deterioration", short: "Rising pCO₂ with cabin CO₂ change", durationMin: 360, sampleEveryMin: 30, envEveryMin: 10, sampleType: "arterial",
    summary: "Arterial pCO₂ climbs, pH falls and bicarbonate rises slightly (acute respiratory acidosis) while cabin CO₂ also rises. The two are shown together as temporal co-occurrence only.",
    focus: ["pCO2", "pH", "HCO3", "pO2"], caveat: "Cabin CO₂ (ambient gas) is not blood pCO₂ and is not shown to be the cause of the deterioration." },
  { id: "k", name: "Electrolyte disturbance", short: "Progressive hyperkalemia", durationMin: 240, sampleEveryMin: 20, envEveryMin: 10, sampleType: "venous",
    summary: "Potassium rises across sequential venous samples with a mild metabolic acidosis, after a simulated exertion/injury context event. Alerts feed a medical-review workflow.",
    focus: ["K", "HCO3", "iCa", "Lac"], caveat: "Cabin environment is nominal in this scenario. Venous samples: gas values use venous ranges and oxygenation is not interpreted." },
  { id: "cal", name: "Analyzer calibration failure", short: "Invalid glucose / lactate", durationMin: 120, sampleEveryMin: 15, envEveryMin: 10, sampleType: "arterial",
    summary: "The analyzer reports calibration errors on the glucose and lactate sensors and prints implausible values. NOX MED withholds them from interpretation instead of alarming.",
    focus: ["Lac", "Glu", "pH", "K"], caveat: "The patient state is unchanged throughout. Flagged values are analytical artifacts and are never treated as clinical findings." },
];
export const scenarioDef = (id: ScenarioId) => SCENARIOS3.find((s) => s.id === id)!;

export interface EnvObs { t: number; co2: number; o2: number; pressureKpa: number; tempC: number; humidity: number }
export interface SimAlert {
  id: string; t: number; severity: Severity; category: "lab" | "clinical" | "trend" | "environment" | "data-quality";
  title: string; detail: string; why: string[]; uncertainty?: string; metric?: MetricKey; sampleId?: string;
}
export interface SimEvent { t: number; kind: "start" | "script" | "lab" | "env" | "alert" | "end"; severity?: Severity; text: string; alertId?: string }
export interface SimSample { id: string; t: number; lab: LabResult; observations: Observation[] }
export interface Built {
  def: ScenarioDef; astronautId: AstronautId;
  history: LabResult[]; samples: SimSample[]; env: EnvObs[]; alerts: SimAlert[]; events: SimEvent[];
  /** Alarms a plain threshold system (ignoring analyzer QC flags) would have raised */
  naive: { t: number; metric: MetricKey; value: number; status: string }[];
  checksum: string;
}

// ───────────────────────── physiology ─────────────────────────
const sat = (p: number) => 100 / (23400 / (p ** 3 + 150 * p) + 1);
const hh = (hco3: number, pco2: number) => 6.1 + Math.log10(hco3 / (0.0307 * pco2));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const wob = (t: number, k: number, amp: number) => amp * Math.sin(t * 0.0731 + k * 1.913);

interface State { pCO2: number; HCO3: number; pO2: number; K: number; Na: number; Cl: number; iCa: number; Lac: number; Glu: number; tHb: number; Hct: number; COHb: number; MetHb: number }
const BASE: State = { pCO2: 40, HCO3: 24, pO2: 92, K: 4.1, Na: 140, Cl: 103, iCa: 1.21, Lac: 1.0, Glu: 92, tHb: 14.6, Hct: 43.8, COHb: 0.8, MetHb: 0.5 };
const PB = 760; // mmHg, cabin total pressure

function values(s: State) {
  const pH = hh(s.HCO3, s.pCO2);
  const be = 0.93 * (s.HCO3 - 24.4 + 14.8 * (pH - 7.4));
  const so2 = Math.min(100, sat(s.pO2));
  const fo2hb = so2 * (1 - (s.COHb + s.MetHb) / 100);
  const v: Partial<Record<MetricKey, number>> = {
    pH: r(pH, 3), pCO2: r(s.pCO2, 1), pO2: r(s.pO2, 1), HCO3: r(s.HCO3, 1), BE: r(be, 1), sO2: r(so2, 1), FO2Hb: r(fo2hb, 1),
    tHb: r(s.tHb, 1), Hct: r(s.Hct, 1), COHb: r(s.COHb, 1), MetHb: r(s.MetHb, 1),
    Na: r(s.Na, 0), K: r(s.K, 2), Cl: r(s.Cl, 0), iCa: r(s.iCa, 2), Glu: r(s.Glu, 0), Lac: r(s.Lac, 2),
  };
  return v;
}

function respState(t: number): State {
  const g = t <= 285 ? ease((t - 45) / 240) : 1 - 0.25 * ease((t - 285) / 75);
  const pCO2 = BASE.pCO2 + 24 * g;
  const HCO3 = BASE.HCO3 + 0.1 * (pCO2 - BASE.pCO2) + 0.5 * ease((t - 180) / 180); // acute buffering + slight early renal response
  const pao2 = 0.21 * (PB - 47) - pCO2 / 0.8 - 8; // alveolar gas equation, constant A–a gradient
  const pH = hh(HCO3, pCO2);
  return { ...BASE, pCO2, HCO3, pO2: pao2, K: BASE.K + 2 * (7.4 - pH), iCa: BASE.iCa + 0.4 * (7.4 - pH), Lac: BASE.Lac + 0.7 * ease((t - 150) / 200), tHb: BASE.tHb, Hct: BASE.Hct };
}
function kState(t: number): State {
  const k = 4.2 + 2.65 * (1 - Math.exp(-Math.pow(t / 75, 1.4)));
  const a = ease((t - 20) / 160);
  const HCO3 = 25 - 5.5 * a, pCO2 = 45 - 6 * a;
  return { ...BASE, pCO2, HCO3, pO2: 40, K: k, Na: BASE.Na - 2 * a, Cl: 104 + 2 * a, iCa: 1.22 - 0.12 * a, Lac: 1.0 + 2.1 * ease((t - 20) / 140), Glu: 95 + 23 * a };
}
function calState(t: number): State {
  return { ...BASE, pCO2: BASE.pCO2 + wob(t, 1, 0.6), HCO3: BASE.HCO3 + wob(t, 2, 0.25), pO2: BASE.pO2 + wob(t, 3, 1.5), K: BASE.K + wob(t, 4, 0.06), Na: BASE.Na, Glu: BASE.Glu + wob(t, 5, 2), Lac: BASE.Lac + wob(t, 6, 0.05) };
}
const STATES: Record<ScenarioId, (t: number) => State> = { resp: respState, k: kState, cal: calState };

/** Analyzer artifacts for scenario 3: calibration error on glucose and lactate between t = 45 and 75 min */
const CAL_WINDOW: [number, number] = [45, 75];
const CAL_FLAG: QcFlag = { code: "ABL-0210", analytes: ["Glu", "Lac"], message: "0210: Calibration error(s) present (glucose, lactate sensors)" };
const CAL_ARTIFACT: Record<number, { Glu: number; Lac: number }> = { 45: { Glu: 18, Lac: 9.8 }, 60: { Glu: 22, Lac: 10.6 }, 75: { Glu: 15, Lac: 8.9 } };

function labAt(def: ScenarioDef, astro: AstronautId, t: number, state: State, id: string, collected: number): LabResult {
  const v = values(state);
  let qcFlags: QcFlag[] = [];
  if (def.id === "cal" && t >= CAL_WINDOW[0] && t <= CAL_WINDOW[1] && CAL_ARTIFACT[t]) { v.Glu = CAL_ARTIFACT[t].Glu; v.Lac = CAL_ARTIFACT[t].Lac; qcFlags = [CAL_FLAG]; }
  return {
    id, astronautId: astro, missionDay: Math.floor((collected - Date.parse("2031-05-10T00:00:00Z")) / 86400000) + 1, collectedAt: new Date(collected).toISOString().replace(".000Z", "Z"),
    sampleType: def.sampleType, analyzer: "ABL90 FLEX PLUS", origin: "simulated", verification: "verified", qcFlags,
    ...(def.sampleType === "arterial" ? { fio2: 0.21 } : {}), values: v,
  };
}

function envAt(id: ScenarioId, t: number): EnvObs {
  let co2 = 3.7 + wob(t, 7, 0.05);
  if (id === "resp") co2 = 3.6 + 3.2 * (t <= 240 ? ease((t - 30) / 210) : 1 - 0.7 * ease((t - 240) / 120)) + wob(t, 7, 0.05);
  const pressureKpa = 101.3 + wob(t, 8, 0.05), o2 = 0.209 * (pressureKpa * 7.50062);
  return { t, co2: r(co2, 2), o2: r(o2, 1), pressureKpa: r(pressureKpa, 2), tempC: r(22 + wob(t, 9, 0.2), 1), humidity: r(48 + wob(t, 10, 1.2), 1) };
}

const SCRIPT: Record<ScenarioId, { t: number; text: string }[]> = {
  resp: [
    { t: 0, text: "Scenario start (simulated): crew member at personal baseline; cabin CO₂ nominal." },
    { t: 30, text: "Scripted: cabin CO₂ scrubber efficiency begins to fall." },
    { t: 240, text: "Scripted: cabin CO₂ reaches its simulated peak." },
    { t: 270, text: "Scripted: scrubber capacity restored; cabin CO₂ starts to fall." },
  ],
  k: [
    { t: 0, text: "Scenario start (simulated): venous sampling every 20 min; cabin environment nominal." },
    { t: 15, text: "Scripted crew log: strenuous exertion with an equipment-handling injury (context only, not a diagnosis)." },
  ],
  cal: [
    { t: 0, text: "Scenario start (simulated): arterial sampling every 15 min; patient state unchanged throughout." },
    { t: 40, text: "Scripted: analyzer glucose/lactate sensors begin to fail calibration." },
    { t: 80, text: "Scripted: sensor recalibration completed; next sample re-analyzed." },
  ],
};

// ───────────────────────── alert rules ─────────────────────────
const RANK: Record<Severity, number> = { critical: 0, warning: 1, watch: 2, info: 3 };
const SR: Record<string, number> = { normal: 0, "out-of-range": 1, critical: 2 };
const TREND_MIN: Partial<Record<MetricKey, number>> = { pH: 0.03, pCO2: 3, K: 0.4, Lac: 0.5, HCO3: 1.5 };
const label = (k: MetricKey) => METRICS[k].label;
const unit = (k: MetricKey) => (METRICS[k].unit ? ` ${METRICS[k].unit}` : "");

function hashOf(parts: unknown): string {
  const s = JSON.stringify(parts); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function buildScenario(id: ScenarioId, astronautId: AstronautId = "A-01"): Built {
  const def = scenarioDef(id), state = STATES[id];
  // Ten prior daily baseline samples (small deterministic variation) so personal-baseline rules have a reference.
  const history: LabResult[] = Array.from({ length: 10 }, (_, i) => {
    const d = i - 10, s: State = { ...BASE, pCO2: BASE.pCO2 + wob(i, 1, 0.8), HCO3: BASE.HCO3 + wob(i, 2, 0.4), pO2: BASE.pO2 + wob(i, 3, 2), K: BASE.K + wob(i, 4, 0.1), Lac: BASE.Lac + wob(i, 5, 0.1), Glu: BASE.Glu + wob(i, 6, 3) };
    if (id === "k") { s.pCO2 = 45 + wob(i, 1, 0.8); s.HCO3 = 25 + wob(i, 2, 0.4); s.pO2 = 40; s.K = 4.2 + wob(i, 4, 0.1); }
    return labAt(def, astronautId, -999, s, `HIST-${id}-${i}`, T0 + d * 86400000);
  });

  const samples: SimSample[] = [];
  const all: LabResult[] = [...history];
  for (let t = 0; t <= def.durationMin; t += def.sampleEveryMin) {
    const lab = labAt(def, astronautId, t, state(t), `SIM-${id}-${String(t).padStart(3, "0")}`, T0 + t * MIN);
    all.push(lab);
    samples.push({ id: lab.id, t, lab, observations: analyzeLabs(all, lab.id) });
  }
  const env: EnvObs[] = [];
  for (let t = 0; t <= def.durationMin; t += def.envEveryMin) env.push(envAt(id, t));

  const alerts: SimAlert[] = [];
  const push = (a: Omit<SimAlert, "id">) => alerts.push({ ...a, id: `${id}-A${String(alerts.length + 1).padStart(2, "0")}` });
  const naive: Built["naive"] = [];
  const worstSeen: Partial<Record<MetricKey, number>> = {};
  const obsSeen = new Map<string, number>();
  const trendSeen = new Set<MetricKey>();
  const hist: Partial<Record<MetricKey, { t: number; v: number }[]>> = {};
  let cabinLevel = 0, cabinFirstT: number | undefined, coNoted = false, flagActive = false;
  const co2Watch = ENV_VARS.co2.high!, co2Warn = ENV_VARS.co2.warn!;

  // environment threshold crossings
  const envAlerts: { t: number; level: 1 | 2; v: number }[] = [];
  for (const e of env) {
    if (e.co2 >= co2Warn && cabinLevel < 2) { cabinLevel = 2; envAlerts.push({ t: e.t, level: 2, v: e.co2 }); }
    else if (e.co2 >= co2Watch && cabinLevel < 1) { cabinLevel = 1; envAlerts.push({ t: e.t, level: 1, v: e.co2 }); }
  }
  cabinLevel = 0;

  // chronological merge of env crossings and lab samples
  const timeline: ({ kind: "env"; t: number; level: 1 | 2; v: number } | { kind: "lab"; t: number; s: SimSample })[] = [
    ...envAlerts.map((e) => ({ kind: "env" as const, ...e })), ...samples.map((s) => ({ kind: "lab" as const, t: s.t, s })),
  ].sort((a, b) => a.t - b.t || (a.kind === "env" ? -1 : 1));

  for (const item of timeline) {
    if (item.kind === "env") {
      cabinLevel = item.level; cabinFirstT ??= item.t;
      push({ t: item.t, severity: item.level === 2 ? "warning" : "watch", category: "environment", metric: undefined,
        title: `Cabin CO₂ ${item.v.toFixed(2)} mmHg, above ${item.level === 2 ? co2Warn : co2Watch} mmHg`,
        detail: "Ambient cabin gas partial pressure (not blood pCO₂). Thresholds are prototype values.",
        why: [`Cabin CO₂ partial pressure crossed the ${item.level === 2 ? "warning" : "watch"} threshold of ${item.level === 2 ? co2Warn : co2Watch} mmHg.`, "Rule: environment threshold on hourly-equivalent telemetry."],
        uncertainty: "An elevated cabin value indicates an environmental issue to check; it does not by itself say anything about any crew member's blood gases." });
      continue;
    }
    const { s } = item, l = s.lab;

    // data-quality (analyzer flags)
    if (l.qcFlags.length) {
      for (const f of l.qcFlags) {
        const names = f.analytes.map(label).join(" and ");
        push({ t: s.t, severity: "warning", category: "data-quality", metric: f.analytes[0], sampleId: l.id,
          title: flagActive ? `Calibration warning persists: ${names} still withheld` : `Analyzer calibration warning: ${names} withheld`,
          detail: `${f.message}. The printed ${names} values are not used for any clinical conclusion or trend.`,
          why: [`Analyzer flag ${f.code} on sample ${l.id}.`, `Rule: any analyte under an analyzer QC flag is classified "unreliable" and excluded from range checks, trends and baselines.`, ...f.analytes.map((k) => `${label(k)} ${fmt(k, l.values[k])}${unit(k)} printed, not interpreted${statusOf(k, l.values[k] as number) !== "normal" ? " (it would look " + statusOf(k, l.values[k] as number) + " if taken at face value)" : ""}.`)],
          uncertainty: "The true glucose/lactate cannot be known from this sample. Repeat on a validated cartridge or analyzer." });
      }
      if (!flagActive) {
        const { Na, Cl, HCO3, pH } = l.values, lac = l.values.Lac;
        if (lac !== undefined && lac > 4 && HCO3 !== undefined && HCO3 >= 22 && HCO3 <= 26 && pH !== undefined && pH >= 7.35 && pH <= 7.45) {
          const ag = Na !== undefined && Cl !== undefined ? Na - Cl - HCO3 : undefined;
          push({ t: s.t, severity: "info", category: "data-quality", metric: "Lac", sampleId: l.id, title: "Printed lactate does not fit the concurrent acid–base state",
            detail: "Normal pH and bicarbonate argue against a true lactic acidosis of this size. This supports an analytical problem but does not prove one.",
            why: [`Printed lactate ${fmt("Lac", lac)} mmol/L (flagged, not interpreted).`, `Same sample: pH ${fmt("pH", pH)}, HCO₃⁻ ${fmt("HCO3", HCO3)} mmol/L${ag !== undefined ? `, anion gap ${ag.toFixed(1)} mmol/L` : ""} — all in the normal range.`, "Rule: flag a printed lactate > 4 mmol/L that is not accompanied by any acid–base change."],
            uncertainty: "Consistency checks cannot confirm the value is wrong; they only show it is unlikely to be physiologic." });
        }
      }
      flagActive = true;
    } else if (flagActive) {
      flagActive = false;
      push({ t: s.t, severity: "info", category: "data-quality", sampleId: l.id, title: "Analyzer warning cleared; glucose and lactate usable again",
        detail: "No analyzer flag on this sample. Values are consistent with the pre-event state.", why: ["Rule: unflagged sample re-enables interpretation of the previously withheld analytes."] });
    }
    // naive comparison + lab status transitions
    for (const k of Object.keys(l.values) as MetricKey[]) {
      const v = l.values[k] as number;
      const ns = statusOf(k, v);
      if (ns === "critical") naive.push({ t: s.t, metric: k, value: v, status: ns });
      const st = statusIn(l, k);
      if (st !== "normal" && st !== "out-of-range" && st !== "critical") continue;
      const rank = SR[st];
      if (rank > (worstSeen[k] ?? 0)) {
        worstSeen[k] = rank;
        const i = interpretability(l, k);
        const rg = i.ok ? `${i.range.low}–${i.range.high}` : "";
        push({ t: s.t, severity: st === "critical" ? "critical" : "warning", category: "lab", metric: k, sampleId: l.id,
          title: `${label(k)} ${st === "critical" ? "critical" : "outside reference range"}: ${fmt(k, v)}${unit(k)}`,
          detail: `Sample ${l.id} (${l.sampleType}); reference ${rg}${unit(k)}.`,
          why: [`Measured ${label(k)} ${fmt(k, v)}${unit(k)}.`, `Sample type ${l.sampleType}, reliable (no QC flag), reference interval ${rg}.`, st === "critical" ? `Beyond the critical limit.` : "Outside the reference interval."],
          uncertainty: `Single sample; the trend across samples matters more than one value.` });
      }
      if (i_ok(l, k)) (hist[k] ??= []).push({ t: s.t, v });
    }
    // trend rule
    for (const k of Object.keys(TREND_MIN) as MetricKey[]) {
      const h = hist[k]; if (!h || h.length < 3 || trendSeen.has(k)) continue;
      const [a, b, c] = h.slice(-3);
      if (c.t !== s.t) continue;
      const up = a.v < b.v && b.v < c.v, down = a.v > b.v && b.v > c.v;
      if ((up || down) && Math.abs(c.v - a.v) >= TREND_MIN[k]!) {
        trendSeen.add(k);
        push({ t: s.t, severity: "watch", category: "trend", metric: k, sampleId: l.id,
          title: `${label(k)} ${up ? "rising" : "falling"} across 3 samples (${up ? "+" : "−"}${Math.abs(c.v - a.v).toFixed(METRICS[k].decimals)}${unit(k)} in ${c.t - a.t} min)`,
          detail: "Monotone change over the last three reliable samples, before any range limit is crossed.",
          why: [`${label(k)}: ${[a, b, c].map((p) => `${fmt(k, p.v)} (t+${p.t})`).join(" → ")}.`, `Rule: three consecutive reliable samples moving the same way by at least ${TREND_MIN[k]}${unit(k)}.`],
          uncertainty: "A short trend can reverse. Confirm with the next sample." });
        if ((k === "pCO2" || k === "pH") && cabinLevel > 0 && !coNoted) {
          coNoted = true;
          push({ t: s.t, severity: "watch", category: "environment", metric: k, sampleId: l.id, title: "Blood pCO₂ change coincides with raised cabin CO₂",
            detail: "Temporal co-occurrence only: the two series move over the same period.",
            why: [`Cabin CO₂ has been above ${co2Watch} mmHg since t+${cabinFirstT}.`, "Blood pCO₂/pH is changing in the same window.", "Rule: report co-occurrence when both conditions hold; no causal conclusion is drawn."],
            uncertainty: "Cabin CO₂ is ambient air, not blood pCO₂. Rising blood pCO₂ has other possible contributors (reduced ventilation, increased CO₂ production, lung or airway problems). This does not show the cabin level caused it." });
        }
      }
    }
    // clinical engine observations (acid–base pattern, electrolytes, quality…)
    for (const o of s.observations) {
      if (o.severity === "info") continue;
      const key = `${o.domain}|${o.parameters.join(",")}|${o.severity}`;
      if (obsSeen.has(key)) continue;
      if (o.domain === "quality" && l.qcFlags.length) continue; // already reported as data-quality above
      obsSeen.set(key, s.t);
      push({ t: s.t, severity: o.severity, category: "clinical", metric: o.parameters[0], sampleId: l.id, title: o.title, detail: `${o.current}. ${o.significance}`, why: o.reasons, uncertainty: o.uncertainty });
    }
  }
  alerts.sort((a, b) => a.t - b.t || RANK[a.severity] - RANK[b.severity]);
  alerts.forEach((a, i) => (a.id = `${id}-A${String(i + 1).padStart(2, "0")}`));

  const events: SimEvent[] = [
    ...SCRIPT[id].map((e) => ({ t: e.t, kind: (e.t === 0 ? "start" : "script") as SimEvent["kind"], text: e.text })),
    ...samples.map((s) => ({ t: s.t, kind: "lab" as const, text: `Sample ${s.id.split("-").pop()} (${def.sampleType}): ${def.focus.map((k) => `${label(k)} ${fmt(k, s.lab.values[k])}`).join(" · ")}${s.lab.qcFlags.length ? "  ⚠ analyzer flag" : ""}` })),
    ...alerts.map((a) => ({ t: a.t, kind: "alert" as const, severity: a.severity, text: a.title, alertId: a.id })),
    { t: def.durationMin, kind: "end" as const, text: "Scenario complete (simulated)." },
  ].sort((a, b) => a.t - b.t);

  const checksum = hashOf({ v: SIM_VERSION, id, samples: samples.map((s) => s.lab.values), env: env.map((e) => [e.co2, e.o2]), flags: samples.map((s) => s.lab.qcFlags.map((f) => f.code)), alerts: alerts.map((a) => [a.t, a.title]) });
  return { def, astronautId, history, samples, env, alerts, events, naive, checksum };
}
function i_ok(l: LabResult, k: MetricKey) { return interpretability(l, k).ok; }

// ───────────────────────── review workflow and summary ─────────────────────────
export type ReviewKind = "ack" | "repeat" | "escalate";
export interface ReviewAction { alertId: string; kind: ReviewKind; t: number }
export const REVIEW_LABEL: Record<ReviewKind, string> = { ack: "Acknowledged", repeat: "Repeat sample requested", escalate: "Escalated to flight surgeon" };

export interface Summary {
  title: string; checksum: string; durationMin: number; samples: number;
  counts: Record<Severity, number>; milestones: { label: string; t?: number }[];
  findings: string[]; review: { actions: number; alertsReviewed: number; alertsNeedingReview: number; firstAckMin?: number };
  limits: string[];
}

const first = (b: Built, f: (a: SimAlert) => boolean) => b.alerts.find(f)?.t;

export function summarize(b: Built, log: ReviewAction[]): Summary {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, watch: 0, info: 0 };
  b.alerts.forEach((a) => counts[a.severity]++);
  const sampleVals = (k: MetricKey) => b.samples.filter((s) => interpretability(s.lab, k).ok || b.def.id === "cal").map((s) => ({ t: s.t, v: s.lab.values[k] as number })).filter((p) => p.v !== undefined);
  const findings: string[] = [];
  const milestones: Summary["milestones"] = [];
  if (b.def.id === "resp") {
    const p = sampleVals("pCO2"), ph = sampleVals("pH");
    const peak = p.reduce((m, x) => (x.v > m.v ? x : m)), low = ph.reduce((m, x) => (x.v < m.v ? x : m));
    const cab = b.env.reduce((m, x) => (x.co2 > m.co2 ? x : m));
    const cabT = first(b, (a) => a.category === "environment" && a.title.startsWith("Cabin"));
    const trendT = first(b, (a) => a.category === "trend" && a.metric === "pCO2");
    milestones.push({ label: "Cabin CO₂ above watch threshold", t: cabT }, { label: "Arterial pCO₂ rising trend flagged", t: trendT }, { label: "First lab value outside range", t: first(b, (a) => a.category === "lab") }, { label: "First critical lab value", t: first(b, (a) => a.severity === "critical" && a.category === "lab") });
    findings.push(`Arterial pCO₂ rose from ${p[0].v} to a peak of ${peak.v} mmHg (t+${peak.t}); pH fell from ${ph[0].v} to ${low.v} (t+${low.t}); bicarbonate moved only slightly, as expected for an acute respiratory process.`);
    findings.push(`Cabin CO₂ rose from ${b.env[0].co2} to ${cab.co2} mmHg (t+${cab.t}) and then fell. Blood pCO₂ kept rising for a while after cabin CO₂ began to fall, so the two series are related in time but not tightly coupled.`);
    if (cabT !== undefined && trendT !== undefined) findings.push(`Order of detection: cabin alert at t+${cabT}, blood pCO₂ trend at t+${trendT}. This describes timing only and does not establish cause.`);
  } else if (b.def.id === "k") {
    const k = sampleVals("K");
    const top = k.reduce((m, x) => (x.v > m.v ? x : m));
    milestones.push({ label: "K⁺ rising trend flagged", t: first(b, (a) => a.category === "trend" && a.metric === "K") }, { label: "K⁺ above reference range", t: first(b, (a) => a.category === "lab" && a.metric === "K" && a.severity === "warning") }, { label: "K⁺ critical", t: first(b, (a) => a.category === "lab" && a.metric === "K" && a.severity === "critical") });
    findings.push(`Potassium rose from ${k[0].v} to ${top.v} mmol/L across ${k.length} sequential venous samples, with bicarbonate falling (${b.samples[0].lab.values.HCO3} → ${b.samples[b.samples.length - 1].lab.values.HCO3} mmol/L) and ionized calcium falling.`);
    findings.push("Consistent with a possible hyperkalemia pattern after tissue injury; hemolysis was not flagged on any sample. Other causes are not excluded and no treatment is suggested here.");
  } else {
    const flagged = b.samples.filter((s) => s.lab.qcFlags.length);
    const nv = flagged.reduce((n, s) => n + s.lab.qcFlags.reduce((m, f) => m + f.analytes.length, 0), 0);
    milestones.push({ label: "First calibration warning", t: first(b, (a) => a.category === "data-quality") }, { label: "Warning cleared", t: first(b, (a) => a.category === "data-quality" && a.severity === "info") });
    findings.push(`${flagged.length} samples carried analyzer flag ABL-0210; ${nv} glucose/lactate values were withheld from interpretation.`);
    findings.push(`A threshold-only system would have raised ${b.naive.length} critical alarms from those values (${[...new Set(b.naive.map((n) => label(n.metric)))].join(", ")}). NOX MED raised ${b.alerts.filter((a) => a.category === "lab" && a.severity === "critical").length} clinical critical alerts and ${b.alerts.filter((a) => a.category === "data-quality").length} data-quality alerts instead.`);
    findings.push("The concurrent pH, bicarbonate and electrolytes stayed normal, which does not fit the printed lactate/glucose values; this supports an analytical problem but does not prove one.");
  }
  const needing = b.alerts.filter((a) => a.severity !== "info").map((a) => a.id);
  const reviewed = new Set(log.map((x) => x.alertId));
  const acks = log.filter((x) => x.kind === "ack").map((x) => x.t - (b.alerts.find((a) => a.id === x.alertId)?.t ?? x.t));
  return {
    title: b.def.name, checksum: b.checksum, durationMin: b.def.durationMin, samples: b.samples.length, counts, milestones, findings,
    review: { actions: log.length, alertsReviewed: needing.filter((id) => reviewed.has(id)).length, alertsNeedingReview: needing.length, firstAckMin: acks.length ? Math.min(...acks) : undefined },
    limits: ["Scenario output is deterministic: identical inputs always reproduce identical results.", "Reference ranges and rule thresholds are illustrative and not clinically validated.", "Alerts are decision-support observations, not diagnoses; the workflow records review steps only and gives no treatment instructions."],
  };
}
