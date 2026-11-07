"use client";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type Preset = "street" | "roof" | "garage";
export const PRESETS: readonly Preset[] = ["street", "roof", "garage"];

/** A preset request; `n` changes on every click so re-clicking the active preset resets the view. */
export interface PresetRequest {
  preset: Preset;
  n: number;
}

/** Camera position and target in house coordinates (+z south, +x east / garage side). */
const VIEWS: Record<Preset, { pos: [number, number, number]; target: [number, number, number] }> = {
  street: { pos: [20, 12, 31], target: [2.5, 1.5, 3.5] },
  roof: { pos: [3, 21, 24], target: [2, 5, 0.5] },
  garage: { pos: [22, 5.5, 17], target: [8.5, 1.4, 4] },
};
/** Where the fly-in starts: high and wide, the model seen as a whole on its board. */
const FLY_FROM = { pos: [38, 30, 52] as const, target: [1, 0, 2] as const };
const FLY_SMOOTH = 0.42; // camera-controls smoothTime during the fly-in (arrives in ≈ 1.6 s)
const SMOOTH = 0.32;

const { DOLLY, NONE } = CameraControlsImpl.ACTION;

/**
 * Page scroll wins: vertical swipes scroll the page (horizontal ones orbit) and the wheel zooms only with Ctrl/⌘
 * (trackpad pinch sends ctrl+wheel). camera-controls sets touch-action: none on the element it connects to
 * (drei connects it in its own child effect), so this re-applies it once that element exists.
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

function look(c: CameraControlsImpl, v: { pos: readonly number[]; target: readonly number[] }, rot: THREE.Matrix4, animate: boolean) {
  const p = new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]).applyMatrix4(rot);
  const t = new THREE.Vector3(v.target[0], v.target[1], v.target[2]).applyMatrix4(rot);
  return c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, animate);
}

export function CameraRig({ request, rotationY, reduced, flyIn }: {
  request: PresetRequest; rotationY: number; reduced: boolean; flyIn: boolean;
}) {
  const ref = useRef<CameraControls>(null);
  const first = useRef(true);
  const flying = useRef(false);
  const reducedRef = useRef(reduced);
  const scrollSetup = useRef<{ el: HTMLElement | null; undo: () => void }>({ el: null, undo: () => {} });

  useEffect(() => { reducedRef.current = reduced; }, [reduced]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const rot = new THREE.Matrix4().makeRotationY(rotationY);
    if (first.current && flyIn && !reducedRef.current) {
      // fly-in: start high and wide, glide to the street view; any input or key skips it
      void look(c, FLY_FROM, rot, false);
      c.smoothTime = FLY_SMOOTH;
      flying.current = true;
      void look(c, VIEWS.street, rot, true).then(() => { flying.current = false; c.smoothTime = SMOOTH; });
    } else {
      flying.current = false;
      c.smoothTime = SMOOTH;
      void look(c, VIEWS[request.preset], rot, !reducedRef.current && !first.current);
    }
    first.current = false;
  }, [request, rotationY, flyIn]);

  // skip the fly-in on any key; a drag or pinch takes over the camera by itself
  useEffect(() => {
    const skip = () => {
      const c = ref.current;
      if (!c || !flying.current) return;
      flying.current = false;
      c.smoothTime = SMOOTH;
      void look(c, VIEWS.street, new THREE.Matrix4().makeRotationY(rotationY), false);
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [rotationY]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const stopFlying = () => { if (flying.current) { flying.current = false; c.smoothTime = SMOOTH; } };
    c.addEventListener("controlstart", stopFlying);
    const scroll = scrollSetup.current;
    return () => {
      scroll.undo();
      c.removeEventListener("controlstart", stopFlying);
    };
  }, []);

  useFrame(() => {
    const c = ref.current;
    if (c) letPageScroll(c, scrollSetup.current); // cheap; camera-controls (re)connects after our effects
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={12}
      maxDistance={60}
      minPolarAngle={0.25}
      maxPolarAngle={1.36}
      truckSpeed={0}
      smoothTime={SMOOTH}
      draggingSmoothTime={0.12}
    />
  );
}
