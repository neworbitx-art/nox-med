"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, PencilLine, Trash2, XCircle } from "lucide-react";
import { useMission } from "@/lib/store";
import { ANALYTE_KEYS, analyteMeta, draftFromExtraction, emptyDraft, parseAblText, toUploadedLab, validateDraft, type AnalyteKey, type Draft } from "@/lib/ablreport";
import { extractPdfText, loadPdfJs } from "@/lib/pdftext";
import { SYNTHETIC_REPORT_TEXT } from "@/lib/samplereport";
import type { SampleType } from "@/lib/types";
import { Btn, Card, Select, Tag } from "@/components/ui";

type Status = { kind: "idle" } | { kind: "info" | "warn" | "error"; text: string };
const MAX_BYTES = 15 * 1024 * 1024;
const inp = "num w-full rounded-sm border border-line bg-panel px-2 py-1 text-[13px] text-ink outline-none focus:border-accent";

export function ReportImport() {
  const { addUploaded, uploadedLabs } = useMission();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [preview, setPreview] = useState<{ url: string; kind: "image" | "pdf" } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const issues = useMemo(() => (draft ? validateDraft(draft) : []), [draft]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const reset = () => { setDraft(null); setPreview(null); setStatus({ kind: "idle" }); if (fileRef.current) fileRef.current.value = ""; };
  const nextLabel = () => `Subject ${new Set(uploadedLabs.map((l) => l.subjectLabel)).size + 1}`;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setSaved(false); setBusy(true);
    const lower = f.name.toLowerCase();
    const isPdf = f.type === "application/pdf" || lower.endsWith(".pdf");
    const isImg = /^image\/(png|jpe?g)$/.test(f.type) || /\.(png|jpe?g)$/.test(lower);
    try {
      if (!isPdf && !isImg) { setStatus({ kind: "error", text: "Unsupported file type. Use PDF, PNG or JPG." }); return; }
      if (f.size > MAX_BYTES) { setStatus({ kind: "error", text: "File is larger than 15 MB." }); return; }
      setPreview({ url: URL.createObjectURL(f), kind: isPdf ? "pdf" : "image" });
      if (isImg) {
        setDraft(emptyDraft("image-manual", nextLabel()));
        setStatus({ kind: "warn", text: "Automatic reading of images is not available in this version (OCR would need an external service or model download, which is not used here). Nothing was extracted. Read the values from the image and enter them in the table; they remain unverified until you confirm each one." });
        return;
      }
      const pdfjs = await loadPdfJs();
      const { text, pages } = await extractPdfText(await f.arrayBuffer(), pdfjs);
      const rep = parseAblText(text);
      const n = Object.keys(rep.fields).length;
      if (!text.trim() || n === 0) {
        setDraft(emptyDraft("manual", nextLabel()));
        setStatus({ kind: "warn", text: text.trim() ? "The PDF has text, but no ABL90-style analytes were recognized. Nothing was extracted; enter the values manually." : "This PDF has no text layer (it looks scanned). Automatic reading is not available; enter the values manually while viewing the document." });
        return;
      }
      setDraft(draftFromExtraction(rep, nextLabel()));
      setStatus({ kind: "info", text: `Text layer read (${pages} page${pages > 1 ? "s" : ""}): ${n} analytes recognized from ${rep.recognizedLines}/${rep.totalLines} lines. Review every value against the document; nothing is accepted until you confirm it.` });
    } catch (e) {
      setDraft(emptyDraft("manual", nextLabel()));
      setStatus({ kind: "error", text: `Could not read this file (${e instanceof Error ? e.message : "unknown error"}). Use manual entry.` });
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const startManual = () => { setSaved(false); setPreview(null); setDraft(emptyDraft("manual", nextLabel())); setStatus({ kind: "info", text: "Manual entry. Fill only the analytes that are on your report; leave the rest unavailable." }); };
  const startExample = () => {
    setSaved(false); setPreview(null);
    setDraft(draftFromExtraction(parseAblText(SYNTHETIC_REPORT_TEXT), nextLabel()));
    setStatus({ kind: "info", text: "Example report. Parsed from text; confirm each row to enable saving." });
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setField = (k: AnalyteKey, text: string) => setDraft((d) => {
    if (!d) return d;
    const f = d.fields[k];
    const source = text.trim() === "" ? "unavailable" : f.source === "extracted" && text === f.text ? "extracted" : f.source === "extracted" ? "extracted" : "manual";
    return { ...d, fields: { ...d.fields, [k]: { ...f, text, source, checked: false } } };
  });
  const toggle = (k: AnalyteKey, checked: boolean) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [k]: { ...d.fields[k], checked } } } : d));
  const confirmAll = () => setDraft((d) => d && ({ ...d, fields: Object.fromEntries(ANALYTE_KEYS.map((k) => [k, { ...d.fields[k], checked: d.fields[k].text.trim() !== "" }])) as Draft["fields"] }));
  const errFor = (k: string) => issues.find((i) => i.field === k && i.level === "error");

  const save = () => { if (!draft || errors.length) return; addUploaded(toUploadedLab(draft)); setSaved(true); reset(); };

  return (
    <div className="space-y-4">
      <Card code="UPL-SRC" title="1 · Provide a report" subtitle="ABL90-style printout as PDF, PNG or JPG, or enter the values manually. Files are read in your browser and are not uploaded or stored.">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Upload report file" />
          <Btn onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={14} /> {busy ? "Reading…" : "Choose PDF / PNG / JPG"}</Btn>
          <Btn variant="ghost" onClick={startManual}><PencilLine size={14} /> Enter manually</Btn>
          <Btn variant="ghost" onClick={startExample}>Load example report</Btn>
          {draft && <Btn variant="ghost" onClick={reset}>Discard</Btn>}
        </div>
        {saved && <div className="mt-3 flex items-center gap-2 rounded-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok"><CheckCircle2 size={16} /> Report saved. It appears in the longitudinal chart below.</div>}
        {status.kind !== "idle" && (
          <div className={`mt-3 flex items-start gap-2 rounded-sm border px-3 py-2 text-[13px] ${status.kind === "error" ? "border-crit/40 bg-crit/10 text-crit" : status.kind === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-bg2 text-ink2"}`}>
            {status.kind === "error" ? <XCircle size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}<span>{status.text}</span>
          </div>
        )}
        <p className="mt-3 border-t border-line pt-2 text-xs text-mute">Real clinical reports stay separate from the simulated crew dataset: they are stored only in this browser, are not merged into crew trends or alerts, and the report&apos;s patient ID, name and sample number are never saved.</p>
      </Card>

      {draft && (
        <div className={`grid gap-4 ${preview ? "xl:grid-cols-[2fr_3fr]" : ""}`}>
          {preview && (
            <Card code="UPL-DOC" title="Source document" right={preview.kind === "image" && <Btn variant="ghost" onClick={() => setZoom((z) => !z)}>{zoom ? "Fit" : "Zoom"}</Btn>}>
              <div className="max-h-[900px] overflow-auto rounded-sm border border-line bg-bg2">
                {preview.kind === "image"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={preview.url} alt="Uploaded report (local preview)" className={zoom ? "w-[220%] max-w-none" : "w-full"} />
                  : <iframe src={preview.url} title="Uploaded PDF (local preview)" className="h-[800px] w-full" />}
              </div>
            </Card>
          )}

          <Card code="UPL-VER" title="2 · Verify and edit" subtitle={draft.source === "pdf-text" ? "Extracted from the PDF text layer. Edit anything that is wrong." : "Entered manually. Missing analytes stay unavailable."}
            right={<div className="flex gap-2"><Btn variant="ghost" onClick={confirmAll}>Mark filled rows as checked</Btn><Btn onClick={save} disabled={errors.length > 0}>Save verified report</Btn></div>}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="meta block">Sample date (UTC-agnostic)<input type="date" className={`${inp} mt-1`} value={draft.date} onChange={(e) => set({ date: e.target.value, dateAmbiguous: false })} aria-invalid={!!errFor("date")} /></label>
              <label className="meta block">Sample time (24 h)<input type="time" className={`${inp} mt-1`} value={draft.time} onChange={(e) => set({ time: e.target.value })} aria-invalid={!!errFor("time")} /></label>
              <label className="meta block">Subject label (pseudonym)<input className={`${inp} mt-1`} value={draft.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Subject 1" /></label>
              <div className="meta"><Select<SampleType> label="Sample type" value={draft.sampleType} onChange={(v) => set({ sampleType: v })} options={[{ value: "unknown", label: "Unknown" }, { value: "arterial", label: "Arterial" }, { value: "venous", label: "Venous" }, { value: "capillary", label: "Capillary" }]} /></div>
              <label className="meta block">Temperature (°C)<input className={`${inp} mt-1`} inputMode="decimal" value={draft.temperature} onChange={(e) => set({ temperature: e.target.value })} aria-invalid={!!errFor("temperature")} /></label>
              <label className="meta block">FiO₂ (%)<input className={`${inp} mt-1`} inputMode="decimal" value={draft.fio2} onChange={(e) => set({ fio2: e.target.value })} aria-invalid={!!errFor("fio2")} /></label>
            </div>
            {draft.reportPatientId && <p className="mt-2 text-xs text-mute">Detected patient identifier on the report: <span className="num">{draft.reportPatientId}</span> — shown for your reference only; it is not stored. Use a pseudonymous label above.</p>}
            {draft.dateAmbiguous && <p className="mt-1 text-xs text-warn">Day/month order on the report is ambiguous; confirm the date.</p>}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                  <th className="py-1 pr-2 font-medium">Analyte</th><th className="py-1 pr-2 font-medium">Value</th><th className="py-1 pr-2 font-medium">Unit</th><th className="py-1 pr-2 font-medium">Origin</th><th className="py-1 pr-2 font-medium">Analyzer</th><th className="py-1 text-center font-medium">Checked</th>
                </tr></thead>
                <tbody>
                  {ANALYTE_KEYS.map((k) => {
                    const f = draft.fields[k]; const m = analyteMeta(k); const e = errFor(k);
                    const flag = draft.flags.find((x) => x.analyte === k);
                    return (
                      <tr key={k} className="border-t border-line/60 align-middle">
                        <td className="py-1.5 pr-2"><span className="font-medium">{m.label}</span></td>
                        <td className="w-32 py-1.5 pr-2"><input className={`${inp} ${e ? "border-crit" : ""}`} inputMode="decimal" value={f.text} placeholder="unavailable" onChange={(ev) => setField(k, ev.target.value)} aria-label={`${m.label} value`} aria-invalid={!!e} title={e?.message} /></td>
                        <td className="num py-1.5 pr-2 text-xs text-mute">{m.unit}</td>
                        <td className="py-1.5 pr-2 text-xs">{f.source === "unavailable" ? <span className="text-mute">Unavailable</span> : <span>{f.source === "extracted" ? "Extracted" : "Manual"}{f.note ? <span className="text-mute"> · {f.note}</span> : null}</span>}</td>
                        <td className="py-1.5 pr-2 text-xs">
                          <span className="inline-flex flex-wrap gap-1">
                            {f.calculated && <Tag tone="calc">calculated</Tag>}
                            {(flag || f.questionable) && <Tag tone="warn">{flag?.code ?? "?"}</Tag>}
                          </span>
                        </td>
                        <td className="py-1.5 text-center"><input type="checkbox" className="h-4 w-4 accent-[#38C9F4]" checked={f.checked} disabled={f.text.trim() === ""} onChange={(ev) => toggle(k, ev.target.checked)} aria-label={`${m.label} matches the source`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {draft.flags.length > 0 && (
              <div className="mt-4 rounded-sm border border-warn/40 bg-warn/10 p-3 text-[13px] text-ink2">
                <p className="meta mb-1 text-warn">Analyzer warnings (preserved)</p>
                <ul className="space-y-0.5">{draft.flags.map((f, i) => <li key={i}><span className="num font-semibold">{f.analyte ? analyteMeta(f.analyte).label : "General"}</span> · {f.message}</li>)}</ul>
                <p className="mt-1 text-xs text-mute">Flagged analytes are saved and shown, but excluded from trend baselines and never treated as clinically valid.</p>
              </div>
            )}

            <div className="mt-4" aria-live="polite">
              {errors.length > 0 && <div className="rounded-sm border border-crit/40 bg-crit/10 p-3 text-[13px] text-crit"><p className="meta mb-1 text-crit">Resolve before saving ({errors.length})</p><ul className="list-disc pl-5">{errors.slice(0, 8).map((i, n) => <li key={n}>{i.message}</li>)}{errors.length > 8 && <li>…and {errors.length - 8} more (rows still unchecked)</li>}</ul></div>}
              {warnings.filter((w) => !draft.flags.some((f) => w.message.includes(f.message))).length > 0 && (
                <div className="mt-2 rounded-sm border border-line bg-bg2 p-3 text-[13px] text-ink2"><p className="meta mb-1">Check</p><ul className="list-disc pl-5">{warnings.filter((w) => !draft.flags.some((f) => w.message.includes(f.message))).map((i, n) => <li key={n}>{i.message}</li>)}</ul></div>
              )}
              {errors.length === 0 && <p className="mt-2 flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 size={15} /> Ready to save. Saving records an operator-verified transcription, not a clinical validation.</p>}
            </div>
            <div className="mt-3 flex justify-end"><Btn variant="ghost" onClick={reset}><Trash2 size={14} /> Discard draft</Btn></div>
          </Card>
        </div>
      )}
    </div>
  );
}
