"use client";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useMission } from "@/lib/store";
import { METRICS } from "@/lib/metrics";
import { comparable, rangeFor, validityOf } from "@/lib/validity";
import { yDomain } from "@/lib/chartutil";
import type { AstronautId, LabResult, MetricKey, UploadedLab } from "@/lib/types";
import { LabChart, MarkerLegend, type Pt } from "@/components/labchart";
import { Btn, Card, Chip, Select, Tag } from "@/components/ui";

const KEYS: MetricKey[] = ["pH", "pCO2", "pO2", "HCO3", "BE", "Lac", "Na", "K", "Cl", "iCa", "Glu", "tHb", "Hct", "sO2", "COHb", "MetHb"];
const DAY = 86400000;

/** Adapter so the shared validity rules (sample type, QC flags, verification) apply unchanged. */
const asLab = (u: UploadedLab): LabResult => ({ id: u.id, astronautId: "UPLOADED" as AstronautId, missionDay: 0, collectedAt: u.collectedAt, sampleType: u.sampleType, analyzer: u.analyzer, origin: "imported", verification: u.verification, qcFlags: u.qcFlags, fio2: u.fio2, values: u.values });

export function UploadedTrends() {
  const { uploadedLabs, removeUploaded, clearUploaded } = useMission();
  const subjects = useMemo(() => [...new Set(uploadedLabs.map((l) => l.subjectLabel))], [uploadedLabs]);
  const [subject, setSubject] = useState<string>("");
  const [key, setKey] = useState<MetricKey>("pH");
  const sel = subjects.includes(subject) ? subject : subjects[0] ?? "";
  const rows = useMemo(() => uploadedLabs.filter((l) => l.subjectLabel === sel).sort((a, b) => Date.parse(a.collectedAt) - Date.parse(b.collectedAt)), [uploadedLabs, sel]);
  const t0 = rows.length ? Date.parse(rows[0].collectedAt) : 0;

  const pts: Pt[] = rows.filter((l) => l.values[key] !== undefined).map((u) => {
    const lab = asLab(u);
    return { id: u.id, t: (Date.parse(u.collectedAt) - t0) / DAY, v: u.values[key]!, collectedAt: u.collectedAt, sampleType: u.sampleType, verification: u.verification, validity: validityOf(lab, key).level, interpretable: comparable(lab, key), flags: lab.qcFlags.filter((f) => f.analytes.includes(key)).map((f) => f.code) };
  });
  const span = pts.length ? pts[pts.length - 1].t : 0;
  const domain: [number, number] = [Math.min(0, pts[0]?.t ?? 0) - Math.max(0.5, span * 0.04), span + Math.max(0.5, span * 0.04)];
  const m = METRICS[key];
  const refType = rows.find((r) => r.values[key] !== undefined)?.sampleType ?? "unknown";
  const rng = rangeFor(key, refType);
  const vals = pts.map((p) => p.v as number);
  const yd = yDomain(vals, rng && vals.length ? [rng.low, rng.high].filter((x) => x > Math.min(...vals) - 2 * (Math.max(...vals) - Math.min(...vals) || 1) && x < Math.max(...vals) + 2 * (Math.max(...vals) - Math.min(...vals) || 1)) : []);

  return (
    <Card code="UPL-TRD" title="Longitudinal view of uploaded reports" subtitle="Real transcribed reports, separate from the crew trends. Day 0 = first uploaded sample for the subject."
      right={<Btn variant="danger" onClick={() => { if (confirm("Remove all uploaded reports from this browser?")) clearUploaded(); }} disabled={!uploadedLabs.length}><Trash2 size={14} /> Remove all ({uploadedLabs.length})</Btn>}>
      {uploadedLabs.length === 0 ? <p className="text-sm text-mute">No uploaded reports saved yet. Verified reports will be plotted here.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select label="Subject" value={sel} onChange={setSubject} options={subjects.map((s) => ({ value: s, label: s }))} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Analyte">{KEYS.map((k) => <Chip key={k} active={k === key} onClick={() => setKey(k)}>{METRICS[k].label}</Chip>)}</div>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-sm"><span className="font-semibold">{m.name}</span> <span className="text-xs text-mute">{m.unit}</span> <Tag tone="warn">uploaded report</Tag></p>
            {pts.length === 0 ? <p className="text-sm text-mute">No {m.label} values for this subject (unavailable in the saved reports).</p> : (
              <>
                <LabChart series={[{ id: "u", label: sel, color: "#38C9F4", points: pts }]} domain={domain} yDomain={yd} unit={m.unit} decimals={m.decimals + 1} ref={rng} height={240} xLabelText="Days since first uploaded sample (true time scale)" breakGapDays={Math.max(30, span)} />
                <p className="mt-1 text-[11px] text-mute">
                  {pts.length} point{pts.length > 1 ? "s" : ""}. {yd[0] > 0 && "Y-axis does not start at zero. "}Gas values from venous or unknown samples are plotted but marked not-interpreted; flagged analytes are hollow and excluded from trends. Reference band shown only when the sample type allows interpretation.
                </p>
                <div className="mt-2 border-t border-line pt-2"><MarkerLegend /></div>
              </>
            )}
          </div>
          <div className="mt-4 overflow-x-auto border-t border-line pt-3">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-1 pr-2 font-medium">Collected (as printed)</th><th className="py-1 pr-2 font-medium">Type</th><th className="py-1 pr-2 font-medium">Source</th><th className="py-1 pr-2 text-right font-medium">Analytes</th><th className="py-1 pr-2 font-medium">Warnings</th><th /></tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l.id} className="border-t border-line/60">
                  <td className="num py-1.5 pr-2">{l.collectedAt.replace("T", " ").replace(":00Z", "")}</td><td className="py-1.5 pr-2 text-xs">{l.sampleType}</td>
                  <td className="py-1.5 pr-2 text-xs text-mute">{l.source === "pdf-text" ? "PDF text" : l.source === "image-manual" ? "Image (manual)" : "Manual"}</td>
                  <td className="num py-1.5 pr-2 text-right">{Object.keys(l.values).length + Object.keys(l.extra).length}</td>
                  <td className="py-1.5 pr-2 text-xs text-warn">{[...new Set(l.qcFlags.map((f) => f.code))].join(", ") || "—"}</td>
                  <td className="py-1.5 text-right"><button className="text-xs text-crit hover:underline" onClick={() => removeUploaded(l.id)} aria-label="Delete record">Delete</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
