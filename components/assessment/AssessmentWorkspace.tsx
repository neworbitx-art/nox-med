"use client";
import { useMemo, useState } from "react";
import { useMission } from "@/lib/store";
import { baseVitals } from "@/lib/data";
import {
  ACTION_LABEL, QUALITY_LABEL, ROLE_ACTIONS, SYMPTOM_LIMITS, SYMPTOM_SEVERITIES, NOTE_LIMIT, STATUS_LABEL,
  acidBaseCalcs, assessmentObservations, changeSummary, createReview, createSymptom, measurementRows, reliabilityOf,
  reviewStatus, reviewsFor, symptomsFor, vitalRows, isOpenForReview,
  type ReviewAction, type Role, type SymptomSeverity, type ViewMode,
} from "@/lib/assessment";

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const SEV_TONE: Record<string, string> = { critical: "text-[#ff6b6b]", warning: "text-[#ffb454]", watch: "text-[#38C9F4]", info: "text-ink2" };
const Q_TONE: Record<string, string> = { "qc-clean": "text-[#38C9F4]", limited: "text-[#ffb454]", flagged: "text-[#ff6b6b]", "not-interpreted": "text-[#ffb454]", "not-measured": "text-mute" };
const when = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "—");

export function AssessmentWorkspace({ missionId, missionCode, astronautId, crewLabel, role }: { missionId: string; missionCode: string; astronautId: string; crewLabel: string; role: string }) {
  const { labs, symptoms, addSymptom, removeSymptom, reviews, addReview, currentDay } = useMission();
  const [view, setView] = useState<ViewMode>("astronaut");
  const r: Role = view === "astronaut" ? "astronaut" : "medical-officer";

  const { sample, rows } = useMemo(() => measurementRows(labs, astronautId), [labs, astronautId]);
  const { observations } = useMemo(() => assessmentObservations(labs, astronautId), [labs, astronautId]);
  const vit = useMemo(() => vitalRows(baseVitals, astronautId), [astronautId]);
  const changes = useMemo(() => changeSummary(rows), [rows]);
  const calcs = useMemo(() => (sample ? acidBaseCalcs(sample) : []), [sample]);
  const mySymptoms = symptomsFor(symptoms, missionId, astronautId);
  const myReviews = reviewsFor(reviews, missionId, astronautId);
  const open = observations.filter((o) => o.severity !== "info" && isOpenForReview(reviewStatus(myReviews, o.id).status));

  return (
    <section className="glass-curve mt-3 overflow-hidden" data-testid="assessment" data-view={view} aria-label="Astronaut health assessment">
      <div className="p-sec flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="p-lab">Health assessment · {missionCode}</div>
          <h2 className="mt-1 text-[18px] font-semibold text-ink">{crewLabel}</h2>
          <p className="text-[11px] text-mute">Demonstration data. Decision support for review; not a diagnosis.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1.5" role="group" aria-label="Assessment view">
            {(["astronaut", "officer"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} data-view-option={v} data-on={view === v} className="g-btn !rounded-full px-3 py-1 text-[11px]">{v === "astronaut" ? "Astronaut view" : "Medical officer view"}</button>
            ))}
          </div>
          <span className="text-[10px] text-mute">Demonstration role selector, not authentication.</span>
        </div>
      </div>

      {/* A — identification */}
      <div className="p-sec" data-testid="sec-a">
        <div className="p-lab">A · Identification</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] md:grid-cols-4">
          <div><dt className="text-mute">Astronaut</dt><dd className="text-ink">{crewLabel}</dd></div>
          <div><dt className="text-mute">Role</dt><dd className="text-ink">{role}</dd></div>
          <div><dt className="text-mute">Mission</dt><dd className="text-ink">{missionCode} · day {currentDay}</dd></div>
          <div><dt className="text-mute">Latest sample</dt><dd className="text-ink">{sample ? `${sample.sampleType}, ${when(sample.collectedAt)}` : "none"}</dd></div>
        </dl>
      </div>

      {/* B — current physiological state */}
      <div className="p-sec" data-testid="sec-b">
        <div className="p-lab">B · Current physiological state</div>
        {!sample ? <p className="mt-2 text-[12px] text-mute">No laboratory result is recorded for this astronaut in this mission.</p> : (
          <>
            {view === "astronaut" ? (
              <div className="mt-2" data-testid="change-summary">
                <p className="text-[13px] text-ink">{changes.length ? "What changed compared with your usual:" : "No measurement is clearly outside your own usual range."}</p>
                {changes.length > 0 && <ul className="mt-1 list-disc pl-5 text-[12px] text-ink2">{changes.map((c) => <li key={c.key}>{c.text}</li>)}</ul>}
                <p className="mt-1 text-[10px] text-mute">Last blood sample: {when(sample.collectedAt)}.</p>
              </div>
            ) : null}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[11px]" data-testid="measure-table">
                <thead className="text-mute"><tr><th className="py-1 pr-3">Analyte</th><th className="pr-3">Value</th><th className="pr-3">Unit</th>{view === "officer" && <><th className="pr-3">Reference</th><th className="pr-3">Baseline Δ</th><th className="pr-3">Sample</th><th className="pr-3">Type</th></>}<th className="pr-3">Collected</th><th>Quality</th></tr></thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.key} className="border-t border-white/[0.07]" data-metric={x.key}>
                      <td className="py-1 pr-3 text-ink">{x.label}</td>
                      <td className="pr-3 font-mono text-ink">{x.display}</td>
                      <td className="pr-3 text-mute">{x.unit}</td>
                      {view === "officer" && <>
                        <td className="pr-3 text-ink2">{x.range ? `${x.range.low}–${x.range.high}` : "—"}</td>
                        <td className="pr-3 text-ink2">{x.baseline ? `${x.baseline.delta >= 0 ? "+" : ""}${x.baseline.delta.toFixed(2)} (z ${x.baseline.z.toFixed(1)})` : "—"}</td>
                        <td className="pr-3 text-ink2">{x.sampleType ?? "—"}</td>
                        <td className="pr-3 text-ink2">{x.provenance}</td>
                      </>}
                      <td className="pr-3 text-ink2">{when(x.collectedAt)}</td>
                      <td className={Q_TONE[x.quality]} title={x.qualityNote}>{QUALITY_LABEL[x.quality]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sample.sampleType === "venous" && <p className="mt-2 text-[10px] text-mute">Venous sample: pO₂ and SpO₂-based oxygenation values are not read as arterial oxygenation.</p>}
          </>
        )}
        <div className="mt-3" data-testid="wearables">
          <div className="p-lab">Wearable vitals <span className="normal-case tracking-normal text-mute">(device estimates)</span></div>
          <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[12px] md:grid-cols-4">
            {vit.map((v) => <li key={v.key} className="flex justify-between gap-2"><span className="text-mute">{v.label}</span><span className="font-mono text-ink">{v.display}{v.value !== null ? ` ${v.unit}` : ""}{view === "officer" && v.delta !== null ? ` (${v.delta >= 0 ? "+" : ""}${v.delta.toFixed(1)})` : ""}</span></li>)}
          </ul>
        </div>
        {view === "officer" && calcs.length > 0 && (
          <div className="mt-3" data-testid="calcs">
            <div className="p-lab">Acid–base calculations</div>
            <ul className="mt-1 space-y-1 text-[12px]">{calcs.map((c) => <li key={c.id}><span className="text-ink">{c.label}:</span> <span className="font-mono text-ink">{c.value ?? "not calculated"}</span> <span className="text-mute">— {c.note}</span></li>)}</ul>
          </div>
        )}
      </div>

      {/* C — symptoms */}
      <SymptomSection missionId={missionId} astronautId={astronautId} currentDay={currentDay} list={mySymptoms} onAdd={addSymptom} onRemove={removeSymptom} />

      {/* D — medical review */}
      <div className="p-sec" data-testid="sec-d">
        <div className="p-lab">D · Medical review</div>
        <p className="mt-1 text-[12px] text-ink2" data-testid="open-count">{open.length ? `${open.length} observation${open.length > 1 ? "s" : ""} need review.` : "No observation is waiting for review."}</p>
        <ul className="mt-2 space-y-2">
          {observations.map((o) => {
            const st = reviewStatus(myReviews, o.id), smp = labs.find((l) => l.id === o.sampleId), rel = reliabilityOf(o, smp);
            return (
              <li key={o.id} className="rounded-2xl border border-white/[0.12] p-3" data-observation={o.id} data-review-status={st.status}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{o.title}</span>
                  <span className={`font-mono text-[10px] uppercase ${SEV_TONE[o.severity]}`}>{o.severity} · day {o.missionDay}</span>
                </div>
                <dl className="mt-1 grid gap-1 text-[12px] md:grid-cols-2">
                  <div><dt className="p-lab">What changed</dt><dd className="text-ink2">{o.current}{o.previous ? ` (before: ${o.previous})` : ""}{o.baseline ? `; baseline ${o.baseline}` : ""}</dd></div>
                  <div><dt className="p-lab">Why it matters</dt><dd className="text-ink2">{o.significance}</dd></div>
                  <div><dt className="p-lab">How reliable</dt><dd className="text-ink2">{o.validityNote} {rel.sampleType ? `Sample: ${rel.sampleType}.` : ""}{view === "officer" && rel.analyzer ? ` Analyzer: ${rel.analyzer}.` : ""}{rel.flags.length ? ` Flags: ${rel.flags.join("; ")}.` : ""}{rel.missing.length ? ` Missing: ${rel.missing.join(" ")}` : ""}</dd></div>
                  <div><dt className="p-lab">What needs review</dt><dd className="text-ink2">{o.uncertainty}</dd></div>
                </dl>
                {view === "officer" && <details className="mt-1 text-[11px] text-mute"><summary className="cursor-pointer">Rule steps</summary><ol className="mt-1 list-decimal pl-5">{o.reasons.map((x, i) => <li key={i}>{x}</li>)}</ol><p className="mt-1">Reference: {o.reference}</p></details>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink" data-testid="review-status">{STATUS_LABEL[st.status]}{st.last ? ` · ${when(st.last.at)}` : ""}</span>
                  <ReviewActions role={r} onAct={(action, note) => {
                    const res = createReview({ missionId, astronautId, observationId: o.id, observationTitle: o.title, sampleId: o.sampleId, action, by: r, note, validity: o.validity }, { now: new Date().toISOString(), id: uid("REV") });
                    if (res.ok) addReview(res.value); return res.ok ? null : res.errors.join(" ");
                  }} />
                </div>
              </li>
            );
          })}
          {observations.length === 0 && <li className="text-[12px] text-mute">No observations for this astronaut.</li>}
        </ul>
        {view === "officer" && myReviews.length > 0 && (
          <div className="mt-3" data-testid="review-log"><div className="p-lab">Documentation log</div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-ink2">{[...myReviews].sort((a, b) => b.at.localeCompare(a.at)).map((e) => <li key={e.id}>{when(e.at)} · {ACTION_LABEL[e.action]} ({e.by}) · {e.observationTitle}{e.note ? ` — ${e.note}` : ""}</li>)}</ul>
          </div>
        )}
        <p className="mt-3 text-[10px] text-mute">Rules are deterministic and explainable. Nothing here is a diagnosis or a treatment or medication recommendation.</p>
      </div>
    </section>
  );
}

function ReviewActions({ role, onAct }: { role: Role; onAct: (a: ReviewAction, note: string) => string | null }) {
  const [note, setNote] = useState(""), [err, setErr] = useState<string | null>(null);
  return (
    <>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_LIMIT + 50} placeholder="Optional note" aria-label="Review note" className="g-btn !rounded-full px-3 py-1 text-[11px]" />
      {ROLE_ACTIONS[role].map((a) => <button key={a} data-action={a} onClick={() => { const e = onAct(a, note); setErr(e); if (!e) setNote(""); }} className="g-btn !rounded-full px-3 py-1 text-[11px]">{ACTION_LABEL[a]}</button>)}
      {err && <span role="alert" className="text-[11px] text-[#ff6b6b]">{err}</span>}
    </>
  );
}

function SymptomSection({ missionId, astronautId, currentDay, list, onAdd, onRemove }: { missionId: string; astronautId: string; currentDay: number; list: ReturnType<typeof symptomsFor>; onAdd: (s: ReturnType<typeof symptomsFor>[number]) => void; onRemove: (id: string) => void }) {
  const [symptom, setSymptom] = useState(""), [onset, setOnset] = useState(String(currentDay)), [sev, setSev] = useState<SymptomSeverity>("mild"), [notes, setNotes] = useState(""), [errs, setErrs] = useState<string[]>([]);
  const submit = () => {
    const res = createSymptom({ missionId, astronautId, symptom, onsetDay: Number(onset), severity: sev, notes }, { currentDay, now: new Date().toISOString(), id: uid("SYM") });
    if (!res.ok) return setErrs(res.errors);
    onAdd(res.value); setErrs([]); setSymptom(""); setNotes("");
  };
  return (
    <div className="p-sec" data-testid="sec-c">
      <div className="p-lab">C · Symptom assessment</div>
      <p className="mt-1 text-[11px] text-mute">Symptom reports are stored separately and never change laboratory measurements.</p>
      <div className="mt-2 grid gap-2 md:grid-cols-[2fr_90px_130px]">
        <input value={symptom} onChange={(e) => setSymptom(e.target.value)} maxLength={SYMPTOM_LIMITS.symptom + 20} placeholder="Symptom (e.g. headache)" aria-label="Symptom" className="g-btn px-3 py-1.5 text-[12px]" />
        <input value={onset} onChange={(e) => setOnset(e.target.value)} inputMode="numeric" aria-label="Onset mission day" placeholder="Onset day" className="g-btn px-3 py-1.5 text-[12px]" />
        <select value={sev} onChange={(e) => setSev(e.target.value as SymptomSeverity)} aria-label="Severity" className="g-btn px-3 py-1.5 text-[12px]">{SYMPTOM_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" aria-label="Symptom notes" className="g-btn mt-2 w-full px-3 py-1.5 text-[12px]" />
      <div className="mt-2 flex items-center gap-3"><button onClick={submit} data-testid="add-symptom" className="g-btn !rounded-full px-4 py-1 text-[11px]">Document symptom</button>{errs.length > 0 && <span role="alert" className="text-[11px] text-[#ff6b6b]">{errs.join(" ")}</span>}</div>
      <ul className="mt-2 space-y-1 text-[12px]" data-testid="symptom-list">
        {list.length === 0 && <li className="text-mute">No symptoms documented.</li>}
        {list.map((s) => <li key={s.id} className="flex items-baseline justify-between gap-3"><span className="text-ink2"><span className="text-ink">{s.symptom}</span> · {s.severity} · since day {s.onsetDay}{s.notes ? ` — ${s.notes}` : ""} <span className="text-mute">(reported {when(s.reportedAt)})</span></span><button onClick={() => onRemove(s.id)} className="text-[10px] text-mute hover:text-ink">Remove</button></li>)}
      </ul>
    </div>
  );
}
