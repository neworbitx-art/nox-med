"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { checkpointPosition, checkpointStatus, routeCurve, type MissionRecord, type RouteKind } from "@/lib/missions";

export const ROUTE_COLOR: Record<RouteKind, string> = { "earth-orbit": "#38bdf8", lunar: "#c4b5fd", "mars-transfer": "#fbbf24", "mars-orbit": "#fb7185" };

export function Route({ m, level, reduced }: { m: MissionRecord; level: "selected" | "idle" | "dim"; reduced: boolean }) {
  const curve = useMemo(() => routeCurve(m.route), [m.route]);
  const color = ROUTE_COLOR[m.route.kind];
  const { done, rest, loop } = useMemo(() => {
    const mk = (a: number, b: number, n: number) => { const v: THREE.Vector3[] = []; for (let i = 0; i <= n; i++) v.push(curve.getPointAt(a + ((b - a) * i) / n)); return new THREE.BufferGeometry().setFromPoints(v); };
    if (m.route.closed) return { done: null, rest: null, loop: mk(0, 0.9999, 220) };
    const p = Math.min(0.999, Math.max(0.001, m.vehicle.progress));
    const rg = mk(p, 1, 160);
    return { done: mk(0, p, 100), rest: rg, loop: null };
  }, [curve, m.route.closed, m.vehicle.progress]);
  useEffect(() => () => { done?.dispose(); rest?.dispose(); loop?.dispose(); }, [done, rest, loop]);
  const op = level === "selected" ? 1 : level === "idle" ? 0.55 : 0.2;

  // flowing light particles
  const N = 9;
  const pg = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); return g; }, []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const phase = useRef(0);
  const place = (ph: number) => {
    const a = pg.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const u = (i / N + ph) % 1;
      const t = m.route.closed ? u : u * (1 - 0.02) + 0.01;
      curve.getPointAt(t, tmp); a.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    a.needsUpdate = true;
  };
  useEffect(() => { place(0.12); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [curve]);
  useFrame((_, dt) => { if (reduced) return; phase.current = (phase.current + dt * (level === "selected" ? 0.05 : 0.03)) % 1; place(phase.current); });
  useEffect(() => () => pg.dispose(), [pg]);

  return (
    <group>
      {loop && <line><primitive object={loop} attach="geometry" /><lineBasicMaterial color={color} transparent opacity={op} toneMapped={false} /></line>}
      {done && <line><primitive object={done} attach="geometry" /><lineBasicMaterial color={color} transparent opacity={op} toneMapped={false} /></line>}
      {rest && <lineSegments geometry={dashed(rest)}><lineBasicMaterial color={color} transparent opacity={op * 0.55} toneMapped={false} /></lineSegments>}
      <points geometry={pg}><pointsMaterial color={color} size={level === "selected" ? 4 : 3} sizeAttenuation={false} transparent opacity={level === "dim" ? 0.25 : 0.95} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
    </group>
  );
}

/** Dash a polyline by keeping every other short segment. */
function dashed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute("position"); const out: number[] = [];
  for (let i = 0; i + 1 < p.count; i += 2) out.push(p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
}

export interface HoverInfo { kind: "ship" | "checkpoint" | "body"; missionId?: string; cpId?: string; bodyId?: string; x: number; y: number }

export function Checkpoints({ m, selected, picked, reduced, onHover, onPick }: {
  m: MissionRecord; selected: boolean; picked: string | null; reduced: boolean;
  onHover: (h: HoverInfo | null) => void; onPick: (cpId: string) => void;
}) {
  const color = ROUTE_COLOR[m.route.kind];
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (reduced) return;
    refs.current.forEach((r, i) => { if (!r) return; const s = 1 + 0.28 * Math.sin(clock.elapsedTime * 1.7 + i * 1.3); r.scale.setScalar(s); });
  });
  return (
    <group>
      {m.checkpoints.map((c, i) => {
        const pos = checkpointPosition(m, c), done = checkpointStatus(m, c) === "Completed", on = picked === c.id;
        return (
          <group key={c.id} position={pos}>
            <mesh ref={(el) => { refs.current[i] = el; }}>
              <sphereGeometry args={[on ? 0.085 : 0.055, 16, 12]} />
              <meshBasicMaterial color={done ? color : "#ffffff"} transparent opacity={selected ? 1 : 0.6} toneMapped={false} />
            </mesh>
            <mesh onClick={(e) => { e.stopPropagation(); onPick(c.id); }}
              onPointerOver={(e) => { e.stopPropagation(); onHover({ kind: "checkpoint", missionId: m.id, cpId: c.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
              onPointerMove={(e) => onHover({ kind: "checkpoint", missionId: m.id, cpId: c.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })}
              onPointerOut={() => onHover(null)}>
              <sphereGeometry args={[0.16, 8, 6]} /><meshBasicMaterial visible={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
