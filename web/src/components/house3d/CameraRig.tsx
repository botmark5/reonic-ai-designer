"use client";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type Preset = "overview" | "roof" | "garage";
export const PRESETS: readonly Preset[] = ["overview", "roof", "garage"];

/** A preset request; `n` changes on every click so re-clicking the active preset resets the view. */
export interface PresetRequest {
  preset: Preset;
  n: number;
}

/** Camera position and target in house coordinates (+z south, +x east / garage side). */
const VIEWS: Record<Preset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [20, 12.5, 28], target: [2, 2.6, 1.5] },
  roof: { pos: [2, 22, 25], target: [2.5, 4.8, 0.5] },
  garage: { pos: [21, 6, 15], target: [8.5, 1.6, 3] },
};

const IDLE_AFTER = 4; // seconds without input before the slow turn starts
const IDLE_SPEED = 0.06; // rad/s
const { DOLLY, NONE } = CameraControlsImpl.ACTION;

/**
 * Page scroll wins: vertical swipes scroll the page (horizontal ones orbit) and the wheel zooms only with Ctrl/⌘
 * (trackpad pinch sends ctrl+wheel). camera-controls sets touch-action: none on the element it connects to
 * (drei connects it in its own, earlier, child effect).
 */
function letPageScroll(c: CameraControlsImpl, done: { el: HTMLElement | null; undo: () => void }) {
  const el = (c as unknown as { _domElement?: HTMLElement })._domElement ?? null;
  if (el && el.style.touchAction !== "pan-y") el.style.touchAction = "pan-y";
  if (el === done.el) return;
  done.undo();
  done.el = el;
  done.undo = () => {};
  if (!el) return;
  const onWheel = (e: WheelEvent) => { c.mouseButtons.wheel = e.ctrlKey || e.metaKey ? DOLLY : NONE; };
  el.addEventListener("wheel", onWheel, { capture: true, passive: true });
  done.undo = () => el.removeEventListener("wheel", onWheel, { capture: true });
}

export function CameraRig({ request, rotationY, reduced }: { request: PresetRequest; rotationY: number; reduced: boolean }) {
  const ref = useRef<CameraControls>(null);
  const lastInput = useRef(0);
  const clock = useRef(0);
  const first = useRef(true);
  const reducedRef = useRef(reduced);
  const scrollSetup = useRef<{ el: HTMLElement | null; undo: () => void }>({ el: null, undo: () => {} });

  useEffect(() => { reducedRef.current = reduced; }, [reduced]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const rot = new THREE.Matrix4().makeRotationY(rotationY);
    const p = new THREE.Vector3(...VIEWS[request.preset].pos).applyMatrix4(rot);
    const t = new THREE.Vector3(...VIEWS[request.preset].target).applyMatrix4(rot);
    void c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !reducedRef.current && !first.current);
    first.current = false;
    lastInput.current = clock.current;
  }, [request, rotationY]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const mark = () => { lastInput.current = clock.current; };
    c.addEventListener("controlstart", mark);
    c.addEventListener("control", mark);
    const scroll = scrollSetup.current;
    return () => {
      scroll.undo();
      c.removeEventListener("controlstart", mark);
      c.removeEventListener("control", mark);
    };
  }, []);

  useFrame((_, dt) => {
    clock.current += dt;
    const c = ref.current;
    if (!c) return;
    letPageScroll(c, scrollSetup.current); // cheap; camera-controls (re)connects after our effects
    if (reduced) return;
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
