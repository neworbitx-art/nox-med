/**
 * Server components that render REAL NOX MED output (same chart component and rule engine as the demo)
 * for one fictional demo crew member. Only the plotted points and one observation reach the browser.
 */
import { DATASETS, labsFor, setActiveDataset } from "@/lib/data";
import { METRICS, fmt } from "@/lib/metrics";
import { trendOf } from "@/lib/analysis";
import { analyzeLabs, type Observation } from "@/lib/clinical";
import { rangeFor } from "@/lib/validity";
import { pointsFor, yDomain } from "@/lib/chartutil";
import { TrendChart } from "./TrendChart";
import type { MetricKey } from "@/lib/types";

const CREW_ID = "A-03";
const SERIES_COLOR = "#00CFFF";

function evidence() {
  setActiveDataset("NOX-01"); // idempotent; keeps shared module state on the dataset this panel reads
  const d = DATASETS["NOX-01"];
  const crew = d.astronauts.find((a) => a.id === CREW_ID)!;
  const labs = labsFor(d.labs, CREW_ID).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  return { d, crew, labs };
}

export function TrendPanel() {
  const { d, crew, labs } = evidence();
  const domain: [number, number] = [1, d.mission.currentDay + 1];
  const keys: MetricKey[] = ["pCO2", "pH"];
  return (
    <div className="mk-panel mk-evidence">
      <header><span>NOX MED · LONGITUDINAL BLOOD GAS</span><span>{CREW_ID} · {d.mission.id}</span></header>
      {keys.map((k, i) => {
        const m = METRICS[k];
        const t = trendOf(labs, k);
        const ref = rangeFor(k, "capillary", crew.sex);
        const base = t ? { mean: t.baselineMean, sd: t.baselineSd } : null;
        const pts = pointsFor(labs, k, 1, "all", true);
        const vals = pts.map((p) => p.v as number);
        const yd = yDomain(vals, [ref?.low ?? vals[0], ref?.high ?? vals[0], ...(base ? [base.mean - 2 * base.sd, base.mean + 2 * base.sd] : [])]);
        return (
          <figure key={k} className="mk-fig">
            <figcaption>
              <b>{m.name} <span>({m.label})</span></b>
              <span>{m.unit || "unitless"}{t && <> · baseline {fmt(k, t.baselineMean)} · drift {t.z >= 0 ? "+" : ""}{t.z.toFixed(1)}σ · latest {fmt(k, t.latest)}</>}</span>
            </figcaption>
            <TrendChart series={[{ id: CREW_ID, label: CREW_ID, color: SERIES_COLOR, points: pts }]} domain={domain} yDomain={yd} unit={m.unit} decimals={m.decimals + 1}
              range={ref ? { low: ref.low, high: ref.high } : null} baseline={base} height={i === keys.length - 1 ? 200 : 170} xLabel={i === keys.length - 1} />
          </figure>
        );
      })}
      <ul className="mk-legend" aria-label="Chart legend">
        <li><i className="lg-dot" />Measured sample</li>
        <li><i className="lg-dot lg-hollow" />Excluded from trend (QC flag / not interpretable)</li>
        <li><i className="lg-band lg-ref" />Reference interval</li>
        <li><i className="lg-band lg-base" />Personal baseline ±2 SD</li>
      </ul>
      <p className="mk-note">The same chart component as the demo&apos;s Blood Gas Intelligence page. Records are fictional demo data.</p>
    </div>
  );
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
