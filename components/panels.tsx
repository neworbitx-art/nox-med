"use client";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Alert, AstronautId, LabResult } from "@/lib/types";
import { METRICS, METRIC_GROUPS, METRIC_KEYS, fmt, provenanceOf } from "@/lib/metrics";
import { interpretability, statusIn } from "@/lib/validity";
import { trendOf } from "@/lib/analysis";
import { dayToDate, labsFor, mission } from "@/lib/data";
import { Card, MetaStrip, RangeBar, SeverityBadge, SimBadge, Tag } from "./ui";

const DOT: Record<string, string> = { normal: "bg-ok", "out-of-range": "bg-warn", critical: "bg-crit", unreliable: "bg-mute", "not-interpretable": "bg-line", none: "bg-line" };

export function SampleMeta({ lab }: { lab: LabResult }) {
  const worstFlag = lab.qcFlags.length > 0 || lab.verification === "rejected";
  return (
    <MetaStrip items={[
      { label: "Mission", value: `${mission.id} · day ${lab.missionDay}` },
      { label: "Astronaut", value: lab.astronautId },
      { label: "Collected (UTC)", value: lab.collectedAt.replace("T", " ").replace("Z", "") },
      { label: "Analyzer", value: lab.analyzer },
      { label: "Sample type", value: lab.sampleType.toUpperCase() + (lab.fio2 ? ` · FiO₂ ${lab.fio2}` : ""), tone: lab.sampleType === "unknown" ? "warn" : undefined },
      { label: "Data validity", value: lab.verification === "rejected" ? "REJECTED" : worstFlag ? `FLAGGED (${lab.qcFlags.length})` : lab.verification === "pending" ? "PENDING" : "NO QC FLAGS", tone: lab.verification === "rejected" ? "crit" : worstFlag || lab.verification === "pending" ? "warn" : "ok" },
    ]} />
  );
}

export function LatestMeasurements({ labs, id }: { labs: LabResult[]; id: AstronautId }) {
  const mine = labsFor(labs, id).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  const latest = mine[mine.length - 1];
  if (!latest) return <Card title="Latest measurements">No samples.</Card>;
  return (
    <Card code="PNL-LAB-LATEST" title={`Latest measurements — ${id}`}
      subtitle={`${mission.currentDay - latest.missionDay} d before current mission day · ${latest.origin === "simulated" ? "simulated" : "imported"} record`}
      right={latest.origin === "simulated" ? undefined : <SimBadge label="IMPORTED" />}
    >
      <div className="mb-4"><SampleMeta lab={latest} /></div>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        {METRIC_GROUPS.map((g) => {
          const keys = METRIC_KEYS.filter((k) => METRICS[k].group === g && latest.values[k] !== undefined);
          if (!keys.length) return null;
          return (
            <div key={g}>
              <div className="meta mb-1 border-b border-line pb-1">{g}</div>
              <table className="w-full text-[13px]">
                <tbody>
                  {keys.map((k) => {
                    const v = latest.values[k] as number;
                    const t = trendOf(mine, k);
                    const st = statusIn(latest, k);
                    const it = interpretability(latest, k);
                    const Arrow = t?.direction === "up" ? ArrowUpRight : t?.direction === "down" ? ArrowDownRight : ArrowRight;
                    return (
                      <tr key={k} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 pr-2 text-ink2" title={METRICS[k].meaning}>
                          <span className={`mr-2 inline-block h-2 w-2 rounded-full ${DOT[st]}`} />{METRICS[k].label}
                          {provenanceOf(k) === "calculated" && <span className="ml-1.5"><Tag tone="calc">calc</Tag></span>}
                          {st === "unreliable" && <span className="ml-1.5"><Tag tone="warn">QC flag</Tag></span>}
                          {st === "not-interpretable" && <span className="ml-1.5" title={it.ok ? "" : it.note}><Tag>not interpreted</Tag></span>}
                        </td>
                        <td className="num py-1.5 pr-1 text-right font-semibold text-ink">{fmt(k, v)}</td>
                        <td className="py-1.5 pr-2 text-[11px] text-mute">{METRICS[k].unit}</td>
                        <td className="w-24 py-1.5 pr-2">
                          <RangeBar k={k} v={v} low={it.ok ? it.range.low : undefined} high={it.ok ? it.range.high : undefined}
                            status={st === "normal" || st === "out-of-range" || st === "critical" ? st : "muted"} />
                        </td>
                        <td className={`py-1.5 text-right text-xs ${t && Math.abs(t.z) >= 3 && it.ok ? "text-warn" : "text-mute"}`} title={t ? `z=${t.z.toFixed(1)} vs personal baseline` : undefined}>
                          <Arrow size={14} className="inline" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-mute">Ruler: shaded = reference interval for this sample type (arterial/arterialized-capillary, venous, sex-specific where applicable); ticks every 5 % of scale. <b>calc</b> = analyzer-calculated value. Arrow = change vs personal baseline (reliable samples); amber when |z| ≥ 3.</p>
    </Card>
  );
}

export function Observations({ alerts, id, limit = 8, days = 45, currentDay }: { alerts: Alert[]; id: AstronautId; limit?: number; days?: number; currentDay: number }) {
  const items = alerts.filter((a) => (a.astronautId === id || a.astronautId === "CREW") && a.missionDay > currentDay - days).slice(0, limit);
  return (
    <Card title={`Recent health observations — ${id}`} subtitle={`Rule-generated from labs, wearables and cabin telemetry · last ${days} mission days`}>
      {items.length === 0 ? (
        <p className="text-sm text-mute">No observations in this window. Parameters are within personal baseline and reference limits.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3 py-2.5">
              <div className="w-14 shrink-0 pt-0.5"><span className="num text-xs text-mute">D{a.missionDay}</span></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge s={a.severity} />
                  <span className="text-sm text-ink">{a.title}</span>
                  {a.astronautId === "CREW" && <span className="text-[10px] uppercase tracking-wider text-mute">crew-wide</span>}
                  
                </div>
                <p className="mt-0.5 text-xs text-mute">{a.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
