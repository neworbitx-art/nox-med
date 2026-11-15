"use client";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { EARTH_POLE, MARS_POLE } from "@/lib/orbits";
import { toScene } from "@/lib/display";

export type BodyId = "earth" | "moon" | "mars";
export interface MsRef { current: number }

const ATMO_VERT = "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }";
const ATMO_FRAG = "varying vec3 vN; varying vec3 vV; uniform vec3 c; uniform float k; void main(){ float x = clamp(-dot(vN, vV) / 0.38, 0.0, 1.0); float f = pow(x, 2.2); gl_FragColor = vec4(c, 1.0) * f * k; }";
function Atmosphere({ r, color, k }: { r: number; color: string; k: number }) {
  const uniforms = useMemo(() => ({ c: { value: new THREE.Color(color) }, k: { value: k } }), [color, k]);
  return <mesh scale={r}><sphereGeometry args={[1, 64, 48]} /><shaderMaterial vertexShader={ATMO_VERT} fragmentShader={ATMO_FRAG} uniforms={uniforms} side={THREE.BackSide} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>;
}
function useAniso(textures: THREE.Texture[]) {
  const gl = useThree((s) => s.gl);
  useEffect(() => { const a = Math.min(8, gl.capabilities.getMaxAnisotropy()); textures.forEach((t) => { t.anisotropy = a; t.needsUpdate = true; }); }, [gl, textures]);
}

/** Greenwich mean sidereal angle (rad) at UTC ms: the Earth's physical rotation phase. */
export const gmstRad = (ms: number) => { const d = ms / 86400000 + 2440587.5 - 2451545.0; return ((((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360) * Math.PI / 180; };
/** Mars prime-meridian angle (IAU 2015: W = 176.630 + 350.89198226 d). */
export const marsSpinRad = (ms: number) => { const d = ms / 86400000 + 2440587.5 - 2451545.0; return ((((176.63 + 350.89198226 * d) % 360) + 360) % 360) * Math.PI / 180; };
const poleQuat = (pole: [number, number, number]) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...toScene(pole)).normalize());

interface BodyProps { radius: number; msRef: MsRef; reduced: boolean; onClick: (id: BodyId) => void; onHover: (id: BodyId | null) => void }
const click = (id: BodyId, f: BodyProps["onClick"]) => (e: { stopPropagation: () => void; delta: number }) => { if (e.delta > 4) return; e.stopPropagation(); f(id); };

/** Earth, oriented by the real pole and spun by sidereal time of the simulation clock. */
export function Earth({ radius, msRef, onClick, onHover }: BodyProps) {
  const [day, bump, spec, clouds] = useTexture(["/textures/earth_day.jpg", "/textures/earth_bump.jpg", "/textures/earth_spec.jpg", "/textures/earth_clouds.webp"]);
  useAniso([day, bump, spec, clouds]);
  const q = useMemo(() => poleQuat(EARTH_POLE), []);
  const spin = useRef<THREE.Group>(null), cl = useRef<THREE.Mesh>(null);
  useFrame(() => { const a = gmstRad(msRef.current); if (spin.current) spin.current.rotation.y = a; if (cl.current) cl.current.rotation.y = a * 0.004; });
  return (
    <group quaternion={q} onClick={click("earth", onClick)} onPointerOver={(e) => { e.stopPropagation(); onHover("earth"); }} onPointerOut={() => onHover(null)}>
      <group ref={spin}>
        <mesh><sphereGeometry args={[radius, 128, 96]} /><meshPhongMaterial map={day} bumpMap={bump} bumpScale={0.9} specularMap={spec} specular={new THREE.Color("#1c2630")} shininess={14} /></mesh>
        <mesh ref={cl}><sphereGeometry args={[radius * 1.011, 96, 72]} /><meshStandardMaterial map={clouds} transparent opacity={0.85} depthWrite={false} roughness={1} /></mesh>
      </group>
      <Atmosphere r={radius * 1.065} color="#5aa9ff" k={0.9} />
    </group>
  );
}

/** Moon, tidally locked: the +X (near-side) meridian faces `faceRef` (a point in the same parent space, normally the Earth). */
export function Moon({ radius, faceTo, onClick, onHover }: Omit<BodyProps, "msRef" | "reduced"> & { faceTo: MutableRefObject<THREE.Vector3> | null }) {
  const [map] = useTexture(["/textures/moon_color.jpg"]);
  useAniso([map]);
  const g = useRef<THREE.Group>(null), tmp = useMemo(() => new THREE.Vector3(), []), wp = useMemo(() => new THREE.Vector3(), []), ex = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  useFrame(() => { if (!g.current || !faceTo) return; g.current.getWorldPosition(wp); tmp.copy(faceTo.current).sub(wp).normalize(); g.current.quaternion.setFromUnitVectors(ex, tmp); });
  return (
    <group onClick={click("moon", onClick)} onPointerOver={(e) => { e.stopPropagation(); onHover("moon"); }} onPointerOut={() => onHover(null)}>
      <group ref={g}><mesh><sphereGeometry args={[radius, 96, 64]} /><meshStandardMaterial map={map} bumpMap={map} bumpScale={0.6} roughness={1} metalness={0} /></mesh></group>
    </group>
  );
}

export function Mars({ radius, msRef, onClick, onHover }: BodyProps) {
  const [map] = useTexture(["/textures/mars_color.jpg"]);
  useAniso([map]);
  const q = useMemo(() => poleQuat(MARS_POLE), []);
  const spin = useRef<THREE.Group>(null);
  useFrame(() => { if (spin.current) spin.current.rotation.y = marsSpinRad(msRef.current); });
  return (
    <group quaternion={q} onClick={click("mars", onClick)} onPointerOver={(e) => { e.stopPropagation(); onHover("mars"); }} onPointerOut={() => onHover(null)}>
      <group ref={spin}><mesh><sphereGeometry args={[radius, 96, 64]} /><meshStandardMaterial map={map} bumpMap={map} bumpScale={0.5} roughness={0.95} metalness={0} /></mesh></group>
      <Atmosphere r={radius * 1.045} color="#e0894f" k={0.7} />
    </group>
  );
}

let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.95)"); grd.addColorStop(0.2, "rgba(255,255,255,0.4)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); return glowTex;
}
/** The Sun: emissive disc with a soft corona. Radius is exaggerated for visibility (documented). */
export function Sun({ radius }: { radius: number }) {
  return (
    <group>
      <mesh><sphereGeometry args={[radius, 48, 32]} /><meshBasicMaterial color="#ffd98a" toneMapped={false} /></mesh>
      <sprite scale={[radius * 7, radius * 7, 1]}><spriteMaterial map={glowTexture()} color="#ffb347" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></sprite>
    </group>
  );
}

/** Hipparcos star map (NASA) plus a sparse extra star layer for depth. */
export function Starfield() {
  const [map] = useTexture(["/textures/stars.jpg"]);
  const pts = useMemo(() => {
    const n = 2200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), d = 300;
      pos.set([d * r * Math.cos(a), d * u, d * r * Math.sin(a)], i * 3);
      const b = 0.35 + rnd() ** 3 * 0.65, tint = rnd();
      col.set([b * (0.8 + 0.2 * tint), b * 0.9, b * (1 - 0.2 * tint)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g;
  }, []);
  useEffect(() => () => pts.dispose(), [pts]);
  return (
    <group>
      <mesh scale={-1}><sphereGeometry args={[320, 48, 32]} /><meshBasicMaterial map={map} color={new THREE.Color(0.7, 0.7, 0.8)} toneMapped={false} depthWrite={false} /></mesh>
      <points geometry={pts}><pointsMaterial vertexColors size={1.4} sizeAttenuation={false} transparent opacity={0.75} depthWrite={false} toneMapped={false} /></points>
    </group>
  );
}
