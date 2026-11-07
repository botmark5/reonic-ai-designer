"use client";
import { CameraControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type Preset = "overview" | "roof" | "garage";
export const PRESETS: readonly Preset[] = ["overview", "roof", "garage"];

/** Camera position and target in house coordinates (+z south, +x east / garage side). */
const VIEWS: Record<Preset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [20, 12.5, 28], target: [2, 2.6, 1.5] },
  roof: { pos: [2, 22, 25], target: [2.5, 4.8, 0.5] },
  garage: { pos: [21, 6, 15], target: [8.5, 1.6, 3] },
};

const IDLE_AFTER = 4; // seconds without input before the slow turn starts
const IDLE_SPEED = 0.06; // rad/s

export function CameraRig({ preset, rotationY, reduced }: { preset: Preset; rotationY: number; reduced: boolean }) {
  const ref = useRef<CameraControls>(null);
  const lastInput = useRef(0);
  const clock = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const rot = new THREE.Matrix4().makeRotationY(rotationY);
    const p = new THREE.Vector3(...VIEWS[preset].pos).applyMatrix4(rot);
    const t = new THREE.Vector3(...VIEWS[preset].target).applyMatrix4(rot);
    void c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !reduced && !first.current);
    first.current = false;
    lastInput.current = clock.current;
  }, [preset, rotationY, reduced]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const mark = () => { lastInput.current = clock.current; };
    c.addEventListener("controlstart", mark);
    c.addEventListener("control", mark);
    return () => {
      c.removeEventListener("controlstart", mark);
      c.removeEventListener("control", mark);
    };
  }, []);

  useFrame((_, dt) => {
    clock.current += dt;
    const c = ref.current;
    if (!c || reduced) return;
    if (clock.current - lastInput.current > IDLE_AFTER) void c.rotate(dt * IDLE_SPEED, 0, false);
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={11}
      maxDistance={46}
      minPolarAngle={0.3}
      maxPolarAngle={1.38}
      truckSpeed={0}
      smoothTime={0.35}
      draggingSmoothTime={0.12}
    />
  );
}
