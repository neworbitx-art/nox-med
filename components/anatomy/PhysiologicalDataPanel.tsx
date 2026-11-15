"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useMission } from "@/lib/store";
import { environment, labsFor, vitalsFor } from "@/lib/data";
import { METRICS, fmt } from "@/lib/metrics";
import { statusIn, comparable } from "@/lib/validity";
import { V } from "@/lib/wearables";
import type { DataLink } from "@/lib/anatomy";
import { Tag } from "@/components/ui";
import type { AstronautId, LabResult } from "@/lib/types";

export interface Row { link: DataLink; text: string; unit: string; when: string; tone: "ok" | "warn" | "crit" | "neutral"; note?: string; href: string }

/** Latest value per link for one astronaut. Analyzer and wearable values stay separate; oxygenation only from arterial/capillary samples. */
export function buildRows(id: AstronautId, labs: LabResult[], links: DataLink[], focus?: string[]): Row[] {
  const mine = labsFor(labs, id).filter((l) => l.verification !== "rejected");
  const vit = vitalsFor(id);
  const want = focus ? links.filter((l) => focus.includes((l.lab ?? l.vital) as string)) : links;
  const env = environment[environment.length - 1];
  const ENV_UNIT: Record<string, string> = { co2Mmhg: "mmHg", o2Pct: "%", pressureKpa: "kPa", tempC: "°C", humidityPct: "%", radiationUSvH: "µSv/h" };
  return want.map((link): Row => {
    if (link.source === "cabin" && link.env) {
      return { link, text: env ? String(env[link.env]) : "—", unit: ENV_UNIT[link.env], when: env ? `day ${env.missionDay}` : "no data", tone: "neutral", note: link.note, href: "/environment" };
    }
    if (link.source === "wearable" && link.vital) {
      const v = vit[vit.length - 1];
      return { link, text: v ? v[link.vital].toFixed(V[link.vital].dec) : "—", unit: V[link.vital].unit, when: v ? `day ${v.missionDay}` : "no data", tone: "neutral", note: link.note, href: `/wearables?m=${link.vital}` };
    }
    const key = link.lab!;
    const cand = mine.filter((l) => l.values[key] !== undefined);
    const usable = cand.filter((l) => comparable(l, key));
    const last = usable[usable.length - 1];
    if (!last) return { link, text: "—", unit: METRICS[key].unit, when: cand.length ? "no reliable / interpretable sample" : "no sample", tone: "neutral", note: link.note, href: `/blood-gas?m=${key}` };
    const st = statusIn(last, key);
    return { link, text: fmt(key, last.values[key]), unit: METRICS[key].unit, when: `day ${last.missionDay} · ${last.sampleType}`, tone: st === "critical" ? "crit" : st === "out-of-range" ? "warn" : st === "normal" ? "ok" : "neutral", note: link.note, href: `/blood-gas?m=${key}` };
  });
}

export function PhysiologicalDataPanel({ links, focus, title, subtitle, enabled = true, astronautId, hrefBase }: { links: DataLink[]; focus?: string[]; title: string; subtitle: string; enabled?: boolean; astronautId?: AstronautId; hrefBase?: boolean }) {
  const { labs, selectedId: sel } = useMission();
  const selectedId = astronautId ?? sel;
  const rows = useMemo(() => (enabled ? buildRows(selectedId, labs, links, focus) : []), [enabled, selectedId, labs, links, focus]);
  void hrefBase;
  return (
    <section aria-label="Linked measurements" data-astronaut={selectedId}>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <p className="mb-2 text-[12px] text-mute">{subtitle}</p>
      {!enabled ? <p className="border border-line bg-panel px-3 py-3 text-[13px] text-mute" data-testid="not-available">Not available. No measurements are on record for this crew member.</p> : (
      <ul className="divide-y divide-line border border-line bg-panel">
        {rows.map((r) => (
          <li key={(r.link.lab ?? r.link.vital ?? r.link.env) as string} className="flex items-center gap-3 px-3 py-2" data-metric={r.link.lab ?? r.link.vital ?? r.link.env}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">{r.link.label}
                <Tag tone={r.link.source === "analyzer" ? "calc" : "neutral"}>{r.link.source === "analyzer" ? "Analyzer" : r.link.source === "cabin" ? "Cabin" : "Wearable"}</Tag></div>
              <div className="text-[11px] text-mute">{r.when}{r.note ? ` · ${r.note}` : ""}</div>
            </div>
            <div className={`num text-right text-[15px] font-semibold ${r.tone === "crit" ? "text-crit" : r.tone === "warn" ? "text-warn" : "text-ink"}`}>{r.text === "—" ? <span className="text-[12px] font-normal text-mute">Not available</span> : <>{r.text} <span className="text-[11px] font-normal text-mute">{r.unit}</span></>}</div>
            <Link href={r.href} className="inline-flex items-center gap-0.5 text-[12px] text-accent hover:underline" aria-label={`Open ${r.link.label} trend`}>Trend <ArrowRight size={11} /></Link>
          </li>
        ))}
      </ul>)}
      <p className="mt-2 text-[11px] text-mute">Values are shown for context. They are not attributed to any anatomical structure.</p>
    </section>
  );
}
