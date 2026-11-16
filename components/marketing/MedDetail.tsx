import Link from "next/link";
import { Reveal } from "./Reveal";
import { ObservationCard, observationExample } from "./MedEvidence";
import { METRICS } from "@/lib/metrics";
import { ROUTES } from "@/lib/routes";
import type { MetricKey } from "@/lib/types";

const D = ROUTES.demo;

type Status = "In demo" | "Prototype" | "Local-first" | "Planned";
const CAPABILITIES: { title: string; text: string; status: Status; href?: string }[] = [
  { title: "Longitudinal blood gas monitoring", text: "Every sample is kept on a true time scale, so each result is read against the mission so far, not on its own.", status: "In demo", href: `${D}/blood-gas` },
  { title: "Personalized physiological baselines", text: "An astronaut's first ten reliable samples define a personal baseline. Later samples are scored against it with a z-score and a 30-day slope.", status: "In demo", href: `${D}/blood-gas` },
  { title: "Integrated wearable measurements", text: "Resting heart rate, heart-rate variability, sleep and SpO₂ are compared with each astronaut's own early-mission baseline. Wearable SpO₂ is an estimate, not a blood measurement.", status: "In demo", href: `${D}/wearables` },
  { title: "Spacecraft environmental monitoring", text: "Cabin CO₂, pressure and radiation dose rate are tracked beside crew data. They are never mixed with clinical values.", status: "In demo", href: `${D}/environment` },
  { title: "Explainable clinical observations", text: "Deterministic rules, no black box. Each observation shows the current and previous value, reference interval, baseline, the rule steps behind it, measurement validity and uncertainty.", status: "In demo", href: `${D}/blood-gas` },
  { title: "Astronaut self-assessment", text: "A short structured check-in so the astronaut's own report sits beside the numbers. Not built yet.", status: "Planned" },
  { title: "Medical officer review", text: "In the emergency simulator an observation can be acknowledged, a repeat sample requested, or the case escalated to the flight surgeon.", status: "Prototype", href: `${D}/emergency` },
  { title: "Offline-capable architecture", text: "Analysis runs in the browser from local data. No server call is needed to interpret results, and imported records stay on the device. An installable offline mode is the next step.", status: "Local-first", href: `${D}/lab-import` },
];

const FLOW = [
  { n: "01", k: "Measure", t: "Collect laboratory, wearable and environmental measurements." },
  { n: "02", k: "Analyze", t: "Compare each result with the astronaut's individual baseline and longitudinal trend." },
  { n: "03", k: "Understand", t: "Present explainable observations with measurement quality and uncertainty." },
  { n: "04", k: "Review", t: "Support astronaut self-assessment and crew medical officer review." },
];

const ANALYTE_GROUPS: { group: string; keys: MetricKey[] }[] = [
  { group: "Acid–base & gases", keys: ["pH", "pCO2", "pO2", "HCO3", "BE"] },
  { group: "Electrolytes", keys: ["Na", "K", "Cl", "iCa"] },
  { group: "Metabolites", keys: ["Lac", "Glu"] },
  { group: "Hemoglobin & oximetry", keys: ["tHb", "sO2"] },
];

const RELEVANCE: { area: string; what: string }[] = [
  { area: "Respiratory acid–base abnormalities", what: "pH, pCO₂ and HCO₃⁻ are classified into respiratory or metabolic patterns, with compensation checks." },
  { area: "Ventilation assessment", what: "pCO₂ trends are read alongside cabin CO₂, so a ventilation change can be separated from an environmental one." },
  { area: "Oxygenation", what: "pO₂ and sO₂ are interpreted only for arterial or arterialized samples. A venous pO₂ is never read as arterial oxygenation." },
  { area: "Electrolyte disturbances", what: "Sodium, potassium, chloride and ionized calcium are checked against reference intervals and the astronaut's own baseline." },
  { area: "Physiological adaptation", what: "Baseline drift in hemoglobin, hematocrit, lactate and glucose shows gradual change over months." },
  { area: "Cardiovascular monitoring", what: "Wearable resting heart rate, heart-rate variability and SpO₂, with potassium and ionized calcium as cardiac-relevant context." },
  { area: "Environmental exposure monitoring", what: "Cabin CO₂, pressure and radiation dose rate, plus carboxyhemoglobin and methemoglobin from the analyzer." },
];

const REFS = [
  { label: "NASA Space Apps 2026: Health Monitoring Software", href: "https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/", note: "The challenge this project responds to." },
  { label: "NASA Human Research Program", href: "https://www.nasa.gov/hrp/", note: "Research on the health risks of spaceflight." },
  { label: "NASA Open Science Data Repository (OSDR)", href: "https://science.nasa.gov/biological-physical/data/osdr/", note: "Public spaceflight biology datasets." },
];

export function MedDetail() {
  const obs = observationExample();
  return (
    <div className="mk-wrap mk-med">
      <Reveal>
        <h3 className="mk-h3">What NOX MED does</h3>
        <ul className="mk-caps">
          {CAPABILITIES.map((c) => (
            <li key={c.title}>
              <span className={`mk-tag mk-tag-${c.status === "Planned" ? "plan" : "live"}`}>{c.status}</span>
              <h4>{c.title}</h4>
              <p>{c.text}</p>
              {c.href && <Link href={c.href} className="mk-link-sm">Open in demo <span aria-hidden>→</span></Link>}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal>
        <h3 className="mk-h3">From measurement to review</h3>
        <ol className="mk-flow">
          {FLOW.map((s) => <li key={s.k}><span>{s.n}</span><b>{s.k}</b><p>{s.t}</p></li>)}
        </ol>
      </Reveal>

      <Reveal>
        <h3 className="mk-h3">Blood gas intelligence</h3>
        <div className="mk-split mk-split-top">
          <div>
            <p className="mk-lead" style={{ marginTop: 0 }}>A single reading is a snapshot against a population range. An astronaut can drift away from their own normal while every value is still inside that range. Comparing each sample with the person&apos;s own history, its sample type and its quality flags shows the shift early, and shows when a value should not be trusted at all.</p>
            <p className="mk-note-lg">The chart above is one fictional crew member: pCO₂ has risen about six standard deviations from baseline while pH still sits inside its reference interval.</p>
            <div className="mk-analytes" role="group" aria-label="Analytes analyzed">
              {ANALYTE_GROUPS.map((g) => (
                <div key={g.group}>
                  <span className="mk-eyebrow-sm">{g.group}</span>
                  <div>{g.keys.map((k) => <Link key={k} href={`${D}/blood-gas?m=${k}`} title={`${METRICS[k].name}: ${METRICS[k].meaning}`}>{METRICS[k].name}</Link>)}</div>
                </div>
              ))}
            </div>
            <p className="mk-note">Each analyte opens its own trend in the demo.</p>
          </div>
          {obs && <ObservationCard o={obs} />}
        </div>
      </Reveal>

      <Reveal>
        <h3 className="mk-h3">Space medicine relevance</h3>
        <ul className="mk-rel">
          {RELEVANCE.map((r) => <li key={r.area}><b>{r.area}</b><p>{r.what}</p></li>)}
        </ul>
        <p className="mk-note-lg"><b>Future development:</b> bone loss, immune dysregulation and neuro-ocular conditions need other measurements. Blood gas analysis does not diagnose them, and NOX MED does not claim to.</p>
      </Reveal>

      <Reveal>
        <h3 className="mk-h3">References and data</h3>
        <div className="mk-refs">
          <div>
            <span className="mk-eyebrow-sm">Scientific references</span>
            <ul>{REFS.map((r) => <li key={r.href}><a href={r.href} target="_blank" rel="noopener noreferrer">{r.label} <span aria-hidden>↗</span></a><p>{r.note}</p></li>)}</ul>
          </div>
          <div>
            <span className="mk-eyebrow-sm">Integrated in this software</span>
            <p>No NASA or OSDR datasets are loaded. Every crew, laboratory, wearable and cabin record in the demo is fictional, generated by project scripts and labelled by origin. The references above are background reading, not validation.</p>
          </div>
        </div>
        <p className="mk-safety">Research prototype for decision support. Thresholds are illustrative and not clinically validated. Not FDA- or NASA-certified, no treatment recommendations, no disease prediction. <Link href={`${D}/about`}>Data sources &amp; methods</Link></p>
      </Reveal>
    </div>
  );
}
