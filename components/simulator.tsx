"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useMission } from "@/lib/store";
import { METRICS, fmt } from "@/lib/metrics";
import { statusIn, rangeFor } from "@/lib/validity";
import { ENV_VARS } from "@/lib/telemetry";
import { yDomain } from "@/lib/chartutil";
import { SCENARIOS3, REVIEW_LABEL, SIM_START, buildScenario, summarize, type Built, type ReviewAction, type ReviewKind, type ScenarioId, type SimAlert } from "@/lib/simulator";
import type { MetricKey, Severity } from "@/lib/types";
import { Btn, Card, Segmented, SeverityBadge, Stat, Tag } from "@/components/ui";
import { SimChart } from "@/components/simchart";

const TICK_MIN = 5;
const SPEEDS = [{ value: 1, label: "1×" }, { value: 2, label: "2×" }, { value: 4, label: "4×" }, { value: 8, label: "8×" }];
const TABLE_KEYS: MetricKey[] = ["pH", "pCO2", "pO2", "HCO3", "BE", "sO2", "K", "Na", "Cl", "iCa", "Lac", "Glu", "tHb", "Hct"];
const SEV_DOT: Record<Severity, string> = { critical: "#F87171", warning: "#F5B642", watch: "#60A5FA", info: "#A8B8D8" };
const clock = (min: number) => new Date(Date.parse(SIM_START) + min * 60000).toISOString().slice(11, 16) + "Z";

export function Simulator() {
  const { selectedId } = useMission();
  const [sid, setSid] = useState<ScenarioId>("resp");
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [log, setLog] = useState<ReviewAction[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const built: Built = useMemo(() => buildScenario(sid, selectedId), [sid, selectedId]);
  const def = built.def;
  const lastIdx = def.durationMin / TICK_MIN;
  const now = idx * TICK_MIN;
  const done = idx >= lastIdx;

  // playback clock
  const idxRef = useRef(idx); idxRef.current = idx;
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => {
      if (idxRef.current >= lastIdx) { setRunning(false); return; }
      setIdx((i) => Math.min(lastIdx, i + 1));
    }, 600 / speed);
    return () => clearInterval(h);
  }, [running, speed, lastIdx]);
  useEffect(() => { if (idx >= lastIdx) setRunning(false); }, [idx, lastIdx]);

  const reset = () => { setRunning(false); setIdx(0); setLog([]); setOpen(null); };
  const pick = (id: ScenarioId) => { setSid(id); setRunning(false); setIdx(0); setLog([]); setOpen(null); };
  const start = () => { if (done) { setIdx(0); setLog([]); } setRunning(true); };

  // revealed data
  const samples = built.samples.filter((s) => s.t <= now);
  const latest = samples[samples.length - 1];
  const env = built.env.filter((e) => e.t <= now);
  const envNow = env[env.length - 1];
  const alerts = built.alerts.filter((a) => a.t <= now);
  const baseline = (k: MetricKey) => { const v = built.history.map((l) => l.values[k]).filter((x): x is number => x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };

  const review = (alertId: string, kind: ReviewKind) => setLog((p) => (p.some((x) => x.alertId === alertId && x.kind === kind) ? p : [...p, { alertId, kind, t: now }]));
  const did = (alertId: string, kind: ReviewKind) => log.find((x) => x.alertId === alertId && x.kind === kind);

  const events = useMemo(() => {
    const ev = built.events.filter((e) => e.t <= now).map((e) => ({ ...e, key: `${e.kind}-${e.t}-${e.text}` }));
    const wf = log.map((a) => ({ t: a.t, kind: "workflow" as const, text: `${REVIEW_LABEL[a.kind]} — ${built.alerts.find((x) => x.id === a.alertId)?.title ?? ""}`, key: `wf-${a.alertId}-${a.kind}`, severity: undefined as Severity | undefined, alertId: a.alertId }));
    return [...ev, ...wf].sort((a, b) => b.t - a.t);
  }, [built, now, log]);

  const summary = useMemo(() => (done ? summarize(built, log) : null), [done, built, log]);

  // fixed per-metric axes so charts do not rescale during playback
  const axis = (k: MetricKey) => {
    const vals = built.samples.map((s) => s.lab.values[k]).filter((v): v is number => v !== undefined);
    const rg = rangeFor(k, def.sampleType);
    const m = METRICS[k];
    const near = [rg?.low, rg?.high, m.critLow, m.critHigh].filter((x): x is number => x !== undefined && x > Math.min(...vals) - 1.5 * (Math.max(...vals) - Math.min(...vals) || 1) && x < Math.max(...vals) + 1.5 * (Math.max(...vals) - Math.min(...vals) || 1));
    const d = yDomain(vals, near);
    return { d, rg, trunc: d[0] > 0 };
  };

  const statusText = (k: MetricKey) => {
    if (!latest) return { text: "—", cls: "text-mute" };
    const st = statusIn(latest.lab, k);
    if (st === "unreliable") return { text: "withheld", cls: "text-crit" };
    if (st === "not-interpretable") return { text: "not interpreted", cls: "text-mute" };
    if (st === "critical") return { text: "critical", cls: "text-crit" };
    if (st === "out-of-range") return { text: "out of range", cls: "text-warn" };
    if (st === "normal") return { text: "in range", cls: "text-ok" };
    return { text: "—", cls: "text-mute" };
  };

  return (
    <div className="space-y-4">
      <Card code="SIM-SEL" title="Scenario" subtitle="Three deterministic scripted scenarios. Every value is a fixed function of time; nothing is random or model-generated.">
        <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Scenario">
          {SCENARIOS3.map((s) => (
            <button key={s.id} role="radio" aria-checked={s.id === sid} onClick={() => pick(s.id)}
              className={`rounded-sm border p-3 text-left transition ${s.id === sid ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line bg-panel hover:bg-bg2"}`}>
              <p className="text-[13px] font-semibold text-ink">{s.name}</p>
              <p className="meta mt-0.5">{s.short}</p>
              <p className="mt-1.5 text-xs text-ink2">{s.summary}</p>
              <p className="num mt-1.5 text-[11px] text-mute">{s.durationMin / 60} h · sample every {s.sampleEveryMin} min · {s.sampleType}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink2"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />{def.caveat}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Btn onClick={start} disabled={running}><Play size={14} /> {done ? "Restart" : idx > 0 ? "Resume" : "Start"}</Btn>
          <Btn variant="ghost" onClick={() => setRunning(false)} disabled={!running}><Pause size={14} /> Pause</Btn>
          <Btn variant="ghost" onClick={reset}><RotateCcw size={14} /> Reset</Btn>
          <Btn variant="ghost" onClick={() => { setRunning(false); setIdx((i) => Math.min(lastIdx, i + 1)); }} disabled={done} title="Advance 5 minutes"><SkipForward size={14} /> Step +5 min</Btn>
          <Segmented value={speed} onChange={setSpeed} options={SPEEDS} label="Speed" />
          <div className="ml-auto flex min-w-[240px] flex-1 items-center gap-3">
            <input type="range" min={0} max={lastIdx} value={idx} onChange={(e) => { setRunning(false); setIdx(Number(e.target.value)); }} className="w-full accent-[#38C9F4]" aria-label="Scenario time" />
            <span className="num whitespace-nowrap text-sm text-ink" aria-live="off">T+{now} / {def.durationMin} min · {clock(now)}</span>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-mute">Status: <b className="text-ink2">{running ? "running" : done ? "complete" : idx > 0 ? "paused" : "ready"}</b> · crew member {selectedId} (fixed baseline) · run ID {def.id}-v1-{built.checksum}</p>
      </Card>

      <Card code="SIM-TL" title="Scenario timeline" subtitle="Markers: ▪ laboratory sample · ● alert (colored by severity) · vertical line = current time">
        <Track built={built} now={now} />
        <ol className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1 text-[13px]" aria-label="Event log">
          {events.length === 0 && <li className="text-mute">Press Start to begin.</li>}
          {events.map((e) => (
            <li key={e.key} className="flex gap-2 border-t border-line/60 pt-1">
              <span className="num w-20 shrink-0 text-xs text-mute">T+{e.t} · {clock(e.t)}</span>
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: e.kind === "alert" ? SEV_DOT[e.severity ?? "info"] : e.kind === "workflow" ? "#38C9F4" : "#A8B8D8" }}>{e.kind === "alert" ? e.severity : e.kind}</span>
              <span className="text-ink2">{e.text}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card code="SIM-LAB" title="Laboratory measurements" subtitle={latest ? `Sample at T+${latest.t} min (${def.sampleType}). Δ is versus the personal baseline of 10 prior samples.` : "No sample yet."}>
          <div className="grid gap-4 md:grid-cols-2">
            {def.focus.map((k) => {
              const a = axis(k), m = METRICS[k];
              const pts = samples.filter((s) => statusIn(s.lab, k) !== "unreliable").map((s) => ({ t: s.t, v: s.lab.values[k] as number }));
              const wh = samples.filter((s) => statusIn(s.lab, k) === "unreliable").map((s) => ({ t: s.t, v: s.lab.values[k] as number }));
              return <SimChart key={k} title={m.name} unit={m.unit} decimals={m.decimals} points={pts} withheld={wh} now={now} duration={def.durationMin} yDomain={a.d} band={a.rg ? { low: a.rg.low, high: a.rg.high } : null}
                hlines={[m.critHigh !== undefined && a.d[1] > m.critHigh && { y: m.critHigh, label: "critical", color: "#F87171" }, m.critLow !== undefined && a.d[0] < m.critLow && { y: m.critLow, label: "critical", color: "#F87171" }].filter(Boolean) as { y: number; label: string; color: string }[]}
                note={a.trunc ? `Y-axis starts at ${a.d[0].toFixed(m.decimals)} (not zero).` : undefined} height={165} />;
            })}
          </div>
          <div className="mt-4 overflow-x-auto border-t border-line pt-3">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-1 pr-2 font-medium">Analyte</th><th className="py-1 pr-2 text-right font-medium">Value</th><th className="py-1 pr-2 font-medium">Unit</th><th className="py-1 pr-2 text-right font-medium">Δ baseline</th><th className="py-1 font-medium">Interpretation</th></tr></thead>
              <tbody>
                {TABLE_KEYS.map((k) => {
                  const v = latest?.lab.values[k], b = baseline(k), st = statusText(k);
                  const flagged = latest?.lab.qcFlags.find((f) => f.analytes.includes(k));
                  return (
                    <tr key={k} className={`border-t border-line/60 ${st.text === "withheld" ? "bg-crit/5" : ""}`}>
                      <td className="py-1.5 pr-2">{METRICS[k].label} {["HCO3", "BE", "Hct"].includes(k) && <Tag tone="calc">calc</Tag>}</td>
                      <td className={`num py-1.5 pr-2 text-right font-semibold ${st.text === "withheld" ? "text-crit line-through" : ""}`}>{v === undefined ? "—" : fmt(k, v)}</td>
                      <td className="num py-1.5 pr-2 text-xs text-mute">{METRICS[k].unit}</td>
                      <td className="num py-1.5 pr-2 text-right text-mute">{v !== undefined && b !== undefined ? `${v - b >= 0 ? "+" : "−"}${Math.abs(v - b).toFixed(METRICS[k].decimals)}` : "—"}</td>
                      <td className={`py-1.5 text-xs ${st.cls}`}>{st.text}{flagged && <span className="text-crit"> · {flagged.code}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card code="SIM-ENV" title="Environmental observations" subtitle="Cabin telemetry every 10 min. Ambient gas values, not blood values.">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Cabin CO₂ partial pressure" value={envNow ? <>{envNow.co2.toFixed(2)} <span className="text-sm text-mute">mmHg</span></> : "—"} tone={envNow ? (envNow.co2 >= ENV_VARS.co2.warn! ? "warn" : envNow.co2 >= ENV_VARS.co2.high! ? "warn" : "ok") : undefined} sub={envNow ? `≈ ${(envNow.co2 / (envNow.pressureKpa * 7.50062) * 100).toFixed(2)} % of cabin air` : ""} />
            <Stat label="Cabin O₂ partial pressure" value={envNow ? <>{envNow.o2.toFixed(1)} <span className="text-sm text-mute">mmHg</span></> : "—"} sub="derived" />
            <Stat label="Total pressure" value={envNow ? <>{envNow.pressureKpa.toFixed(2)} <span className="text-sm text-mute">kPa</span></> : "—"} />
            <Stat label="Temp · humidity" value={envNow ? <>{envNow.tempC.toFixed(1)} <span className="text-sm text-mute">°C</span> · {envNow.humidity.toFixed(0)} <span className="text-sm text-mute">%</span></> : "—"} />
          </div>
          <div className="mt-4">
            <SimChart title="Cabin CO₂ partial pressure" unit="mmHg" decimals={2} points={env.map((e) => ({ t: e.t, v: e.co2 }))} now={now} duration={def.durationMin} color="#A78BFA" dots={false} height={170}
              yDomain={yDomain(built.env.map((e) => e.co2), [ENV_VARS.co2.high!, ENV_VARS.co2.warn!].filter((x) => x < Math.max(...built.env.map((e) => e.co2)) + 1.5))}
              hlines={[{ y: ENV_VARS.co2.high!, label: "watch 4.0", color: "#F5B642" }, { y: ENV_VARS.co2.warn!, label: "warning 5.3", color: "#F87171" }].filter((h) => h.y < Math.max(...built.env.map((e) => e.co2)) + 1.5)}
              note="Y-axis does not start at zero." xLabel />
          </div>
          <p className="mt-2 border-t border-line pt-2 text-xs text-mute">Cabin CO₂ here is ambient gas partial pressure (mmHg). It is not blood pCO₂, and a rise in both over the same period is an association in time, not proof that one caused the other.{def.id !== "resp" && " In this scenario the cabin environment stays nominal."}</p>
        </Card>
      </div>

      <Card code="SIM-ALR" title="Explainable alerts" subtitle={`${alerts.length} raised so far. Each alert lists the rule steps, the data it used and what it cannot tell you.`}>
        {alerts.length === 0 ? <p className="text-sm text-mute">No alerts yet.</p> : (
          <ul className="space-y-2">
            {[...alerts].reverse().map((a) => <AlertRow key={a.id} a={a} open={open === a.id} toggle={() => setOpen(open === a.id ? null : a.id)} did={did} review={review} />)}
          </ul>
        )}
        <p className="mt-3 border-t border-line pt-2 text-xs text-mute">Medical review workflow: acknowledge, request a repeat sample, or escalate. These actions are logged with scenario time only. They do not change the scripted measurements and are not treatment instructions.</p>
      </Card>

      {summary && (
        <Card code="SIM-SUM" title={`Summary: ${summary.title}`} subtitle="Scenario complete." right={<Btn variant="ghost" onClick={start}><RotateCcw size={14} /> Replay</Btn>}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Duration" value={`${summary.durationMin} min`} sub={`${summary.samples} samples`} />
            <Stat label="Alerts" value={Object.values(summary.counts).reduce((a, b) => a + b, 0)} sub={`${summary.counts.critical} critical · ${summary.counts.warning} warning · ${summary.counts.watch} watch · ${summary.counts.info} info`} />
            <Stat label="Review actions" value={summary.review.actions} sub={`${summary.review.alertsReviewed}/${summary.review.alertsNeedingReview} alerts reviewed${summary.review.firstAckMin !== undefined ? ` · first ack +${summary.review.firstAckMin} min` : ""}`} />
            <Stat label="Run ID" value={<span className="text-base">{summary.checksum}</span>} sub="identical on every run" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="meta mb-1">Milestones</p>
              <table className="w-full text-sm"><tbody>{summary.milestones.map((m) => <tr key={m.label} className="border-t border-line/60"><td className="py-1.5 pr-2">{m.label}</td><td className="num py-1.5 text-right">{m.t === undefined ? <span className="text-mute">not reached</span> : `T+${m.t} min`}</td></tr>)}</tbody></table>
            </div>
            <div>
              <p className="meta mb-1">What happened</p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink2">{summary.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-0.5 border-t border-line pt-2 pl-5 text-xs text-mute">{summary.limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

function Track({ built, now }: { built: Built; now: number }) {
  const D = built.def.durationMin, pct = (t: number) => `${(t / D) * 100}%`;
  return (
    <div className="relative h-14 rounded-sm border border-line bg-bg2" role="img" aria-label="Scenario timeline track">
      {Array.from({ length: Math.floor(D / 60) + 1 }, (_, i) => i * 60).map((t) => <div key={t} className="absolute top-0 h-full border-l border-line" style={{ left: pct(t) }}><span className="num absolute bottom-0.5 left-1 text-[10px] text-mute">{t}</span></div>)}
      <div className="absolute inset-y-0 left-0 bg-accent/10" style={{ width: pct(now) }} />
      {built.samples.map((s) => <span key={s.id} className="absolute top-2 h-2 w-2 -translate-x-1/2 rounded-[1px]" style={{ left: pct(s.t), background: s.t <= now ? (s.lab.qcFlags.length ? "#F87171" : "#38C9F4") : "#cfd8e3" }} title={`Sample T+${s.t}`} />)}
      {built.alerts.map((a) => <span key={a.id} className="absolute top-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-panel" style={{ left: pct(a.t), background: a.t <= now ? SEV_DOT[a.severity] : "#e2e8f0" }} title={`${a.severity}: ${a.title}`} />)}
      <div className="absolute inset-y-0 w-px bg-ink" style={{ left: pct(now) }} />
    </div>
  );
}

function AlertRow({ a, open, toggle, did, review }: { a: SimAlert; open: boolean; toggle: () => void; did: (id: string, k: ReviewKind) => ReviewAction | undefined; review: (id: string, k: ReviewKind) => void }) {
  const kinds: ReviewKind[] = ["ack", "repeat", "escalate"];
  return (
    <li className="rounded-sm border border-line bg-panel" style={{ borderLeft: `3px solid ${SEV_DOT[a.severity]}` }}>
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-2 p-2.5 text-left">
        {open ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-mute" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-mute" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><SeverityBadge s={a.severity} /><Tag>{a.category}</Tag><span className="num text-xs text-mute">T+{a.t} · {clock(a.t)}</span></span>
          <span className="mt-1 block text-[13px] font-medium text-ink">{a.title}</span>
          <span className="block text-xs text-ink2">{a.detail}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line/70 px-3 pb-3 pt-2 text-xs text-ink2">
          <p className="meta mb-1">Why this alert</p>
          <ol className="list-decimal space-y-0.5 pl-5">{a.why.map((w, i) => <li key={i}>{w}</li>)}</ol>
          {a.uncertainty && <><p className="meta mb-1 mt-2">What it cannot tell you</p><p>{a.uncertainty}</p></>}
          {a.sampleId && <p className="num mt-2 text-mute">Source sample {a.sampleId}</p>}
        </div>
      )}
      {a.severity !== "info" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-3 py-2">
          <span className="meta">Review</span>
          {kinds.map((k) => { const d = did(a.id, k); return (
            <button key={k} onClick={() => review(a.id, k)} disabled={!!d} className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[12px] ${d ? "border-ok/40 bg-ok/10 text-ok" : "border-line bg-panel text-ink2 hover:bg-bg2"}`}>
              {d && <Check size={12} />}{k === "ack" ? "Acknowledge" : k === "repeat" ? "Request repeat sample" : "Escalate to flight surgeon"}{d && <span className="num"> · T+{d.t}</span>}
            </button>); })}
        </div>
      )}
    </li>
  );
}
