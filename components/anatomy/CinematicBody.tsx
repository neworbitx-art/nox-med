"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Cinematic full-body view. Real anatomical meshes (BodyParts3D via the open "body-atlas" build; see docs/ASSET_LICENSES.md):
 * public/models/body/skin.glb (CC BY 4.0) and public/models/body/circulatory.glb (CC BY-SA 4.0, 685 named vessels, heart and coronaries).
 * Generic adult male anatomy; it is NOT the astronaut's own anatomy. Heartbeat pulse rate = the crew member's latest recorded resting HR.
 */
export const BODY_MODELS = { skin: "/models/body/skin.glb", circ: "/models/body/circulatory.glb" };
export type TissueKind = "heart" | "artery" | "vein" | "valve";
export interface Picked { id: string; name: string; kind: TissueKind }

const kindOf = (n: string): TissueKind => {
  const s = n.toLowerCase();
  if (/valve|cusp|papillary|chordae/.test(s)) return "valve";
  if (/wall of|cavity of|ventricle|atrium|atrial|auricle|septum|myocard/.test(s) && !/artery|vein/.test(s)) return "heart";
  if (/vein|vena|sinus|venous|venule|jugular|azygos/.test(s)) return "vein";
  return "artery";
};
const PAL: Record<TissueKind, { c: string; e: string }> = { artery: { c: "#c2161f", e: "#5a0508" }, vein: { c: "#2a56c4", e: "#0a1f5c" }, heart: { c: "#a8323a", e: "#4a0d12" }, valve: { c: "#e8c9a0", e: "#3a2a14" } };

function Skin() {
  const { scene } = useGLTF(BODY_MODELS.skin, false, true);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    uniforms: { uC: { value: new THREE.Color("#7fd6ff") } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))), 2.4); gl_FragColor = vec4(uC*(0.05+f*1.15), 0.06+f*0.55); }",
  }), []);
  const obj = useMemo(() => { const c = scene.clone(true); c.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = mat; o.renderOrder = 5; } }); return c; }, [scene, mat]);
  return <primitive object={obj} />;
}

interface CircProps { hr: number; reduced: boolean; onPick: (p: Picked | null) => void; onHover: (p: Picked | null, e?: { x: number; y: number }) => void; picked: string | null; onHeart: (c: THREE.Vector3) => void }
function Circulatory({ hr, reduced, onPick, onHover, picked, onHeart }: CircProps) {
  const { scene } = useGLTF(BODY_MODELS.circ, false, true);
  const root = useMemo(() => scene.clone(true), [scene]);
  const mats = useRef<Map<string, THREE.MeshPhysicalMaterial>>(new Map());
  const heartParts = useRef<THREE.Object3D[]>([]);
  const hovered = useRef<string | null>(null);
  useEffect(() => {
    const parts: THREE.Object3D[] = [], box = new THREE.Box3();
    root.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const kind = kindOf(o.name || m.parent?.name || ""), p = PAL[kind];
      const mat = new THREE.MeshPhysicalMaterial({ color: p.c, emissive: p.e, emissiveIntensity: 0.35, roughness: 0.32, metalness: 0.02, clearcoat: 0.85, clearcoatRoughness: 0.22, sheen: 0.4, sheenColor: new THREE.Color("#ff9aa2") });
      m.material = mat; m.userData.kind = kind; m.userData.label = o.name; mats.current.set(o.uuid, mat);
      if (kind === "heart" || kind === "valve" || /coronary|ventricle|atrium/.test(o.name.toLowerCase())) { parts.push(o); box.expandByObject(o); }
    });
    heartParts.current = parts; const c = new THREE.Vector3(); box.getCenter(c); if (parts.length) onHeart(c);
  }, [root, onHeart]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, beat = reduced ? 0 : Math.pow(Math.max(0, Math.sin(t * Math.PI * (hr / 60))), 6);
    mats.current.forEach((m, id) => { const sel = picked === id, hov = hovered.current === id; m.emissiveIntensity = 0.3 + 0.9 * beat * 0.5 + (sel ? 0.9 : 0) + (hov ? 0.6 : 0); });
    heartParts.current.forEach((o) => { if (!o.userData.base) o.userData.base = o.scale.clone(); const b = o.userData.base as THREE.Vector3; o.scale.copy(b).multiplyScalar(1 + 0.018 * beat); });
  });
  const info = (e: ThreeEvent<PointerEvent | MouseEvent>) => { const o = e.object; return { id: o.uuid, p: { id: o.uuid, name: String(o.userData.label || o.name).replace(/_/g, " "), kind: o.userData.kind as TissueKind } }; };
  return (
    <primitive object={root}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); const i = info(e); hovered.current = i.id; onHover(i.p, { x: e.clientX, y: e.clientY }); document.body.style.cursor = "pointer"; }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { const i = info(e); onHover(i.p, { x: e.clientX, y: e.clientY }); }}
      onPointerOut={() => { hovered.current = null; onHover(null); document.body.style.cursor = ""; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick(info(e).p); }} />
  );
}

function Rig({ reduced, focus, idle }: { reduced: boolean; focus: THREE.Vector3 | null; idle: boolean }) {
  const { camera } = useThree(), ctl = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const t0 = useRef(0), target = useMemo(() => new THREE.Vector3(0, 0.88, 0), []), goal = useRef({ pos: new THREE.Vector3(0.25, 1.0, 3.7), tgt: new THREE.Vector3(0, 0.88, 0) });
  useEffect(() => { if (reduced) { camera.position.copy(goal.current.pos); } else { camera.position.set(1.8, 0.4, 6.2); } t0.current = 0; }, [camera, reduced]);
  useEffect(() => {
    if (focus) { goal.current.tgt.copy(focus); goal.current.pos.set(focus.x + 0.15, focus.y + 0.05, focus.z + 0.62); }
    else { goal.current.tgt.set(0, 0.88, 0); goal.current.pos.set(0.25, 1.0, 3.7); }
    t0.current = Math.min(t0.current, 0.6);
  }, [focus]);
  useFrame((_, dt) => {
    const k = reduced ? 1 : 1 - Math.exp(-dt * (t0.current < 0.6 ? 1.6 : 3)); t0.current += dt;
    if (!idle || focus || t0.current < 3.2) { camera.position.lerp(goal.current.pos, k); target.lerp(goal.current.tgt, k); }
    if (ctl.current) { (ctl.current as unknown as { target: THREE.Vector3 }).target.copy(target); }
  });
  return <OrbitControls ref={ctl} enablePan={false} enableDamping dampingFactor={0.07} minDistance={0.35} maxDistance={6.5} minPolarAngle={0.4} maxPolarAngle={2.3} autoRotate={idle && !focus && !reduced} autoRotateSpeed={0.55} />;
}

function Stage() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}><circleGeometry args={[1.6, 96]} /><meshBasicMaterial color="#06121a" transparent opacity={0.9} /></mesh>
      {[0.55, 0.85, 1.2].map((r, i) => <mesh key={r} rotation-x={-Math.PI / 2} position={[0, 0, 0]}><ringGeometry args={[r, r + 0.006, 128]} /><meshBasicMaterial color="#38C9F4" transparent opacity={0.34 - i * 0.09} /></mesh>)}
    </group>
  );
}

export default function CinematicBody({ hr, reduced, picked, onPick, onHover, focusHeart }: { hr: number; reduced: boolean; picked: Picked | null; onPick: (p: Picked | null) => void; onHover: (p: Picked | null, e?: { x: number; y: number }) => void; focusHeart: boolean }) {
  const [heart, setHeart] = useState<THREE.Vector3 | null>(null);
  const [idle, setIdle] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const bump = () => { setIdle(false); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setIdle(true), 6000); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 32, near: 0.05, far: 40, position: [1.6, 0.45, 5.6] }} gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      onPointerDown={bump} onWheel={bump} onPointerMissed={() => onPick(null)} style={{ background: "#020408", touchAction: "none" }} data-testid="body-canvas">
      <color attach="background" args={["#020408"]} />
      <fog attach="fog" args={["#020408", 6, 14]} />
      <ambientLight intensity={0.35} color="#9fb8d8" />
      <directionalLight position={[2.2, 3.2, 3]} intensity={2.4} color="#fff3e2" />
      <directionalLight position={[-3, 1.8, -2.5]} intensity={2.2} color="#38C9F4" />
      <pointLight position={[0, 1.3, 1.2]} intensity={1.4} color="#ff6b6b" distance={3} />
      <Suspense fallback={null}>
        <Stage />
        <Skin />
        <Circulatory hr={hr} reduced={reduced} onPick={onPick} onHover={onHover} picked={picked?.id ?? null} onHeart={setHeart} />
      </Suspense>
      <Rig reduced={reduced} focus={focusHeart ? heart : null} idle={idle} />
    </Canvas>
  );
}
useGLTF.preload(BODY_MODELS.skin, false, true);
useGLTF.preload(BODY_MODELS.circ, false, true);
