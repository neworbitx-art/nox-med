"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, Trash2, XCircle } from "lucide-react";
import { useMission } from "@/lib/store";
import { SAMPLE_CSV, parseLabCsv, type ParseOutput } from "@/lib/importer";
import { download } from "@/lib/analysis";
import { METRICS, fmt, statusOf } from "@/lib/metrics";
import { Btn, Card } from "@/components/ui";

const COLS = ["pH", "pCO2", "pO2", "sO2", "Hct", "K", "Glu", "Lac"] as const;

export function CsvImport() {
  const { addImported, importedLabs, clearImported, currentDay } = useMission();
  const [text, setText] = useState("");
  const [out, setOut] = useState<ParseOutput | null>(null);
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = (t: string) => { setOut(parseLabCsv(t, currentDay)); setDone(null); };
  const onFile = async (f: File | undefined) => { if (!f) return; const t = await f.text(); setFileName(f.name); setText(t); validate(t); };
  const valid = out?.rows.filter((r) => r.ok && r.result) ?? [];
  const invalid = out?.rows.filter((r) => !r.ok) ?? [];

  const doImport = () => {
    addImported(valid.map((r) => r.result!));
    setDone(valid.length); setOut(null); setText(""); setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <Card title="1 · Provide results" subtitle="Upload a CSV or paste its text. Header names are matched flexibly (pH, pCO2, cHCO3-, Ca2+, Lactate…).">
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Upload CSV file" />
            <Btn onClick={() => fileRef.current?.click()}><FileUp size={14} /> Choose CSV file</Btn>
            <Btn variant="ghost" onClick={() => { setText(SAMPLE_CSV); setFileName("sample"); validate(SAMPLE_CSV); }}>Load sample data</Btn>
            <Btn variant="ghost" onClick={() => download("nox-med_sample_abl90.csv", SAMPLE_CSV)}><Download size={14} /> Download template</Btn>
          </div>
          {fileName && <p className="mt-2 text-xs text-mute">Source: {fileName}</p>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} placeholder="sample_id,astronaut_id,mission_day,pH,pCO2,..."
            className="num mt-3 w-full rounded-sm border border-line bg-bg2 p-2 text-xs text-ink outline-none focus:border-accent" aria-label="CSV text" />
          <div className="mt-2 flex gap-2"><Btn onClick={() => validate(text)} disabled={!text.trim()}>Validate</Btn></div>
          <div className="mt-4 border-t border-line pt-3 text-xs text-mute">
            <p>Expected units: pCO₂/pO₂ mmHg · tHb g/dL · Hct, sO₂, FO₂Hb, COHb, MetHb % · Na, K, Cl, Ca²⁺, Lac, HCO₃, BE mmol/L · Glucose mg/dL.</p>
            <p className="mt-1">Required: <span className="num">astronaut_id</span> (A-01…A-04) and at least one measurement. Optional: <span className="num">collected_at</span> (ISO UTC; sets mission day), <span className="num">mission_day</span> (default {currentDay}), <span className="num">sample_type</span> (arterial/venous/capillary; default <b>unknown</b>), <span className="num">verification</span> (default <b>pending</b>), <span className="num">qc_flags</span> (HEMOLYSIS|AIR_BUBBLE|CLOT|INSUFFICIENT|DELAYED), <span className="num">fio2</span>.</p>
            <p className="mt-1">Unknown-type samples are stored but their gas values are not interpreted; flagged analytes are excluded from alerts and trends.</p>
          </div>
        </Card>

        <Card title="2 · Review and import" subtitle={out ? `${valid.length} valid · ${invalid.length} rejected` : "Validation results appear here"}
          right={out && !out.fatal && <Btn onClick={doImport} disabled={!valid.length}>Import {valid.length} row{valid.length === 1 ? "" : "s"}</Btn>}>
          {done !== null && (
            <div className="mb-3 flex items-center gap-2 rounded-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
              <CheckCircle2 size={16} /> Imported {done} sample{done === 1 ? "" : "s"}. View them in <Link href="/demo/blood-gas" className="underline">Blood Gas Intelligence</Link> or <Link href="/demo" className="underline">Mission Control</Link>.
            </div>
          )}
          {!out && done === null && <p className="text-sm text-mute">Nothing validated yet.</p>}
          {out?.fatal && <div className="flex items-center gap-2 rounded-sm border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit"><XCircle size={16} /> {out.fatal}</div>}
          {out && !out.fatal && (
            <>
              <p className="mb-2 text-xs text-mute">Recognized columns: {out.recognized.join(", ")}{out.ignored.length > 0 && <> · Ignored: <span className="text-warn">{out.ignored.join(", ")}</span></>}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                    <th className="py-1 pr-2 font-medium">Line</th><th className="py-1 pr-2 font-medium">Astronaut</th><th className="py-1 pr-2 font-medium">Day</th><th className="py-1 pr-2 font-medium">Type</th><th className="py-1 pr-2 font-medium">Verif.</th><th className="py-1 pr-2 font-medium">QC</th>
                    {COLS.map((c) => <th key={c} className="py-1 pr-2 text-right font-medium">{METRICS[c].label}</th>)}<th className="py-1 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {out.rows.map((r) => (
                      <tr key={r.line} className="border-t border-line/60 align-top">
                        <td className="num py-1.5 pr-2 text-mute">{r.line}</td>
                        <td className="num py-1.5 pr-2">{r.result?.astronautId ?? "—"}</td>
                        <td className="num py-1.5 pr-2">{r.result?.missionDay ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-xs">{r.result?.sampleType ?? "—"}</td><td className="py-1.5 pr-2 text-xs">{r.result?.verification ?? "—"}</td><td className="py-1.5 pr-2 text-xs text-warn">{r.result?.qcFlags.map((f) => f.code).join(", ") || "—"}</td>
                        {COLS.map((c) => {
                          const v = r.result?.values[c];
                          const st = v === undefined ? "normal" : statusOf(c, v);
                          return <td key={c} className={`num py-1.5 pr-2 text-right ${st === "critical" ? "text-crit" : st === "out-of-range" ? "text-warn" : ""}`}>{fmt(c, v)}</td>;
                        })}
                        <td className="py-1.5 text-xs">{r.ok ? <span className="text-ok">OK</span> : <span className="text-crit">{r.errors.join("; ")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-4" title="Imported records in this browser" subtitle="Persisted locally; included in all trend charts and alert rules"
        right={<Btn variant="danger" onClick={clearImported} disabled={!importedLabs.length}><Trash2 size={14} /> Remove all ({importedLabs.length})</Btn>}>
        {importedLabs.length === 0 ? <p className="text-sm text-mute">No imported samples.</p> : (
          <ul className="grid gap-x-6 text-sm md:grid-cols-2">
            {importedLabs.map((l) => (
              <li key={l.id} className="flex justify-between border-t border-line/60 py-1.5"><span className="num text-ink">{l.astronautId} · day {l.missionDay}</span><span className="num text-xs text-mute">{Object.keys(l.values).length} measurements</span></li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
