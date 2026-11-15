"use client";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import type { Severity, AstronautId, MetricKey } from "@/lib/types";
import { METRICS } from "@/lib/metrics";
import type { StatusLevel } from "@/lib/alerts";

export const CREW_COLORS: Record<AstronautId, string> = { "A-01": "#38C9F4", "A-02": "#A78BFA", "A-03": "#60A5FA", "A-04": "#B9C6E3", "L-01": "#38C9F4", "L-02": "#A78BFA", "L-03": "#60A5FA", "E-01": "#38C9F4", "E-02": "#A78BFA", "R-01": "#38C9F4", "R-02": "#A78BFA" };

/** Instrument-style panel: fine border, compact uppercase heading, optional technical code. */
export function Card({ title, subtitle, right, children, className = "", code }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; code?: string }) {
  return (
    <section className={`rounded-sm border border-line bg-panel ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-bg2/70 px-4 py-2.5">
          <div className="min-w-0">
            {code && <div className="meta mono">{code}</div>}
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-mute">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, desc, right, code }: { title: string; desc: string; right?: ReactNode; code?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
      <div>
        {code && <div className="meta mono">{code}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-mute">{desc}</p>
      </div>
      {right}
    </div>
  );
}

export function SimBadge({ label = "SIMULATED DATA" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-warn/50 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-warn">
      <FlaskConical size={10} /> {label}
    </span>
  );
}

const SEV: Record<Severity, string> = {
  critical: "border-crit/40 bg-crit/10 text-crit",
  warning: "border-warn/50 bg-warn/10 text-warn",
  watch: "border-accent/40 bg-accent/10 text-accent",
  info: "border-line bg-bg2 text-mute",
};
export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEV[s]}`}>{s}</span>;
}

const STAT: Record<StatusLevel, { c: string; t: string }> = {
  nominal: { c: "border-ok/40 bg-ok/10 text-ok", t: "Nominal" },
  watch: { c: "border-accent/40 bg-accent/10 text-accent", t: "Watch" },
  attention: { c: "border-warn/50 bg-warn/10 text-warn", t: "Attention" },
  critical: { c: "border-crit/40 bg-crit/10 text-crit", t: "Critical" },
};
export function StatusPill({ s }: { s: StatusLevel }) {
  return <span className={`rounded-sm border px-2 py-0.5 text-[11px] font-medium ${STAT[s].c}`}>{STAT[s].t}</span>;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "calc" | "warn" | "crit" | "ok" }) {
  const c = { neutral: "border-line text-mute", calc: "border-accent2/40 bg-accent2/10 text-accent2", warn: "border-warn/50 bg-warn/10 text-warn", crit: "border-crit/40 bg-crit/10 text-crit", ok: "border-ok/40 bg-ok/10 text-ok" }[tone];
  return <span className={`inline-block rounded-sm border px-1 py-px text-[9px] font-semibold uppercase tracking-wider ${c}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "crit" }) {
  const c = tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  const bar = tone === "crit" ? "bg-crit" : tone === "warn" ? "bg-warn" : tone === "ok" ? "bg-ok" : "bg-line";
  return (
    <div className="relative rounded-sm border border-line bg-panel px-4 py-3">
      <span className={`absolute inset-y-0 left-0 w-0.5 ${bar}`} />
      <div className="meta">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

/** Row of labelled mission / sample metadata cells. */
export function MetaStrip({ items }: { items: { label: string; value: ReactNode; tone?: "ok" | "warn" | "crit" }[] }) {
  return (
    <dl className="grid grid-cols-2 border border-line bg-panel sm:grid-cols-3 xl:grid-cols-6">
      {items.map((i) => (
        <div key={i.label} className="border-b border-r border-line/70 px-3 py-1.5 last:border-r-0">
          <dt className="meta">{i.label}</dt>
          <dd className={`num mt-0.5 truncate text-[12px] font-medium ${i.tone === "crit" ? "text-crit" : i.tone === "warn" ? "text-warn" : i.tone === "ok" ? "text-ok" : "text-ink"}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Instrument ruler: minor/major ticks, shaded reference interval, value marker. */
export function RangeBar({ k, v, low, high, status }: { k: MetricKey; v: number; low?: number; high?: number; status?: "normal" | "out-of-range" | "critical" | "muted" }) {
  const m = METRICS[k];
  const rl = low ?? m.refLow, rh = high ?? m.refHigh;
  const span = rh - rl;
  const lo = rl - span * 0.6, hi = rh + span * 0.6;
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100));
  const col = status === "muted" ? "#7F90B5" : status === "critical" ? "#F87171" : status === "out-of-range" ? "#F5B642" : "#4ADE80";
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5);
  return (
    <div className="relative h-4 w-full min-w-24" role="img" aria-label={`${m.label} ${v} on scale ${rl}–${rh} reference`}>
      <div className="absolute inset-x-0 top-0 h-2 border border-line bg-bg2" />
      <div className="absolute top-0 h-2 bg-ok/20" style={{ left: `${pct(rl)}%`, width: `${pct(rh) - pct(rl)}%` }} />
      {ticks.map((t) => (
        <span key={t} className="absolute bg-mute/60" style={{ left: `${t}%`, top: 8, width: 1, height: t % 25 === 0 ? 7 : 3 }} />
      ))}
      <span className="absolute top-[-1px] h-[11px] w-[2px]" style={{ left: `calc(${pct(v)}% - 1px)`, background: col }} />
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mute">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="rounded-sm border border-line bg-panel px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink outline-none focus:border-accent">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Btn({ children, onClick, variant = "primary", disabled, title }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger"; disabled?: boolean; title?: string }) {
  const v = variant === "primary" ? "bg-accent text-bg hover:bg-accent/90" : variant === "danger" ? "border border-crit/40 text-crit hover:bg-crit/10" : "border border-line bg-panel text-ink2 hover:bg-bg2";
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${v}`}>
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="meta">{label}</span>}
      <div className="inline-flex overflow-hidden rounded-sm border border-line bg-panel" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} onClick={() => onChange(o.value)} aria-pressed={o.value === value}
            className={`border-r border-line px-2.5 py-1 text-[11px] font-medium last:border-r-0 ${o.value === value ? "bg-accent text-bg" : "text-ink2 hover:bg-bg2"}`}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** Selectable chip for analytes / filters with a clear active state. */
export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} title={title}
      className={`rounded-sm border px-2 py-0.5 text-[12px] ${active ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line bg-panel text-ink2 hover:bg-bg2"}`}>{children}</button>
  );
}
