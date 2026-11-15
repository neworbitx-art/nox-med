"use client";
import { RotateCcw, ZoomIn, ZoomOut, Eye, Tag as TagIcon, Focus } from "lucide-react";
import { GROUPS, STRUCTURES, type StructureGroup } from "@/lib/anatomy";
import { Btn, Chip } from "@/components/ui";

export interface ControlsProps {
  selected: string | null; onSelect: (id: string | null) => void;
  opacity: number; onOpacity: (v: number) => void;
  isolate: boolean; onIsolate: (v: boolean) => void;
  showLabels: boolean; onLabels: (v: boolean) => void;
  group: StructureGroup | null; onGroup: (g: StructureGroup | null) => void;
  onReset: () => void; onZoom: (dir: 1 | -1) => void;
}

export function AnatomyControls(p: ControlsProps) {
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap gap-1.5">
        <Btn variant="ghost" onClick={p.onReset} title="Reset camera"><RotateCcw size={13} /> Reset camera</Btn>
        <Btn variant="ghost" onClick={() => p.onZoom(1)} title="Zoom in"><ZoomIn size={13} /> Zoom in</Btn>
        <Btn variant="ghost" onClick={() => p.onZoom(-1)} title="Zoom out"><ZoomOut size={13} /> Zoom out</Btn>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-ink2"><Eye size={13} /> Transparency
          <input type="range" min={0.25} max={1} step={0.05} value={p.opacity} onChange={(e) => p.onOpacity(Number(e.target.value))} aria-label="Model opacity" className="w-28 accent-[var(--color-accent)]" />
          <span className="num w-9 text-right text-mute">{Math.round(p.opacity * 100)}%</span>
        </label>
        <Chip active={p.showLabels} onClick={() => p.onLabels(!p.showLabels)}><TagIcon size={11} className="mr-1 inline" />Labels</Chip>
        <Chip active={p.isolate} onClick={() => p.onIsolate(!p.isolate)} title="Show only the selected structure"><Focus size={11} className="mr-1 inline" />Isolate selected</Chip>
      </div>
      <div>
        <div className="meta mb-1">Highlight group</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!p.group} onClick={() => p.onGroup(null)}>None</Chip>
          {GROUPS.map((g) => <Chip key={g} active={p.group === g} onClick={() => p.onGroup(p.group === g ? null : g)}>{g}</Chip>)}
        </div>
      </div>
      <div>
        <label className="meta mb-1 block" htmlFor="structure-list">Structure (keyboard-accessible list)</label>
        <select id="structure-list" value={p.selected ?? ""} onChange={(e) => p.onSelect(e.target.value || null)}
          className="w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent">
          <option value="">— none selected —</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>{STRUCTURES.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
