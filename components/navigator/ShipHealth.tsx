"use client";
import { LEVEL_LABEL, shipHealthFor, type MissionRecord, type MissionStatusLevel } from "@/lib/missions";

export const LEVEL_COLOR: Record<MissionStatusLevel, string> = { nominal: "#4ADE80", watch: "#F5B642", warning: "#FB923C", critical: "#F87171", unknown: "#8896B5" };

export function StatusDot({ level, size = 8 }: { level: MissionStatusLevel; size?: number }) {
  return <span aria-hidden className="inline-block rounded-full" style={{ width: size, height: size, background: LEVEL_COLOR[level] }} />;
}
export function LevelBadge({ level }: { level: MissionStatusLevel }) {
  return <span className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold" style={{ borderColor: LEVEL_COLOR[level], color: LEVEL_COLOR[level] }} data-level={level}><StatusDot level={level} size={7} />{LEVEL_LABEL[level]}</span>;
}

/** Ship / cabin health. These are spacecraft measurements, never clinical values. */
export function ShipHealthPanel({ m, compact = false }: { m: MissionRecord; compact?: boolean }) {
  const h = shipHealthFor(m);
  return (
    <section aria-label="Ship health" data-testid="ship-health" data-overall={h.overall}>
      <div className="mb-2 flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">Ship health</h3><LevelBadge level={h.overall} /></div>
      <div className={`grid gap-1.5 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {h.readings.map((r) => (
          <div key={r.key} className="border border-line bg-panel px-2 py-1.5" data-reading={r.key} data-level={r.status}>
            <div className="meta">{r.label}</div>
            <div className="num flex items-baseline justify-between text-[14px] font-semibold text-ink">{r.value === null ? <span className="text-[12px] font-normal text-mute">No telemetry</span> : <>{r.value.toFixed(r.decimals)}<span className="ml-1 text-[10px] font-normal text-mute">{r.unit}</span></>}</div>
            <StatusDot level={r.status} />
            <span className="ml-1 text-[10px] text-mute">{LEVEL_LABEL[r.status]}</span>
          </div>
        ))}
      </div>
      <ul className="mt-2 divide-y divide-line border border-line bg-panel">
        {h.subsystems.map((s) => (
          <li key={s.key} className="flex items-start justify-between gap-2 px-2 py-1.5 text-[12px]" data-subsystem={s.key} data-level={s.status}>
            <span className="text-ink2">{s.label}{!compact && <span className="block text-[11px] text-mute">{s.text}</span>}</span><LevelBadge level={s.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
