"use client";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ACTIVE_MISSION_ID, BODIES, MISSIONS, bodyById, checkpointPosition, routeCurve, shipHealthFor, vehiclePosition, type CelestialBodyId, type MissionStatusLevel } from "@/lib/missions";
import { Earth, Mars, Moon, Starfield, SUN_POSITION } from "./Bodies";
import { Checkpoints, Route, ROUTE_COLOR, type HoverInfo } from "./Routes";
import { Spacecraft, variantFor } from "./Spacecraft";
import { LEVEL_COLOR } from "@/components/navigator/ShipHealth";

export interface ViewRequest { target: string; nonce: number }
export interface SceneProps {
  selectedId: string | null; pickedCp: { missionId: string; cpId: string } | null; view: ViewRequest; reduced: boolean;
  onSelectMission: (id: string) => void; onPickCheckpoint: (missionId: string, cpId: string) => void; onHover: (h: HoverInfo | null) => void;
  onFocusBody: (id: CelestialBodyId) => void; onEmpty: (doubleClick: boolean) => void; onReady: () => void;
}

type Goal = { pos: THREE.Vector3; target: THREE.Vector3 };
const V = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
export const OVERVIEW: Goal = { pos: V(0, 5.5, 22.5), target: V(0, 0.9, -1) };

export function goalFor(target: string): Goal {
  if (target === "overview") return OVERVIEW;
  if (target === "earth-moon") return { pos: V(-7.4, 3.4, 10.5), target: V(-7.3, 0.3, -1) };
  if (target === "mars") return { pos: V(10, 2.6, 6.6), target: V(10, 0, -2) };
  const body = BODIES.find((b) => b.id === target);
  if (body) { const p = V(...body.position); return { pos: p.clone().add(V(0.6, 0.5, 1).normalize().multiplyScalar(body.radius * 4.6 + 1.2)), target: p }; }
  const m = MISSIONS.find((x) => x.id === target);
  if (m) { const p = V(...vehiclePosition(m)); const t = routeCurve(m.route).getTangentAt(Math.min(0.99, Math.max(0.01, m.vehicle.progress))); const side = t.clone().cross(V(0, 1, 0)).normalize(); return { pos: p.clone().add(side.multiplyScalar(2.2)).add(V(0, 1.1, 0)), target: p }; }
  return OVERVIEW;
}

function CameraRig({ view, reduced }: { view: ViewRequest; reduced: boolean }) {
  const { camera, invalidate } = useThree();
  const ctl = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const anim = useRef<Goal | null>(null);
  useEffect(() => {
    const g = goalFor(view.target); const c = ctl.current; if (!c) return;
    if (reduced) { camera.position.copy(g.pos); c.target.copy(g.target); c.update(); invalidate(); } else anim.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.nonce]);
  useFrame((_, dt) => {
    const a = anim.current, c = ctl.current; if (!a || !c) return;
    const k = 1 - Math.exp(-dt * 3.4);
    camera.position.lerp(a.pos, k); c.target.lerp(a.target, k); c.update();
    if (camera.position.distanceTo(a.pos) < 0.03 && c.target.distanceTo(a.target) < 0.03) anim.current = null;
  });
  return <OrbitControls ref={ctl as never} makeDefault enablePan={false} enableDamping={!reduced} dampingFactor={0.08} minDistance={0.9} maxDistance={48} rotateSpeed={0.55} zoomSpeed={0.7} onStart={() => { anim.current = null; }} />;
}

function Ready({ onReady }: { onReady: () => void }) { useEffect(() => { const id = requestAnimationFrame(() => onReady()); return () => cancelAnimationFrame(id); }, [onReady]); return null; }

/** Screen-space labels. Drei's <Html> is avoided: it unmounts a React root during render, which React 19 rejects. */
interface LabelItem { key: string; pos: [number, number, number]; node: ReactNode }

function LabelProjector({ items, els }: { items: LabelItem[]; els: MutableRefObject<Record<string, HTMLElement | null>> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const it of items) {
      const el = els.current[it.key]; if (!el) continue;
      v.set(...it.pos).project(camera);
      if (v.z > 1 || v.z < -1) { el.style.visibility = "hidden"; continue; }
      el.style.visibility = "visible";
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });
  return null;
}

function shipLabel(m: (typeof MISSIONS)[number], selectedId: string | null): ReactNode {
  const active = m.id === ACTIVE_MISSION_ID, sel = m.id === selectedId;
  const lvl: MissionStatusLevel = shipHealthFor(m).overall;
  const dot = lvl === "watch" || lvl === "warning" || lvl === "critical";
  return (
    <div className={`flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide backdrop-blur-sm ${active ? "border-cyan-300/60 bg-black/60 text-cyan-100" : sel ? "border-white/40 bg-black/55 text-white" : "border-white/15 bg-black/40 text-slate-300"}`}>
      {dot && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOR[lvl] }} />}
      {m.code}{active ? " · SESSION" : ""}
    </div>
  );
}

export default function SpaceScene(p: SceneProps) {
  const sun = useMemo(() => V(...SUN_POSITION), []);
  const anySel = !!p.selectedId;
  const els = useRef<Record<string, HTMLElement | null>>({});
  const items = useMemo<LabelItem[]>(() => {
    const out: LabelItem[] = [];
    for (const m of MISSIONS) {
      const pos = vehiclePosition(m);
      out.push({ key: `ship-${m.id}`, pos: [pos[0], pos[1] + 0.75, pos[2]], node: shipLabel(m, p.selectedId) });
      const showCps = m.id === p.selectedId || (!p.selectedId && m.id === ACTIVE_MISSION_ID);
      m.checkpoints.forEach((c) => {
        if (!showCps && !(p.pickedCp?.missionId === m.id && p.pickedCp.cpId === c.id)) return;
        const cp = checkpointPosition(m, c);
        out.push({ key: `cp-${m.id}-${c.id}`, pos: [cp[0], cp[1] + 0.2, cp[2]], node: <span className="whitespace-nowrap font-mono text-[9px] tracking-wide text-slate-200/90">{c.label}</span> });
      });
    }
    return out;
  }, [p.selectedId, p.pickedCp]);
  return (
    <div className="relative h-full w-full">
    <Canvas frameloop={p.reduced ? "demand" : "always"} dpr={[1, 1.6]} camera={{ fov: 38, near: 0.05, far: 600, position: OVERVIEW.pos.toArray() }}
      gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      onCreated={({ camera, gl }) => { camera.lookAt(OVERVIEW.target); gl.setClearColor("#000000"); }}
      onPointerMissed={(e) => p.onEmpty(e.detail >= 2)} style={{ background: "#000" }}>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.1} color="#9fb4d6" />
      <directionalLight position={sun} intensity={3.4} color="#fff6e6" />
      <directionalLight position={[10, -4, -12]} intensity={0.25} color="#7aa7ff" />
      <Suspense fallback={null}>
        <Starfield />
        <Earth reduced={p.reduced} onClick={p.onFocusBody} onHover={(id) => p.onHover(id ? { kind: "body", bodyId: id, x: -1, y: -1 } : null)} />
        <Moon reduced={p.reduced} onClick={p.onFocusBody} onHover={(id) => p.onHover(id ? { kind: "body", bodyId: id, x: -1, y: -1 } : null)} />
        <Mars reduced={p.reduced} onClick={p.onFocusBody} onHover={(id) => p.onHover(id ? { kind: "body", bodyId: id, x: -1, y: -1 } : null)} />
        {MISSIONS.map((m) => {
          const sel = m.id === p.selectedId, active = m.id === ACTIVE_MISSION_ID;
          const level = sel || (!anySel && active) ? "selected" : anySel ? "dim" : "idle";
          const pos = vehiclePosition(m);
          const tan = routeCurve(m.route).getTangentAt(m.route.closed ? ((m.vehicle.progress % 1) + 1) % 1 : Math.min(0.995, Math.max(0.005, m.vehicle.progress))).toArray() as [number, number, number];
          const accent = ROUTE_COLOR[m.route.kind];
          return (
            <group key={m.id}>
              <Route m={m} level={level} reduced={p.reduced} />
              <Checkpoints m={m} selected={level === "selected"} picked={p.pickedCp?.missionId === m.id ? p.pickedCp.cpId : null} reduced={p.reduced}
                onHover={p.onHover} onPick={(cp) => p.onPickCheckpoint(m.id, cp)} />
              <Spacecraft variant={variantFor(m.route.kind)} position={pos} tangent={tan} emphasis={active ? "active" : sel ? "selected" : anySel ? "dim" : "idle"} accent={active ? "#67e8f9" : accent} reduced={p.reduced} />
              <mesh position={pos} onClick={(e) => { e.stopPropagation(); p.onSelectMission(m.id); }}
                onPointerOver={(e) => { e.stopPropagation(); p.onHover({ kind: "ship", missionId: m.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
                onPointerMove={(e) => p.onHover({ kind: "ship", missionId: m.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })}
                onPointerOut={() => p.onHover(null)}>
                <sphereGeometry args={[0.62, 10, 8]} /><meshBasicMaterial visible={false} />
              </mesh>
            </group>
          );
        })}
        <Ready onReady={p.onReady} />
      </Suspense>
      <LabelProjector items={items} els={els} />
      <CameraRig view={p.view} reduced={p.reduced} />
    </Canvas>
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((it) => <div key={it.key} ref={(el) => { els.current[it.key] = el; }} className="absolute left-0 top-0" style={{ visibility: "hidden" }}>{it.node}</div>)}
    </div>
    </div>
  );
}
void bodyById;
