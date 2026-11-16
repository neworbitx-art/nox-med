/**
 * Server-side helpers that render REAL NOX MED rule-engine output (same engine as the demo)
 * for one fictional demo crew member. Only one observation reaches the browser.
 */
import { DATASETS, labsFor, setActiveDataset } from "@/lib/data";
import { analyzeLabs, type Observation } from "@/lib/clinical";
import { METRICS, fmt } from "@/lib/metrics";

const CREW_ID = "A-03";

function evidence() {
  setActiveDataset("NOX-01"); // idempotent; keeps shared module state on the dataset this panel reads
  const d = DATASETS["NOX-01"];
  const crew = d.astronauts.find((a) => a.id === CREW_ID)!;
  const labs = labsFor(d.labs, CREW_ID).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  return { d, crew, labs };
}

const SEV_LABEL: Record<string, string> = { critical: "Critical", warning: "Warning", watch: "Watch", info: "Info" };

export function observationExample(): Observation | null {
  const { labs } = evidence();
  const last = labs[labs.length - 1];
  return analyzeLabs(labs, last.id).find((o) => o.severity !== "info") ?? null;
}

export function ObservationCard({ o }: { o: Observation }) {
  return (
    <article className="mk-obs" aria-label="Example explainable observation">
      <div className="mk-obs-head">
        <span className={`mk-sev mk-sev-${o.severity}`}>{SEV_LABEL[o.severity] ?? o.severity}</span>
        <span>{o.domain}</span><span>validity: {o.validity}</span><span className="mk-obs-day">D{o.missionDay}</span>
      </div>
      <h4>{o.title}</h4>
      <dl>
        <div><dt>Current</dt><dd>{o.current}</dd></div>
        <div><dt>Previous</dt><dd>{o.previous ?? "— (no earlier reliable sample)"}</dd></div>
        <div><dt>Reference interval</dt><dd>{o.reference}</dd></div>
        <div><dt>Personal baseline</dt><dd>{o.baseline ?? "— (insufficient history)"}</dd></div>
      </dl>
      <p className="mk-obs-sig"><b>Clinical significance</b>{o.significance}</p>
      <div className="mk-obs-why"><b>Why this observation</b><ol>{o.reasons.map((r, i) => <li key={i}>{r}</li>)}</ol></div>
      <p className="mk-obs-unc"><b>Uncertainty</b>{o.uncertainty}</p>
    </article>
  );
}

export interface HudReading { label: string; unit: string; display: string; frac: number }
export interface Hud { crew: string; day: number; time: string; readings: HudReading[] }

/** Latest sample of one fictional demo crew member, for the NOX MED terminal. Ring position = where the value sits around its default reference interval. */
const SHORT = { pH: "pH", pCO2: "pCO₂", Lac: "Lactate" } as const;
export function hudData(): Hud | null {
  const { labs, crew } = evidence();
  const last = labs[labs.length - 1]; if (!last) return null;
  const readings: HudReading[] = (["pH", "pCO2", "Lac"] as const).flatMap((k) => {
    const v = last.values[k], m = METRICS[k]; if (v === undefined || Number.isNaN(v)) return [];
    const span = m.refHigh - m.refLow, frac = Math.max(0.04, Math.min(1, (v - (m.refLow - span)) / (3 * span)));
    return [{ label: SHORT[k], unit: m.unit || m.label, display: fmt(k, v), frac }];
  });
  return { crew: crew.id, day: last.missionDay, time: last.collectedAt.slice(11, 16), readings };
}
