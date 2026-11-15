"use client";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ACTIVE_MISSION_ID, MISSIONS, missionById, shipHealthFor, type MissionRecord } from "@/lib/missions";
import { checkpointStatus, msOfDay, trajectoryFor, type TrajPoint, type Trajectory } from "@/lib/trajectory";
import { DISPLAY } from "@/lib/display";
import { LOCAL_RING_RADIUS, bodiesHelio, entryDirOf, helioScene, localScene, moonScene, pointAt, type ViewMode } from "@/lib/scene";
import { unit, type V3 } from "@/lib/orbits";
import { NET, isManeuver, moonNet, netLunarRing, netOrbitRing, netPoint } from "@/lib/network";
import { ephemerisState } from "@/lib/ephemeris";
import { Earth, Mars, Moon, Starfield, Sun, glowTexture, type BodyId, type MsRef } from "./Bodies";
import { Spacecraft, variantFor } from "./Spacecraft";
import { ROUTE_COLOR, type HoverInfo } from "./colors";
import { LEVEL_COLOR } from "@/components/navigator/ShipHealth";

export interface ViewRequest { kind: "mode" | "body" | "mission"; id?: string; nonce: number }
export interface SceneProps {
  missionId: string; mode: ViewMode; selectedId: string | null; pickedCp: { missionId: string; cpId: string } | null; view: ViewRequest; reduced: boolean; playing: boolean; msRef: MsRef; tick: number;
  onSelectMission: (id: string) => void; onPickCheckpoint: (missionId: string, cpId: string) => void; onHover: (h: HoverInfo | null) => void;
  onFocusBody: (id: BodyId) => void; onEmpty: (doubleClick: boolean) => void; onReady: () => void;
}

type Frame = "net" | "helio" | "earth" | "mars";
/** Which scene content is shown: heliocentric (Overview, Interplanetary, and Local for a Sun-centred transfer) or a planet-centred Local view. */
export function frameFor(mode: ViewMode, _m?: MissionRecord): Frame {
  void _m;
  return mode === "network" ? "net" : mode === "interplanetary" ? "helio" : mode === "mars" ? "mars" : "earth";
}
const V = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
type Goal = { pos: THREE.Vector3; target: THREE.Vector3 };
interface Ctx { mode: ViewMode; missionId: string; msRef: MsRef }

const posOf = (id: string, frame: Frame, p: TrajPoint, tr: Trajectory, ed: V3 | undefined): V3 => (frame === "helio" ? helioScene(p.helio) : frame === "net" ? netPoint(tr, p, msOfDay(id, p.day)) : localScene(p, tr, ed));
const pathScene = (id: string, frame: Frame, n: number, from?: number, to?: number) => {
  const tr = trajectoryFor(id), ed = entryDirOf(tr);
  return tr.samples(n, from, to).map((p) => posOf(id, frame, p, tr, ed));
};

export function goalFor(view: ViewRequest, c: Ctx & { aspect?: number }): Goal {
  const frame = frameFor(c.mode), ms = c.msRef.current;
  if (frame === "net") {
    const k = Math.max(1, 1.72 / (c.aspect ?? 1.78)), tgt = v3(NET.cam.target);
    if (view.kind === "body") {
      const t = view.id === "earth" ? v3(NET.earth) : view.id === "mars" ? v3(NET.mars) : v3(moonNet(ms) ?? NET.earth), R = view.id === "earth" ? NET.earthR : view.id === "mars" ? NET.marsR : NET.moonR;
      return { pos: t.clone().add(V(0, R * 0.7, R * 3.4 + 2)), target: t };
    }
    return { pos: V(NET.cam.pos[0], NET.cam.pos[1], NET.cam.pos[2] * k), target: tgt };
  }
  if (frame === "helio") {
    const b = bodiesHelio(ms);
    if (view.kind === "body" && b && (view.id === "earth" || view.id === "mars")) { const t = v3(b[view.id]); return { pos: t.clone().add(V(1.7, 1.3, 2.6)), target: t }; }
    if (view.kind === "mission") { const p = pointAt(view.id!, ms); if (p) { const t = v3(helioScene(p.helio)); return { pos: t.clone().add(V(1.8, 1.4, 2.4)), target: t }; } }
    return { pos: V(0, 62, 52), target: V(0, 0, 0) };
  }
  const r = DISPLAY.bodyRadius;
  if (view.kind === "mission") { const p = pointAt(view.id!, ms), tr = trajectoryFor(view.id!); if (p && (frame === "mars") === (tr.primary === "mars")) { const t = v3(localScene(p, tr, entryDirOf(tr))); return { pos: t.clone().add(V(0.9, 0.7, 1.2)), target: t }; } }
  if (frame === "mars") return { pos: V(0, r * 1.7, r * 4.7), target: V(0, 0, 0) };
  const mg = ephemerisState("moon", ms)?.r ?? null;
  if (mg) { const M = v3(moonScene(mg)), t = M.clone().multiplyScalar(0.45), d = M.length() * 1.25 + 7; return { pos: t.clone().add(V(0, 0.5, 0.86).normalize().multiplyScalar(d)), target: t }; }
  return { pos: V(0, r * 1.9, r * 5.2), target: V(0, 0, 0) };
}

function CameraRig({ view, reduced, ctx, followId }: { view: ViewRequest; reduced: boolean; ctx: Ctx; followId: string | null }) {
  const { camera, invalidate, size } = useThree();
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const anim = useRef<Goal | null>(null);
  const lastFollow = useRef<THREE.Vector3 | null>(null);
  const ctxRef = useRef(ctx); ctxRef.current = ctx;
  useEffect(() => {
    const g = goalFor(view, { ...ctxRef.current, aspect: size.width / Math.max(1, size.height) }), c = controls.current; if (!c) return;
    lastFollow.current = null;
    if (reduced) { camera.position.copy(g.pos); c.target.copy(g.target); c.update(); invalidate(); } else anim.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.nonce, ctx.mode, Math.round(size.width / 160)]);
  useFrame((_, dt) => {
    const c = controls.current; if (!c) return;
    const a = anim.current;
    if (a) {
      const k = 1 - Math.exp(-dt * 3.4);
      camera.position.lerp(a.pos, k); c.target.lerp(a.target, k); c.update();
      if (camera.position.distanceTo(a.pos) < 0.03 && c.target.distanceTo(a.target) < 0.03) anim.current = null;
      lastFollow.current = null; return;
    }
    if (followId) { // keep the vehicle centred while following (Sun-centred Local view)
      const p = pointAt(followId, ctxRef.current.msRef.current); if (!p) return;
      const now = v3(helioScene(p.helio));
      if (lastFollow.current) { const d = now.clone().sub(lastFollow.current); camera.position.add(d); c.target.add(d); c.update(); }
      lastFollow.current = now;
    }
  });
  return <OrbitControls ref={controls as never} makeDefault enablePan={false} enableDamping={!reduced} dampingFactor={0.08} minDistance={0.25} maxDistance={150} rotateSpeed={0.55} zoomSpeed={0.8} onStart={() => { anim.current = null; }} />;
}

function Ready({ onReady }: { onReady: () => void }) { useEffect(() => { const id = requestAnimationFrame(() => onReady()); return () => cancelAnimationFrame(id); }, [onReady]); return null; }

/** Positions a group each frame from a function of the simulation clock; hides it when the function returns null. */
function Mover({ msRef, get, children, scaleWithDistance, cap, minScale = 0.01, onPos }: { msRef: MsRef; get: (ms: number) => V3 | null; children: ReactNode; scaleWithDistance?: number; cap?: number; minScale?: number; onPos?: (p: THREE.Vector3) => void }) {
  const g = useRef<THREE.Group>(null), wp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const o = g.current; if (!o) return;
    const p = get(msRef.current);
    if (!p) { o.visible = false; return; }
    o.visible = true; o.position.set(p[0], p[1], p[2]);
    if (scaleWithDistance) o.scale.setScalar(Math.min(cap ?? 9, Math.max(minScale, camera.position.distanceTo(o.getWorldPosition(wp)) * scaleWithDistance)));
    onPos?.(o.position);
  });
  return <group ref={g} visible={false}>{children}</group>;
}

function Line({ pts, color, opacity, dashed = false, closed = false, draw }: { pts: V3[]; color: string; opacity: number; dashed?: boolean; closed?: boolean; draw?: { msRef: MsRef; fraction: (ms: number) => number } }) {
  const geo = useMemo(() => { const g = new THREE.BufferGeometry().setFromPoints((closed ? [...pts, pts[0]] : pts).map(v3)); if (dashed) { const p = g.getAttribute("position"), out: number[] = []; for (let i = 0; i + 1 < p.count; i += 2) out.push(p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)); return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); } return g; }, [pts, dashed, closed]);
  useEffect(() => () => geo.dispose(), [geo]);
  const ref = useRef<THREE.Line>(null);
  useFrame(() => { if (!draw || !ref.current) return; const n = geo.getAttribute("position").count; ref.current.geometry.setDrawRange(0, Math.max(0, Math.min(n, Math.round(draw.fraction(draw.msRef.current) * n)))); });
  if (dashed) return <lineSegments geometry={geo}><lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></lineSegments>;
  return <line ref={ref as never}><primitive object={geo} attach="geometry" /><lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></line>;
}

function Marker({ color, size = 0.05 }: { color: string; size?: number }) {
  return <mesh><sphereGeometry args={[size, 14, 10]} /><meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent opacity={0.95} /></mesh>;
}

interface LabelItem { key: string; get: (ms: number) => V3 | null; node: ReactNode; dy?: number }
function LabelProjector({ items, els, msRef }: { items: LabelItem[]; els: React.MutableRefObject<Record<string, HTMLElement | null>>; msRef: MsRef }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const it of items) {
      const el = els.current[it.key]; if (!el) continue;
      const p = it.get(msRef.current); if (!p) { el.style.visibility = "hidden"; continue; }
      v.set(p[0], p[1], p[2]).project(camera);
      if (v.z > 1 || v.z < -1) { el.style.visibility = "hidden"; continue; }
      el.style.visibility = "visible";
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height + (it.dy ?? 0)).toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });
  return null;
}

const shipLabel = (m: MissionRecord, selectedId: string | null, missionId: string, net: boolean): ReactNode => {
  const sess = m.id === ACTIVE_MISSION_ID, sel = m.id === selectedId || m.id === missionId, lvl = shipHealthFor(m).overall, dot = lvl === "watch" || lvl === "warning" || lvl === "critical";
  return (
    <div className="relative">
      <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-2 py-[3px] font-mono text-[11px] tracking-wide ${sel ? "border-accent bg-bg/85 font-semibold text-ink shadow-[0_0_10px_rgba(56,201,244,0.35)]" : "border-ink2/70 bg-bg/70 text-ink"}`}>
        {sel && <span className="inline-block h-2 w-2 rounded-full" style={{ background: ROUTE_COLOR[m.route] }} />}
        {dot && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOR[lvl] }} />}
        {m.code}{sess ? " · SESSION" : ""}
      </div>
      {net && <span className={`absolute left-1/2 top-full h-[18px] w-px ${sel ? "" : "bg-ink2/60"}`} style={sel ? { background: ROUTE_COLOR[m.route] } : undefined} />}
    </div>
  );
};
const bodyLabel = (t: string) => <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.16em] text-ink2">{t}</span>;

/** A vehicle: oriented along its velocity, scaled with camera distance (sizes are exaggerated, never to scale). */
function Vehicle({ m, frame, msRef, emphasis, reduced, onSelect, onHover, showModel }: { m: MissionRecord; frame: Frame; msRef: MsRef; emphasis: "active" | "selected" | "idle" | "dim"; reduced: boolean; onSelect: () => void; onHover: SceneProps["onHover"]; showModel: boolean }) {
  const tr = useMemo(() => trajectoryFor(m.id), [m.id]), ed = useMemo(() => entryDirOf(tr), [tr]);
  const get = useMemo(() => (ms: number): V3 | null => { const p = pointAt(m.id, ms); return p ? posOf(m.id, frame, p, tr, ed) : null; }, [m.id, frame, tr, ed]);
  const orient = useRef<THREE.Group>(null), q = useMemo(() => new THREE.Quaternion(), []), ex = useMemo(() => new THREE.Vector3(1, 0, 0), []), tmp = useMemo(() => new THREE.Vector3(), []);
  const hit = useRef<THREE.Mesh>(null);
  const dtMs = (m.route === "earth-mars-transfer" ? 86400 : m.route === "lunar-transfer" ? 600 : 60) * 1000;
  useFrame(({ camera }) => {
    const o = orient.current; if (!o) return;
    const ms = msRef.current, a = get(ms), b = get(ms + dtMs);
    if (a && b) { tmp.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); if (tmp.lengthSq() > 1e-14) { q.setFromUnitVectors(ex, tmp.normalize()); o.quaternion.copy(q); } }
    if (hit.current && a) { const d = camera.position.distanceTo(tmp.set(a[0], a[1], a[2])); hit.current.scale.setScalar(Math.max(frame === "net" ? 1.6 : 0.12, d * 0.022)); }
  });
  const net = frame === "net", cap = net ? 5.2 : frame === "helio" ? 0.16 : 0.9;
  return (
    <Mover msRef={msRef} get={get}>
      <Mover msRef={{ current: 0 }} get={() => [0, 0, 0]} scaleWithDistance={net ? 0.052 : frame === "helio" ? 0.014 : 0.024} cap={cap} minScale={0.012}><group ref={orient}>{showModel ? <Spacecraft variant={variantFor(m.route)} emphasis={emphasis} accent={ROUTE_COLOR[m.route]} reduced={reduced} /> : null}</group></Mover>
      <Mover msRef={{ current: 0 }} get={() => [0, 0, 0]} scaleWithDistance={0.0055} cap={0.6} minScale={0.004}><Marker color={ROUTE_COLOR[m.route]} size={net ? 0.5 : 1} /></Mover>
      <mesh ref={hit} onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover({ kind: "ship", missionId: m.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
        onPointerMove={(e) => onHover({ kind: "ship", missionId: m.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })} onPointerOut={() => onHover(null)}>
        <sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial visible={false} />
      </mesh>
    </Mover>
  );
}

function CheckpointDots({ m, frame, active, picked, onHover, onPick }: { m: MissionRecord; frame: Frame; active: boolean; picked: string | null; onHover: SceneProps["onHover"]; onPick: (cp: string) => void }) {
  const tr = trajectoryFor(m.id), ed = entryDirOf(tr);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const pos = useMemo(() => tr.checkpoints.map((c) => posOf(m.id, frame, tr.at(c.plannedDay)!, tr, ed)), [tr, ed, frame, m.id]);
  const k = frame === "net" ? 0.0026 : 0.0026;
  useFrame(({ camera }) => refs.current.forEach((g, i) => { if (g) g.scale.setScalar(Math.max(0.01, camera.position.distanceTo(g.position) * (picked === tr.checkpoints[i].id ? k * 1.6 : k))); }));
  return (
    <group>
      {tr.checkpoints.map((c, i) => {
        const done = checkpointStatus(m, c) === "Completed", on = picked === c.id, man = isManeuver(c.id);
        return (
          <group key={c.id} position={pos[i]} ref={(el) => { refs.current[i] = el; }}>
            <mesh>{man ? <boxGeometry args={[1.5, 1.5, 1.5]} /> : <sphereGeometry args={[1, 14, 10]} />}<meshBasicMaterial color={on ? "#A3E635" : man ? "#F5B642" : done ? ROUTE_COLOR[m.route] : "#F7FAFF"} transparent opacity={active ? 1 : 0.55} toneMapped={false} depthTest={false} /></mesh>
            <mesh scale={2.8} onClick={(e) => { e.stopPropagation(); onPick(c.id); }}
              onPointerOver={(e) => { e.stopPropagation(); onHover({ kind: "checkpoint", missionId: m.id, cpId: c.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
              onPointerMove={(e) => onHover({ kind: "checkpoint", missionId: m.id, cpId: c.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })} onPointerOut={() => onHover(null)}>
              <sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial visible={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Small route dots (waypoint ticks) along a polyline, as in the reference composition. */
function Dots({ pts, every, color, size = 3, opacity = 0.9 }: { pts: V3[]; every: number; color: string; size?: number; opacity?: number }) {
  const geo = useMemo(() => { const sel = pts.filter((_, i) => i % every === 0); return new THREE.BufferGeometry().setFromPoints(sel.map(v3)); }, [pts, every]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <points geometry={geo}><pointsMaterial color={color} size={size} sizeAttenuation={false} transparent opacity={opacity} toneMapped={false} depthWrite={false} /></points>;
}

export default function OrbitScene(p: SceneProps) {
  const frame = frameFor(p.mode);
  const net = frame === "net";
  const els = useRef<Record<string, HTMLElement | null>>({});
  const earthOrbit = useMemo(() => orbitPts("earth", 366), []);
  const marsOrbit = useMemo(() => orbitPts("mars", 687), []);
  const moonFace = useRef(new THREE.Vector3());
  const light = useRef<THREE.DirectionalLight>(null);

  const emph = (x: MissionRecord): "active" | "selected" | "idle" | "dim" => (x.id === ACTIVE_MISSION_ID ? "active" : x.id === p.missionId || x.id === p.selectedId ? "selected" : "idle");
  const visible = MISSIONS.filter((x) => (frame === "helio" || frame === "net" ? true : frame === "mars" ? x.route === "mars-orbit" : x.route === "lunar-transfer" || x.route === "earth-orbit"));
  const showShip = (x: MissionRecord) => frame !== "helio" || x.route === "earth-mars-transfer";

  const items = useMemo<LabelItem[]>(() => {
    const out: LabelItem[] = [];
    if (frame === "helio") {
      out.push({ key: "sun", get: () => [0, 1.6, 0], node: bodyLabel("SUN") });
      out.push({ key: "earth", get: (ms) => { const b = bodiesHelio(ms); return b ? [b.earth[0], b.earth[1] + 0.95, b.earth[2]] : null; }, node: bodyLabel("EARTH") });
      out.push({ key: "mars", get: (ms) => { const b = bodiesHelio(ms); return b ? [b.mars[0], b.mars[1] + 0.7, b.mars[2]] : null; }, node: bodyLabel("MARS") });
    } else if (net) {
      out.push({ key: "moon", get: (ms) => { const q = moonNet(ms); return q ? [q[0], q[1] + NET.moonR + 0.6, q[2]] : null; }, dy: -2, node: bodyLabel("MOON") });
      out.push({ key: "mars", get: () => [NET.mars[0] + 1, NET.mars[1] - NET.marsR - 2.8, NET.mars[2] + 4], dy: 6, node: bodyLabel("MARS") });
      out.push({ key: "earth", get: () => [NET.earth[0], NET.earth[1] - NET.earthR - 1.6, NET.earth[2]], dy: 6, node: bodyLabel("EARTH") });
    } else {
      out.push({ key: "primary", get: () => [0, DISPLAY.bodyRadius + 0.35, 0], node: bodyLabel(frame === "earth" ? "EARTH" : "MARS") });
      if (frame === "earth") out.push({ key: "moon", get: (ms) => { const mg = moonGeoAt(ms); return mg ? [moonScene(mg)[0], moonScene(mg)[1] + 0.8, moonScene(mg)[2]] : null; }, node: bodyLabel("MOON") });
    }
    let stack = 0;
    visible.forEach((x) => {
      const tr = trajectoryFor(x.id), ed = entryDirOf(tr);
      const dy = net ? -30 : frame === "helio" ? (x.route !== "earth-mars-transfer" ? -16 * stack++ : -14) : 0;
      out.push({ key: `ship-${x.id}`, dy, get: (ms) => { const pt = pointAt(x.id, ms); if (!pt) return null; const q = posOf(x.id, frame, pt, tr, ed); return [q[0], q[1] + (net ? 0 : frame === "helio" ? 0.5 : 0.6), q[2]]; }, node: shipLabel(x, p.selectedId, p.missionId, net) });
      const show = x.id === p.missionId || x.id === p.selectedId;
      if (show && showShip(x)) tr.checkpoints.forEach((c, ci) => {
        out.push({ key: `cp-${x.id}-${c.id}`, dy: net ? (ci % 2 === 0 ? -10 : 22) : 0, get: () => { const pt = tr.at(c.plannedDay)!; const q = posOf(x.id, frame, pt, tr, ed); return [q[0], q[1] + (net ? 0 : 0.3), q[2]]; }, node: <span className="whitespace-nowrap font-mono text-[10px] tracking-wide text-ink">{c.label}</span> });
      });
    });
    return out;
  }, [frame, p.selectedId, p.missionId, visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyHover = (id: BodyId | null) => p.onHover(id ? { kind: "body", bodyId: id, x: -1, y: -1 } : null);
  const frameloop = p.reduced && !p.playing ? "demand" : "always";
  const flown = (id: string) => (ms: number) => { const tr = trajectoryFor(id); return Math.max(0, Math.min(1, ((pointDay(id, ms) - tr.minDay) / (tr.pathEndDay - tr.minDay)))); };
  if (net) moonFace.current.set(NET.earth[0], NET.earth[1], NET.earth[2]);

  return (
    <div className="relative h-full w-full">
      <Canvas frameloop={frameloop} dpr={[1, 1.6]} camera={{ fov: 38, near: 0.02, far: 900, position: [0, 10, 84] }}
        gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onCreated={({ camera, gl }) => { camera.lookAt(0, -1.5, 0); gl.setClearColor("#020408"); }}
        onPointerMissed={(e) => p.onEmpty(e.detail >= 2)} style={{ background: "#020408" }}>
        <color attach="background" args={["#020408"]} />
        <ambientLight intensity={net ? 0.4 : frame === "helio" ? 0.14 : 0.42} color="#9fb4d6" />
        <Suspense fallback={null}>
          <Starfield />
          {net ? (
            <>
              <directionalLight position={[-14, 22, 80]} intensity={3.4} color="#fff6e6" />
              <group position={NET.earth}><Earth radius={NET.earthR} msRef={p.msRef} reduced={p.reduced} onClick={p.onFocusBody} onHover={bodyHover} /></group>
              <Mover msRef={p.msRef} get={(ms) => moonNet(ms)}><Moon radius={NET.moonR} faceTo={moonFace} onClick={p.onFocusBody} onHover={bodyHover} /></Mover>
              <group position={NET.mars}><Mars radius={NET.marsR} msRef={p.msRef} reduced={p.reduced} onClick={p.onFocusBody} onHover={bodyHover} /></group>
              {visible.map((x) => {
                const tr = trajectoryFor(x.id), ed = entryDirOf(tr), on = x.id === p.missionId || x.id === p.selectedId, col = ROUTE_COLOR[x.route];
                const ring = netOrbitRing(x.id);
                if (ring && x.route !== "earth-mars-transfer") return <group key={x.id}><Line pts={ring} color={col} opacity={on ? 0.95 : 0.5} closed /><Dots pts={ring} every={13} color={on ? "#F7FAFF" : col} size={on ? 3.2 : 2.4} opacity={on ? 0.95 : 0.55} /></group>;
                const pts = pathScene(x.id, "net", x.route === "earth-mars-transfer" ? 320 : 260);
                const cap = x.route === "lunar-transfer" ? tr.samples(40, tr.checkpoints.find((c) => c.id === "soi")!.plannedDay, tr.checkpoints.find((c) => c.id === "loi")!.plannedDay).map((q) => posOf(x.id, "net", q, tr, ed)) : null;
                return (
                  <group key={x.id}>
                    <Line pts={pts} color={col} opacity={on ? 0.55 : 0.28} dashed />
                    <Line pts={pts} color={col} opacity={on ? 1 : 0.6} draw={{ msRef: p.msRef, fraction: flown(x.id) }} />
                    <Dots pts={pts} every={x.route === "earth-mars-transfer" ? 32 : 26} color={col} size={on ? 3.4 : 2.4} opacity={on ? 0.95 : 0.5} />
                    {cap && <Line pts={cap} color={col} opacity={on ? 0.7 : 0.35} dashed />}
                    {x.route === "lunar-transfer" && <Mover msRef={p.msRef} get={(ms) => moonNet(ms)}><Line pts={netLunarRing(x.id)} color={col} opacity={on ? 0.7 : 0.4} closed /></Mover>}
                  </group>
                );
              })}
            </>
          ) : frame === "helio" ? (
            <>
              <pointLight position={[0, 0, 0]} intensity={900} decay={1.2} color="#fff4e0" distance={0} />
              <Sun radius={0.9} />
              <Line pts={earthOrbit} color="#60A5FA" opacity={0.42} closed />
              <Line pts={marsOrbit} color="#FB923C" opacity={0.42} closed />
              <Mover msRef={p.msRef} get={(ms) => bodiesHelio(ms)?.earth ?? null}><Earth radius={0.5} msRef={p.msRef} reduced={p.reduced} onClick={p.onFocusBody} onHover={bodyHover} /></Mover>
              <Mover msRef={p.msRef} get={(ms) => bodiesHelio(ms)?.mars ?? null}><Mars radius={0.34} msRef={p.msRef} reduced={p.reduced} onClick={p.onFocusBody} onHover={bodyHover} /></Mover>
              {visible.filter((x) => x.route === "earth-mars-transfer").map((x) => {
                const pts = pathScene(x.id, "helio", 320), on = x.id === p.missionId || x.id === p.selectedId;
                return <group key={x.id}><Line pts={pts} color={ROUTE_COLOR[x.route]} opacity={on ? 0.32 : 0.16} dashed /><Line pts={pts} color={ROUTE_COLOR[x.route]} opacity={on ? 1 : 0.55} draw={{ msRef: p.msRef, fraction: flown(x.id) }} /></group>;
              })}
            </>
          ) : (
            <>
              <directionalLight ref={light} position={[40, 10, 20]} intensity={3.2} color="#fff6e6" />
              <SunDirection msRef={p.msRef} frame={frame} light={light} />
              {frame === "earth" ? <Earth radius={DISPLAY.bodyRadius} msRef={p.msRef} reduced={p.reduced} onClick={p.onFocusBody} onHover={bodyHover} /> : <Mars radius={DISPLAY.bodyRadius} msRef={p.msRef} reduced={p.reduced} onClick={p.onFocusBody} onHover={bodyHover} />}
              {frame === "earth" && (
                <Mover msRef={p.msRef} get={(ms) => { const mg = moonGeoAt(ms); return mg ? moonScene(mg) : null; }}>
                  <Moon radius={DISPLAY.moonRadius} faceTo={moonFace} onClick={p.onFocusBody} onHover={bodyHover} />
                </Mover>
              )}
              {frame === "earth" && <MoonFace msRef={p.msRef} face={moonFace} />}
              {visible.map((x) => {
                const tr = trajectoryFor(x.id), ed = entryDirOf(tr), on = x.id === p.missionId || x.id === p.selectedId;
                const closed = x.route === "earth-orbit" || x.route === "mars-orbit";
                const pts = pathScene(x.id, frame, closed ? 180 : 260);
                const cap = x.route === "lunar-transfer" ? tr.samples(40, tr.checkpoints.find((c) => c.id === "soi")!.plannedDay, tr.checkpoints.find((c) => c.id === "loi")!.plannedDay).map((q) => localScene(q, tr, ed)) : null;
                return (
                  <group key={x.id}>
                    {closed ? <Line pts={pts} color={ROUTE_COLOR[x.route]} opacity={on ? 0.9 : 0.45} closed /> : <>
                      <Line pts={pts} color={ROUTE_COLOR[x.route]} opacity={on ? 0.32 : 0.16} dashed />
                      <Line pts={pts} color={ROUTE_COLOR[x.route]} opacity={on ? 1 : 0.55} draw={{ msRef: p.msRef, fraction: flown(x.id) }} />
                      {cap && <Line pts={cap} color={ROUTE_COLOR[x.route]} opacity={on ? 0.6 : 0.3} dashed />}
                    </>}
                    {x.route === "lunar-transfer" && <LunarRing m={x} msRef={p.msRef} />}
                  </group>
                );
              })}
            </>
          )}
          {visible.map((x) => (
            <group key={x.id}>
              <Vehicle m={x} frame={frame} msRef={p.msRef} emphasis={emph(x)} reduced={p.reduced} showModel={showShip(x)} onSelect={() => p.onSelectMission(x.id)} onHover={p.onHover} />
              {showShip(x) && (x.id === p.missionId || x.id === p.selectedId) && <CheckpointDots m={x} frame={frame} active picked={p.pickedCp?.missionId === x.id ? p.pickedCp.cpId : null} onHover={p.onHover} onPick={(cp) => p.onPickCheckpoint(x.id, cp)} />}
            </group>
          ))}
          <Ready onReady={p.onReady} />
        </Suspense>
        <LabelProjector items={items} els={els} msRef={p.msRef} />
        <CameraRig view={p.view} reduced={p.reduced} ctx={{ mode: p.mode, missionId: p.missionId, msRef: p.msRef }} followId={null} />
        <Invalidate tick={p.tick} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {items.map((it) => <div key={it.key} ref={(el) => { els.current[it.key] = el; }} className="absolute left-0 top-0" style={{ visibility: "hidden" }}>{it.node}</div>)}
      </div>
    </div>
  );
}

const moonGeoAt = (ms: number): V3 | null => ephemerisState("moon", ms)?.r ?? null;
const pointDay = (id: string, ms: number) => (ms - trajectoryFor(id).epochMs) / 86400000 + 1;

function orbitPts(body: "earth" | "mars", days: number): V3[] {
  const out: V3[] = [], t0 = Date.parse("2031-01-01T00:00:00Z"), n = 180;
  for (let i = 0; i < n; i++) { const s = ephemerisState(body, t0 + (days * 86400000 * i) / n); if (s) out.push(helioScene(s.r)); }
  return out;
}

function Invalidate({ tick }: { tick: number }) { const inv = useThree((s) => s.invalidate); useEffect(() => { inv(); }, [tick, inv]); return null; }

/** Directional light from the Sun, recomputed from the ephemeris. */
function SunDirection({ msRef, frame, light }: { msRef: MsRef; frame: Frame; light: React.MutableRefObject<THREE.DirectionalLight | null> }) {
  useFrame(() => { const b = bodiesHelio(msRef.current); if (!b || !light.current) return; const d = frame === "earth" ? b.sunToEarthDir : b.sunToMarsDir; const sc = unit([-d[0], -d[1], -d[2]]); light.current.position.set(sc[0] * 60, sc[2] * 60, -sc[1] * 60); });
  return null;
}
/** Keeps the Moon's near side toward the Earth (origin of the Earth-centred Local view). */
function MoonFace({ msRef, face }: { msRef: MsRef; face: React.MutableRefObject<THREE.Vector3> }) { useFrame(() => face.current.set(0, 0, 0)); void msRef; return null; }

/** Schematic ring around the Moon showing the 100 km capture orbit (radius exaggerated). */
function LunarRing({ m, msRef }: { m: MissionRecord; msRef: MsRef }) {
  const tr = trajectoryFor(m.id), loi = tr.checkpoints.find((c) => c.id === "loi")!.plannedDay;
  const pts = useMemo(() => { const out: V3[] = []; for (let i = 0; i <= 48; i++) { const q = tr.at(loi + (i / 48) * 0.0817 + 1e-6); if (q?.moonRel) { const u = unit(q.moonRel); out.push([u[0] * LOCAL_RING_RADIUS, u[2] * LOCAL_RING_RADIUS, -u[1] * LOCAL_RING_RADIUS]); } } return out; }, [tr, loi]);
  return <Mover msRef={msRef} get={(ms) => { const mg = moonGeoAt(ms); return mg ? moonScene(mg) : null; }}>{pts.length > 3 && <Line pts={pts} color={ROUTE_COLOR["lunar-transfer"]} opacity={0.55} closed />}</Mover>;
}
