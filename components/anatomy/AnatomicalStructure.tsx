"use client";
import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { colorOf, type StructureDef } from "@/lib/anatomy";

export interface StructureView { selected: boolean; hovered: boolean; highlighted: boolean; dimmed: boolean; hidden: boolean }
interface Props extends StructureView {
  def: StructureDef; geometry: THREE.BufferGeometry; baseOpacity: number; showLabel: boolean;
  onSelect: (id: string) => void; onHover: (id: string | null) => void;
}

/** One separately selectable mesh from the GLB. Highlight, dimming, isolation and transparency are visual states of this mesh only. */
export function AnatomicalStructure({ def, geometry, baseOpacity, selected, hovered, highlighted, dimmed, hidden, showLabel, onSelect, onHover }: Props) {
  const center = useMemo(() => { geometry.computeBoundingBox(); return geometry.boundingBox!.getCenter(new THREE.Vector3()).toArray() as [number, number, number]; }, [geometry]);
  const emphasized = selected || hovered || highlighted;
  const opacity = selected ? 1 : hovered ? Math.max(baseOpacity, 0.9) : highlighted ? Math.max(baseOpacity, 0.85) : dimmed ? baseOpacity * 0.3 : baseOpacity;
  const emissive = selected ? "#ffd166" : highlighted ? "#ffb703" : hovered ? "#ffe8a3" : "#000000";
  const intensity = selected ? 0.55 : highlighted ? 0.35 : hovered ? 0.3 : 0;
  return (
    <mesh geometry={geometry} name={def.id} visible={!hidden} userData={{ structure: def.id }}
      onClick={(e: ThreeEvent<MouseEvent>) => { if (e.delta > 4) return; e.stopPropagation(); onSelect(def.id); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(def.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = ""; }}>
      <meshStandardMaterial color={colorOf(def)} emissive={emissive} emissiveIntensity={intensity} roughness={0.55} metalness={0.05}
        transparent={opacity < 0.999} opacity={opacity} depthWrite={opacity > 0.6} side={THREE.DoubleSide} />
      {(showLabel || selected) && !hidden && (
        <Html position={center} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className={`whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[10px] font-medium shadow-sm ${selected ? "border-[#f59e0b] bg-panel text-ink" : "border-line bg-bg2/90 text-ink2"}`}>{def.label}</span>
        </Html>
      )}
      {emphasized && null}
    </mesh>
  );
}
