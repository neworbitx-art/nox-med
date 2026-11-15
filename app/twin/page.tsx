"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMission } from "@/lib/store";
import { astronauts } from "@/lib/data";
import { CARDIO_LINKS, GROUP_FOCUS, MODEL_INFO, STRUCTURE_BY_ID, SYSTEM_LINKS, type StructureGroup } from "@/lib/anatomy";
import { CREW_IDENTITY, SYSTEMS, type SystemId } from "@/lib/crewprofile";
import { Card, PageHeader } from "@/components/ui";
import { CrewPortrait } from "@/components/crewportrait";
import { BodySystemSelector } from "@/components/anatomy/BodySystemSelector";
import { AnatomyControls } from "@/components/anatomy/AnatomyControls";
import { PhysiologicalDataPanel } from "@/components/anatomy/PhysiologicalDataPanel";
import { MedicalDeviceOverlay } from "@/components/anatomy/MedicalDeviceOverlay";
import type { ModelStatus } from "@/components/anatomy/AnatomyViewer";

const AnatomyViewer = dynamic(() => import("@/components/anatomy/AnatomyViewer"), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-mute">Loading 3D viewer…</div> });

export default function Twin() {
  const { selectedId } = useMission();
  const a = astronauts.find((x) => x.id === selectedId)!;
  const [system, setSystem] = useState<SystemId>("cardiovascular");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.9);
  const [isolate, setIsolate] = useState(false);
  const [labels, setLabels] = useState(false);
  const [group, setGroup] = useState<StructureGroup | null>(null);
  const [reset, setReset] = useState(0);
  const [zoom, setZoom] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
  const [status, setStatus] = useState<ModelStatus>("loading");
  const [meshes, setMeshes] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const onStatus = useCallback((s: ModelStatus, n?: number) => { setStatus(s); if (n !== undefined) setMeshes(n); }, []);

  const def = selected ? STRUCTURE_BY_ID[selected] : null;
  const atlas = SYSTEMS.find((s) => s.id === system)!.atlas;
  const links = SYSTEM_LINKS[system] ?? [];
  const focus = system === "cardiovascular" ? GROUP_FOCUS[def ? def.group : "all"] : undefined;

  return (
    <>
      <PageHeader title="Human Digital Twin" desc="Anatomical atlas linked to the selected astronaut's measurements. Select a body system, then a structure, to see related measurements." />
      <div className="mb-3 flex items-center gap-3 border border-line bg-panel p-3" data-testid="twin-astronaut" data-astronaut={selectedId}>
        <CrewPortrait id={selectedId} size={44} />
        <div><div className="text-[14px] font-semibold text-ink">{a.id} · {a.role}</div><div className="text-[12px] text-mute">{CREW_IDENTITY[selectedId].persistentId} · {CREW_IDENTITY[selectedId].callsign} · change astronaut in the header</div></div>
      </div>
      <div className="mb-3"><BodySystemSelector value={system} onChange={(s) => { setSystem(s); setSelected(null); setGroup(null); }} /></div>

      {atlas ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Card title="Cardiovascular atlas" subtitle={`${meshes || MODEL_INFO.meshCount} selectable structures · ${MODEL_INFO.source}`}>
              <div className="relative h-[420px] border border-line bg-[#05080C]" data-testid="viewer" data-status={status} data-mesh-count={meshes}>
                {status !== "no-webgl" && status !== "error" && (
                  <AnatomyViewer selected={selected} hovered={hovered} opacity={opacity} isolate={isolate} highlightGroup={group} showLabels={labels}
                    resetSignal={reset} zoomSignal={zoom} onSelect={setSelected} onHover={setHovered} onStatus={onStatus} reducedMotion={reduced} />
                )}
                {(status === "no-webgl" || status === "error") && (
                  <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center" role="alert">
                    <p className="text-[14px] font-semibold text-ink">{status === "no-webgl" ? "3D view unavailable: WebGL is not supported here." : "The 3D model could not be loaded."}</p>
                    <p className="text-[12px] text-mute">Structure selection and linked measurements still work through the list on the right.</p>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] text-mute">{MODEL_INFO.note} Selection highlights a structure in the atlas; it does not imply a finding.</p>
            </Card>
            <Card title="Selected structure">
              {def ? (
                <div data-testid="structure-info" data-structure={def.id}>
                  <div className="text-[15px] font-semibold text-ink">{def.label}</div>
                  <div className="meta mb-1">{def.group}</div>
                  <p className="text-[13px] text-ink2">{def.description}</p>
                  <button onClick={() => setSelected(null)} className="mt-2 text-[12px] text-accent hover:underline">Clear selection</button>
                </div>
              ) : <p className="text-[13px] text-mute">Click a structure in the model or choose one from the list.</p>}
            </Card>
          </div>
          <div className="space-y-3">
            <Card title="View controls"><AnatomyControls selected={selected} onSelect={setSelected} opacity={opacity} onOpacity={setOpacity} isolate={isolate} onIsolate={setIsolate}
              showLabels={labels} onLabels={setLabels} group={group} onGroup={setGroup} onReset={() => setReset((n) => n + 1)} onZoom={(dir) => setZoom((z) => ({ n: z.n + 1, dir }))} /></Card>
            <Card><PhysiologicalDataPanel links={CARDIO_LINKS} focus={focus} title={def ? `Related measurements · ${def.group}` : "Cardiovascular measurements"}
              subtitle={def ? "Measurements commonly reviewed with this part of the system." : "Select a structure to narrow the list."} /></Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title={`${SYSTEMS.find((s) => s.id === system)!.label} atlas`}>
            <p className="text-[14px] font-semibold text-ink" data-testid="coming-soon">Coming soon</p>
            <p className="text-[13px] text-ink2">No licensed 3D model is installed for this system yet, so no viewer is shown. Only the cardiovascular atlas is available.</p>
          </Card>
          <Card>{links.length > 0 ? <PhysiologicalDataPanel links={links} title="Related measurements" subtitle="Measurements commonly reviewed for this system." /> : <p className="text-[13px] text-mute">No linked measurements are defined for this system yet.</p>}</Card>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card><MedicalDeviceOverlay system={system} /></Card>
        <Card title="Model credits">
          <p className="text-[12px] text-ink2">3D cardiovascular model derived from <b>Z-Anatomy</b> (CC BY-SA 4.0), which builds on <b>BodyParts3D</b> © The Database Center for Life Science (CC BY-SA 2.1 Japan). Extracted, simplified and re-exported by NOX. The derived model is shared under CC BY-SA 4.0. See <code>docs/ASSET_LICENSES.md</code>.</p>
          <Link href="/blood-gas" className="mt-2 inline-block text-[12px] text-accent hover:underline">Open full blood gas trends →</Link>
        </Card>
      </div>
    </>
  );
}
