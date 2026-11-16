"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type Variant = "transit" | "cislunar" | "station" | "relay";
/** Vehicle look by route: Mars missions use a stainless transit vehicle, Earth/lunar missions a crew capsule + service module (generic procedural models; no real markings or affiliation). */
const VARIANT: Record<string, Variant> = { "earth-mars-transfer": "transit", "lunar-transfer": "cislunar", "earth-orbit": "station", "mars-orbit": "relay" };
export const variantFor = (routeKind: string): Variant => VARIANT[routeKind] ?? "transit";

let glowTex: THREE.CanvasTexture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(0.25, "rgba(255,255,255,0.35)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); return glowTex;
}

const hull = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 0.45, roughness: 0.38 });
const hullDark = new THREE.MeshStandardMaterial({ color: "#6b7482", metalness: 0.6, roughness: 0.42 });
const gold = new THREE.MeshStandardMaterial({ color: "#b8893a", metalness: 0.7, roughness: 0.35 });
const cell = new THREE.MeshStandardMaterial({ color: "#16274a", metalness: 0.75, roughness: 0.25, emissive: "#0b1c3d", emissiveIntensity: 0.6 });
const frame = new THREE.MeshStandardMaterial({ color: "#9aa3b0", metalness: 0.6, roughness: 0.4 });

/** Solar array wing: boom + N panels. Built along +Y from the origin. */
function Wing({ panels = 3, w = 0.34, h = 0.15 }: { panels?: number; w?: number; h?: number }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]} material={frame}><cylinderGeometry args={[0.008, 0.008, 0.12, 8]} /></mesh>
      {Array.from({ length: panels }, (_, i) => (
        <group key={i} position={[0, 0.12 + i * (h + 0.012) + h / 2, 0]}>
          <mesh material={cell}><boxGeometry args={[w, h, 0.006]} /></mesh>
          <mesh position={[0, 0, 0.004]} material={frame}><boxGeometry args={[w + 0.01, 0.006, 0.004]} /></mesh>
          <mesh position={[0, 0, 0.004]} material={frame}><boxGeometry args={[0.006, h, 0.004]} /></mesh>
        </group>
      ))}
    </group>
  );
}

const steel = new THREE.MeshStandardMaterial({ color: "#9aa1aa", metalness: 0.7, roughness: 0.42 });
const flapMat = new THREE.MeshStandardMaterial({ color: "#7d848d", metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
const tile = new THREE.MeshStandardMaterial({ color: "#15181d", metalness: 0.3, roughness: 0.75, side: THREE.DoubleSide });
const white = new THREE.MeshStandardMaterial({ color: "#e9edf2", metalness: 0.35, roughness: 0.4 });
const foil = new THREE.MeshStandardMaterial({ color: "#c79a4a", metalness: 0.75, roughness: 0.38 });

const flapShape = (L: number, H: number, sweep: number) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L * 0.82 - sweep, H); sh.lineTo(L * 0.12, H * 0.78); sh.closePath(); return sh; };
const mkFlap = (L: number, H: number, sw: number, d: number) => new THREE.ExtrudeGeometry(flapShape(L, H, sw), { depth: d, bevelEnabled: false });
const fwdFlap = mkFlap(0.07, 0.06, 0.012, 0.004), aftFlap = mkFlap(0.13, 0.095, 0.02, 0.004);
const fwdFlapEdge = mkFlap(0.07, 0.016, 0.0, 0.002), aftFlapEdge = mkFlap(0.13, 0.022, 0.0, 0.002);
/** Transit vehicle: stainless cylinder, ogive nose, dark belly heat shield, two fore and two aft flaps, engine skirt. Long axis +X. */
function TransitVessel() {
  const R = 0.085;
  const nose = useMemo(() => { const pts: THREE.Vector2[] = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector2(R * Math.pow(1 - t * t, 0.62), t * 0.3)); } return new THREE.LatheGeometry(pts, 40); }, []);
  useMemo(() => () => nose.dispose(), [nose]);
  return (
    <group>
      <mesh position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}><cylinderGeometry args={[R, R, 0.56, 40]} /></mesh>
      <mesh position={[0.22, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={steel} geometry={nose} />
      <mesh position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={tile}><cylinderGeometry args={[R * 1.012, R * 1.012, 0.56, 32, 1, true, -Math.PI, Math.PI]} /></mesh>
      <mesh position={[0.24, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={tile}><sphereGeometry args={[R * 0.985, 24, 12, 0, Math.PI * 2, 0, 0.55]} /></mesh>
      {[0.1, 0.2, 0.3, 0.4, 0.5].map((x) => <mesh key={x} position={[-0.34 + x, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hullDark}><torusGeometry args={[R * 1.004, 0.0012, 6, 40]} /></mesh>)}
      {[1, -1].map((k) => (
        <group key={k}>
          <mesh position={[0.15, k * R * 0.96, 0]} scale={[1, k, 1]} material={flapMat} geometry={fwdFlap} />
          <mesh position={[-0.3, k * R * 0.96, 0]} scale={[1, k, 1]} material={flapMat} geometry={aftFlap} />
          <mesh position={[0.15, k * R * 0.96, 0.0035]} scale={[1, k, 1]} material={tile} geometry={fwdFlapEdge} />
          <mesh position={[-0.3, k * R * 0.96, 0.0035]} scale={[1, k, 1]} material={tile} geometry={aftFlapEdge} />
        </group>
      ))}
      <mesh position={[-0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={tile}><cylinderGeometry args={[R * 0.97, R * 0.92, 0.04, 32]} /></mesh>
      {[[0, 0], [0.032, 0.02], [-0.032, 0.02], [0.016, -0.03], [-0.016, -0.03]].map(([y, z], i) => <mesh key={i} position={[-0.385, y, z]} rotation={[0, 0, Math.PI / 2]} material={hullDark}><coneGeometry args={[0.016, 0.035, 12, 1, true]} /></mesh>)}
    </group>
  );
}

/** Crew capsule: conical crew module with heat shield, service module with gold-foil band, engine bell and four X-configured solar array wings. Long axis +X. */
function CrewCapsule() {
  return (
    <group scale={1.55}>
      <mesh position={[0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={white}><cylinderGeometry args={[0.04, 0.1, 0.15, 40]} /></mesh>
      <mesh position={[0.282, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={hullDark}><cylinderGeometry args={[0.03, 0.036, 0.012, 24]} /></mesh>
      <mesh position={[0.122, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={tile}><cylinderGeometry args={[0.1, 0.106, 0.016, 40]} /></mesh>
      <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={frame}><cylinderGeometry args={[0.104, 0.104, 0.024, 32]} /></mesh>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={white}><cylinderGeometry args={[0.098, 0.098, 0.2, 40]} /></mesh>
      <mesh position={[0.045, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={foil}><cylinderGeometry args={[0.1, 0.1, 0.05, 40, 1, true]} /></mesh>
      <mesh position={[-0.145, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hullDark}><coneGeometry args={[0.042, 0.075, 24, 1, true]} /></mesh>
      {[45, 135, 225, 315].map((a) => (<group key={a} rotation={[(a * Math.PI) / 180, 0, 0]} position={[-0.03, 0, 0]}><Wing panels={3} w={0.1} h={0.08} /></group>))}
    </group>
  );
}

/** Model at the parent's origin. The parent group positions, orients (long axis = +X) and scales it. */
function Body({ variant }: { variant: Variant }) { return variant === "transit" || variant === "relay" ? <TransitVessel /> : <CrewCapsule />; }

export interface SpacecraftProps { variant: Variant; emphasis: "active" | "selected" | "idle" | "dim"; accent: string; reduced: boolean }

/** Model at the parent's origin. The parent group positions, orients (long axis = +X) and scales it. */
export function Spacecraft({ variant, emphasis, accent, reduced }: SpacecraftProps) {
  const glow = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.Mesh>(null);
  const hot = emphasis === "active" || emphasis === "selected";
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (glow.current && !reduced) { const s = 2.2 * (1 + 0.06 * Math.sin(t * 1.6)); glow.current.scale.set(s, s, 1); }
    if (light.current && !reduced) (light.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * (Math.sin(t * 2.4) > 0.6 ? 1 : 0.15);
  });
  return (
    <group>
      <Body variant={variant} />
      <mesh ref={light} position={[0.0, 0.14, 0.0]}><sphereGeometry args={[0.012, 8, 8]} /><meshBasicMaterial color={hot ? "#38C9F4" : "#A3E635"} transparent opacity={0.8} toneMapped={false} /></mesh>
      {hot && (
        <sprite ref={glow} scale={[2.2, 2.2, 1]}>
          <spriteMaterial map={glowTexture()} color={accent} transparent opacity={emphasis === "active" ? 0.32 : 0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></sprite>
      )}
    </group>
  );
}
