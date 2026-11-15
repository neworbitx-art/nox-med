"use client";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { MODEL_URL, STRUCTURES, STRUCTURE_BY_ID, type StructureGroup } from "@/lib/anatomy";
import { AnatomicalStructure } from "./AnatomicalStructure";

export type ModelStatus = "loading" | "ready" | "error" | "no-webgl";
export interface ViewerProps {
  selected: string | null; hovered: string | null; opacity: number; isolate: boolean; highlightGroup: StructureGroup | null; showLabels: boolean;
  resetSignal: number; zoomSignal: { n: number; dir: 1 | -1 };
  onSelect: (id: string | null) => void; onHover: (id: string | null) => void; onStatus: (s: ModelStatus, meshCount?: number) => void;
  reducedMotion: boolean;
}

export function hasWebGL(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

type Ctl = { target: THREE.Vector3; update: () => void; object: THREE.Camera };

function Scene(p: ViewerProps & { enableZoom: boolean }) {
  const { nodes } = useGLTF(MODEL_URL) as unknown as { nodes: Record<string, THREE.Object3D> };
  const meshes = useMemo(() => Object.values(nodes).filter((n): n is THREE.Mesh => (n as THREE.Mesh).isMesh && !!STRUCTURE_BY_ID[n.name]), [nodes]);
  const { camera, invalidate, gl } = useThree();
  const ctl = useRef<Ctl | null>(null);
  const home = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; dist: number } | null>(null);

  // frame the whole model once, and remember the view for "reset camera"
  useEffect(() => {
    const box = new THREE.Box3();
    meshes.forEach((m) => { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!); });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 1.55 / Math.tan((((camera as THREE.PerspectiveCamera).fov ?? 35) * Math.PI) / 360);
    const pos = new THREE.Vector3(c.x, c.y + size.y * 0.05, c.z + dist);
    home.current = { pos, target: c, dist };
    camera.position.copy(pos); camera.near = dist / 50; camera.far = dist * 10; camera.updateProjectionMatrix();
    if (ctl.current) { ctl.current.target.copy(c); ctl.current.update(); }
    gl.domElement.style.touchAction = "pan-y"; // vertical swipes keep scrolling the page
    p.onStatus("ready", meshes.length);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes]);

  useEffect(() => {
    if (!home.current || !ctl.current || p.resetSignal === 0) return;
    camera.position.copy(home.current.pos); ctl.current.target.copy(home.current.target); ctl.current.update(); invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.resetSignal]);

  useEffect(() => {
    if (!ctl.current || p.zoomSignal.n === 0) return;
    const t = ctl.current.target, v = camera.position.clone().sub(t);
    const d = THREE.MathUtils.clamp(v.length() * (p.zoomSignal.dir === 1 ? 0.8 : 1.25), (home.current?.dist ?? 3) * 0.3, (home.current?.dist ?? 3) * 2.5);
    camera.position.copy(t).add(v.setLength(d)); ctl.current.update(); invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.zoomSignal]);

  // keyboard rotation (arrow keys) forwarded from the wrapper
  useEffect(() => {
    const el = gl.domElement.parentElement?.parentElement; if (!el) return;
    const key = (e: KeyboardEvent) => {
      if (!ctl.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const t = ctl.current.target, off = camera.position.clone().sub(t), s = new THREE.Spherical().setFromVector3(off);
      const step = 0.12;
      if (e.key === "ArrowLeft") s.theta -= step; if (e.key === "ArrowRight") s.theta += step;
      if (e.key === "ArrowUp") s.phi = Math.max(0.15, s.phi - step); if (e.key === "ArrowDown") s.phi = Math.min(Math.PI - 0.15, s.phi + step);
      camera.position.copy(t).add(off.setFromSpherical(s)); ctl.current.update(); invalidate();
    };
    el.addEventListener("keydown", key); return () => el.removeEventListener("keydown", key);
  }, [camera, gl, invalidate]);

  const sel = p.selected;
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <directionalLight position={[-4, -1, -3]} intensity={0.6} />
      {meshes.map((m) => {
        const def = STRUCTURE_BY_ID[m.name];
        const isSel = sel === def.id;
        return (
          <AnatomicalStructure key={def.id} def={def} geometry={m.geometry} baseOpacity={p.opacity}
            selected={isSel} hovered={p.hovered === def.id} highlighted={!!p.highlightGroup && def.group === p.highlightGroup}
            dimmed={!!sel && !isSel} hidden={p.isolate && !!sel && !isSel} showLabel={p.showLabels}
            onSelect={(id) => p.onSelect(id)} onHover={p.onHover} />
        );
      })}
      <OrbitControls ref={ctl as never} makeDefault enablePan={false} enableZoom={p.enableZoom} enableDamping={!p.reducedMotion} dampingFactor={0.12} rotateSpeed={0.8} />
    </>
  );
}

export default function AnatomyViewer(props: ViewerProps) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [active, setActive] = useState(false); // wheel zoom only after the user clicks the viewer, so page scrolling is never hijacked
  const { onStatus } = props;
  useEffect(() => { const ok = hasWebGL(); setWebgl(ok); if (!ok) onStatus("no-webgl"); }, [onStatus]);
  const fail = useCallback(() => onStatus("error"), [onStatus]);
  const visible = STRUCTURES.filter((s) => !(props.isolate && props.selected && s.id !== props.selected)).length;

  if (webgl === null) return <div className="flex h-full items-center justify-center text-sm text-mute">Checking graphics support…</div>;
  if (!webgl) return null;
  return (
    <div className="relative h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-accent" tabIndex={0} role="group"
      aria-label="3D cardiovascular atlas. Drag to rotate, arrow keys rotate, use the zoom buttons. A list of structures is available in the controls."
      data-selected={props.selected ?? ""} data-hovered={props.hovered ?? ""} data-isolate={String(props.isolate)} data-highlight-group={props.highlightGroup ?? ""} data-opacity={props.opacity} data-visible-count={visible}
      onPointerDown={() => setActive(true)} onBlur={() => setActive(false)} onKeyDown={(e) => { if (e.key === "Escape") { setActive(false); (e.currentTarget as HTMLElement).blur(); } }}>
      <Boundary onError={fail}>
        <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 35, position: [0, 0, 6] }} gl={{ antialias: true, preserveDrawingBuffer: true }}
          onPointerMissed={() => props.onSelect(null)} style={{ touchAction: "pan-y" }}>
          <Suspense fallback={null}><Scene {...props} enableZoom={active} /></Suspense>
        </Canvas>
      </Boundary>
      <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-mute">{active ? "Wheel zoom on · Esc to release" : "Click the model to enable wheel zoom · drag to rotate"}</p>
    </div>
  );
}
