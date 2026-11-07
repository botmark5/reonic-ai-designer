"use client";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { EquipmentKey } from "./equipmentGeometry";
import { slotToWorld, type Mount, type PlaneFrame } from "./houseGeometry";
import { PANEL, type PanelSlot } from "./layout";
import type { Palette } from "./palette";
import type { CompKey } from "./sceneSpec";

const SPEED = 9; // damping λ: ~300 ms to settle
const PANEL_LIFT = 0.14;
const PANEL_STAGGER = 0.025;
const PANEL_STAGGER_MAX = 0.5;

export interface Pointer {
  onOver: (key: CompKey) => void;
  onOut: (key: CompKey) => void;
  onTap: (key: CompKey) => void;
}

function handlers(key: CompKey, p: Pointer) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); p.onOver(key); },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); p.onOut(key); },
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); p.onTap(key); },
  };
}

/**
 * Fades, rises and scales its object in when `visible` turns true, and back out when false.
 * The object stays mounted; it is hidden once fully out. Reduced motion: instant.
 */
export function Appear({ object, mount, visible, reduced, delay = 0, hitKey, pointer }: {
  object: THREE.Object3D; mount: Mount; visible: boolean; reduced: boolean; delay?: number;
  hitKey: CompKey; pointer: Pointer;
}) {
  const ref = useRef<THREE.Group>(null);
  const p = useRef(0);
  const wait = useRef(delay);
  const mats = useRef<{ of: THREE.Object3D; list: THREE.Material[] } | null>(null);

  useEffect(() => { wait.current = visible ? delay : 0; }, [visible, delay]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (mats.current?.of !== object) {
      const list: THREE.Material[] = [];
      object.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) list.push(...(Array.isArray(m) ? m : [m]));
      });
      for (const m of list) m.transparent = true;
      mats.current = { of: object, list };
    }
    const target = visible ? 1 : 0;
    if (reduced) p.current = target;
    else if (wait.current > 0) wait.current -= dt;
    else p.current = THREE.MathUtils.damp(p.current, target, SPEED, Math.min(dt, 0.05));
    if (Math.abs(p.current - target) < 0.002) p.current = target;
    const v = p.current;
    g.visible = v > 0.01;
    g.scale.setScalar(0.8 + 0.2 * v);
    g.position.set(mount.position.x, mount.position.y - (1 - v) * 0.25, mount.position.z);
    for (const m of mats.current.list) m.opacity = v;
  });

  return (
    <group ref={ref} rotation-y={mount.yaw} visible={false} {...(visible ? handlers(hitKey, pointer) : {})}>
      <primitive object={object} />
    </group>
  );
}

function panelTexture(p: Palette): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 100;
  const x = c.getContext("2d")!;
  x.fillStyle = p.panel;
  x.fillRect(0, 0, 64, 100);
  x.strokeStyle = "rgba(170,190,215,0.28)";
  x.lineWidth = 1;
  for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo((i * 64) / 6, 0); x.lineTo((i * 64) / 6, 100); x.stroke(); }
  for (let j = 1; j < 10; j++) { x.beginPath(); x.moveTo(0, j * 10); x.lineTo(64, j * 10); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface PanelState { slot: PanelSlot; p: number; target: 0 | 1; wait: number }

const SCRATCH = {
  m4: new THREE.Matrix4(), basis: new THREE.Matrix4(), scale: new THREE.Vector3(),
  pos: new THREE.Vector3(), q: new THREE.Quaternion(), back: new THREE.Vector3(),
};

/** New slots drop in with a stagger; slots that left fade out; kept slots don't move. */
function syncSlots(map: Map<string, PanelState>, slots: PanelSlot[]) {
  const ids = new Set(slots.map((s) => s.id));
  let fresh = 0;
  for (const s of slots) {
    const st = map.get(s.id);
    if (st) { st.slot = s; if (st.target === 0) { st.target = 1; st.wait = 0; } }
    else map.set(s.id, { slot: s, p: 0, target: 1, wait: Math.min(fresh++ * PANEL_STAGGER, PANEL_STAGGER_MAX) });
  }
  let gone = 0;
  for (const [id, st] of map) if (!ids.has(id) && st.target === 1) { st.target = 0; st.wait = Math.min(gone++ * 0.012, 0.25); }
}

/** All panels as one InstancedMesh (+ one for frames). Only panels that are new or removed animate. */
export function Panels({ slots, frames, palette, reduced, pointer, maxCount = 96 }: {
  slots: PanelSlot[]; frames: Record<PanelSlot["plane"], PlaneFrame>; palette: Palette; reduced: boolean;
  pointer: Pointer; maxCount?: number;
}) {
  const glass = useRef<THREE.InstancedMesh>(null);
  const rim = useRef<THREE.InstancedMesh>(null);
  const states = useRef(new Map<string, PanelState>());

  const { glassGeo, rimGeo, glassMats, rimMat } = useMemo(() => {
    const tex = panelTexture(palette);
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.15 });
    const side = new THREE.MeshStandardMaterial({ color: palette.panel, roughness: 0.5 });
    return {
      glassGeo: new THREE.BoxGeometry(PANEL.w - 0.03, 0.04, PANEL.h - 0.03),
      rimGeo: new THREE.BoxGeometry(PANEL.w, 0.035, PANEL.h),
      glassMats: [side, side, top, side, side, side],
      rimMat: new THREE.MeshStandardMaterial({ color: palette.panelFrame, roughness: 0.4, metalness: 0.5 }),
    };
  }, [palette]);

  useEffect(() => () => {
    glassGeo.dispose(); rimGeo.dispose(); rimMat.dispose();
    for (const m of new Set(glassMats)) { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }
  }, [glassGeo, rimGeo, glassMats, rimMat]);

  const latest = useRef<PanelSlot[]>(slots);
  const synced = useRef<PanelSlot[] | null>(null);
  useEffect(() => { latest.current = slots; }, [slots]);

  useFrame((_, dt) => {
    if (!glass.current || !rim.current) return;
    if (synced.current !== latest.current) {
      syncSlots(states.current, latest.current);
      synced.current = latest.current;
    }
    const { m4, basis, scale, pos, q, back } = SCRATCH;
    let i = 0;
    for (const [id, st] of states.current) {
      if (reduced) st.p = st.target;
      else if (st.wait > 0) st.wait -= dt;
      else st.p = THREE.MathUtils.damp(st.p, st.target, SPEED, Math.min(dt, 0.05));
      if (Math.abs(st.p - st.target) < 0.002) st.p = st.target;
      if (st.target === 0 && st.p === 0) { states.current.delete(id); continue; }
      if (i >= maxCount) continue;
      const f = frames[st.slot.plane];
      const v = st.p;
      pos.copy(slotToWorld(f, st.slot.u, st.slot.v, PANEL_LIFT + (1 - v) * 0.9));
      back.copy(f.vAxis).negate();
      q.setFromRotationMatrix(basis.makeBasis(f.uAxis, f.normal, back));
      scale.setScalar(v < 0.01 ? 0 : 0.6 + 0.4 * v);
      m4.compose(pos, q, scale);
      glass.current.setMatrixAt(i, m4);
      pos.addScaledVector(f.normal, -0.012);
      m4.compose(pos, q, scale);
      rim.current.setMatrixAt(i, m4);
      i++;
    }
    glass.current.count = i;
    rim.current.count = i;
    glass.current.instanceMatrix.needsUpdate = true;
    rim.current.instanceMatrix.needsUpdate = true;
    glass.current.computeBoundingSphere();
    rim.current.computeBoundingSphere();
  });

  return (
    <group {...handlers("pv", pointer)}>
      <instancedMesh ref={glass} args={[glassGeo, glassMats, maxCount]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={rim} args={[rimGeo, rimMat, maxCount]} castShadow frustumCulled={false} />
    </group>
  );
}

export const EQUIPMENT_HIT: Record<EquipmentKey, CompKey> = {
  inverter: "inverter", battery: "battery", wallbox: "wallbox", heatpump: "heatpump", car: "wallbox",
};

