"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type Variant = "transit" | "cislunar" | "station" | "relay";
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

function Dish({ r = 0.08 }: { r?: number }) {
  return (
    <group>
      <mesh rotation={[Math.PI, 0, 0]} material={hull}><coneGeometry args={[r, r * 0.35, 28, 1, true]} /></mesh>
      <mesh position={[0, -0.04, 0]} material={hullDark}><cylinderGeometry args={[0.006, 0.006, 0.08, 6]} /></mesh>
    </group>
  );
}

/** Credible simplified fictional vehicles (modules + solar arrays). Not a representation of any real or NASA vehicle. Long axis = +X. */
function Body({ variant }: { variant: Variant }) {
  if (variant === "transit") return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]} material={hull}><cylinderGeometry args={[0.11, 0.11, 0.55, 32]} /></mesh>
      <mesh position={[0.34, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={hullDark}><coneGeometry args={[0.11, 0.13, 32]} /></mesh>
      <mesh position={[-0.31, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={gold}><cylinderGeometry args={[0.14, 0.14, 0.05, 32]} /></mesh>
      <mesh position={[-0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hullDark}><cylinderGeometry args={[0.07, 0.07, 0.17, 24]} /></mesh>
      <mesh position={[-0.52, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={hullDark}><coneGeometry args={[0.06, 0.1, 20, 1, true]} /></mesh>
      <mesh position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={frame}><torusGeometry args={[0.118, 0.01, 8, 32]} /></mesh>
      <group position={[-0.05, 0, 0]}><group position={[0, 0.11, 0]}><Wing panels={4} w={0.3} h={0.16} /></group><group position={[0, -0.11, 0]} rotation={[0, 0, Math.PI]}><Wing panels={4} w={0.3} h={0.16} /></group></group>
      <group position={[0.18, 0.1, 0.07]} rotation={[0.6, 0, 0.4]}><Dish r={0.07} /></group>
    </group>
  );
  if (variant === "cislunar") return (
    <group>
      <mesh position={[0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={hull}><coneGeometry args={[0.12, 0.2, 32]} /></mesh>
      <mesh position={[0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hullDark}><cylinderGeometry args={[0.12, 0.12, 0.03, 32]} /></mesh>
      <mesh position={[-0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hull}><cylinderGeometry args={[0.12, 0.12, 0.32, 32]} /></mesh>
      <mesh position={[-0.32, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={gold}><coneGeometry args={[0.06, 0.1, 20, 1, true]} /></mesh>
      <group position={[-0.1, 0, 0]}><group position={[0, 0.12, 0]}><Wing panels={3} w={0.26} h={0.15} /></group><group position={[0, -0.12, 0]} rotation={[0, 0, Math.PI]}><Wing panels={3} w={0.26} h={0.15} /></group></group>
      <group position={[0.0, 0.0, 0.12]} rotation={[Math.PI / 2, 0, 0]}><Dish r={0.06} /></group>
    </group>
  );
  if (variant === "station") return (
    <group>
      <mesh material={frame}><boxGeometry args={[0.95, 0.02, 0.02]} /></mesh>
      <mesh position={[-0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hull}><cylinderGeometry args={[0.07, 0.07, 0.3, 24]} /></mesh>
      <mesh position={[0.14, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hull}><cylinderGeometry args={[0.065, 0.065, 0.26, 24]} /></mesh>
      <mesh position={[0.02, 0.09, 0]} material={hullDark}><sphereGeometry args={[0.055, 20, 14]} /></mesh>
      <mesh position={[0.02, -0.09, 0]} material={hullDark}><sphereGeometry args={[0.055, 20, 14]} /></mesh>
      {[-0.4, -0.22, 0.22, 0.4].map((x) => (
        <group key={x} position={[x, 0, 0]}><group position={[0, 0.0, 0]}><Wing panels={2} w={0.14} h={0.2} /></group><group rotation={[0, 0, Math.PI]}><Wing panels={2} w={0.14} h={0.2} /></group></group>
      ))}
      <mesh position={[0, 0, 0.1]} material={hull}><boxGeometry args={[0.2, 0.012, 0.1]} /></mesh>
    </group>
  );
  return (
    <group>
      <mesh material={hull}><boxGeometry args={[0.28, 0.16, 0.16]} /></mesh>
      <mesh position={[0.17, 0, 0]} material={gold}><boxGeometry args={[0.06, 0.15, 0.15]} /></mesh>
      <group position={[0, 0, 0]}><group position={[0, 0.08, 0]}><Wing panels={3} w={0.22} h={0.17} /></group><group position={[0, -0.08, 0]} rotation={[0, 0, Math.PI]}><Wing panels={3} w={0.22} h={0.17} /></group></group>
      <group position={[0.05, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}><Dish r={0.13} /></group>
      <mesh position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={hullDark}><cylinderGeometry args={[0.03, 0.05, 0.1, 16]} /></mesh>
    </group>
  );
}

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
