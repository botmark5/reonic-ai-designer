"use client";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Palette } from "./palette";
import type { Flow, FlowNode } from "./sceneSpec";

type LineRef = { material: { dashOffset: number; opacity: number } } | null;

/** Arc from a to b, lifted and pushed south (towards the viewer) so it clears walls. */
function arc(a: THREE.Vector3, b: THREE.Vector3, lift: number, south: number): THREE.Vector3[] {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  mid.z += south;
  return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(28);
}

function FlowLine({ points, color, reduced, speed = 0.9, width = 2.4 }: {
  points: THREE.Vector3[]; color: string; reduced: boolean; speed?: number; width?: number;
}) {
  const ref = useRef<LineRef>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const l = ref.current;
    if (!l) return;
    t.current = Math.min(1, t.current + dt * 3);
    l.material.opacity = reduced ? 0.95 : 0.95 * t.current;
    if (!reduced) l.material.dashOffset -= dt * speed;
  });
  return (
    <Line
      ref={ref as never}
      points={points}
      color={color}
      lineWidth={width}
      dashed={!reduced}
      dashSize={0.28}
      gapSize={0.2}
      transparent
      opacity={reduced ? 0.95 : 0}
      depthWrite={false}
      renderOrder={2}
    />
  );
}

export function EnergyFlow({ flows, nodes, sunDir, rayTargets, palette, reduced }: {
  flows: Flow[]; nodes: Partial<Record<FlowNode, THREE.Vector3>>; sunDir: THREE.Vector3;
  /** Points on the panel block that sun rays land on. */
  rayTargets: THREE.Vector3[]; palette: Palette; reduced: boolean;
}) {
  const lines = useMemo(() => {
    const out: { key: string; points: THREE.Vector3[]; color: string; width?: number; speed?: number }[] = [];
    for (const f of flows) {
      const color = palette[f.color];
      if (f.from === "sun") {
        rayTargets.forEach((t, i) =>
          out.push({ key: `${f.id}-${i}`, points: [t.clone().addScaledVector(sunDir, 6), t.clone()], color, width: 1.8, speed: 1.4 }),
        );
        continue;
      }
      const a = nodes[f.from];
      const b = nodes[f.to];
      if (!a || !b) continue;
      const d = a.distanceTo(b);
      out.push({ key: f.id, points: arc(a, b, Math.min(2.5, d * 0.22), Math.min(1.6, d * 0.15)), color });
    }
    return out;
  }, [flows, nodes, sunDir, rayTargets, palette]);

  return (
    <group>
      {lines.map((l) => (
        <FlowLine key={l.key} points={l.points} color={l.color} reduced={reduced} width={l.width} speed={l.speed} />
      ))}
    </group>
  );
}
