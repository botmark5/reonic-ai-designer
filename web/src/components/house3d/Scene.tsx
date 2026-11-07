"use client";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, type RootState } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CameraRig, type Preset } from "./CameraRig";
import { EnergyFlow } from "./EnergyFlow";
import { Appear, EQUIPMENT_HIT, Panels, type Pointer } from "./Equipment";
import { buildEquipment, type EquipmentKey } from "./equipmentGeometry";
import { buildHouse, slotToWorld, type Mount } from "./houseGeometry";
import type { Palette } from "./palette";
import type { CompKey, FlowNode, SceneSpec } from "./sceneSpec";
import { Tooltip } from "./Tooltip";

export interface SceneProps {
  spec: SceneSpec;
  palette: Palette;
  reduced: boolean;
  preset: Preset;
  active: CompKey | null;
  pointer: Pointer;
  onMiss: () => void;
  onReady: (state: RootState) => void;
}

const SUN_DIR = new THREE.Vector3(-0.42, 0.72, 0.55).normalize(); // south-west, high: soft shadows to the north-east

function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

const facing = (m: Mount) => new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));

function World({ spec, palette, reduced, preset, active, pointer }: Omit<SceneProps, "onMiss" | "onReady">) {
  const rotationY = THREE.MathUtils.degToRad(180 - spec.roof.azimuthDeg);
  const house = useMemo(() => buildHouse(spec.roof.pitchDeg, palette), [spec.roof.pitchDeg, palette]);
  const equipment = useMemo(() => buildEquipment(palette), [palette]);
  useEffect(() => () => dispose(house.group), [house]);
  useEffect(() => () => Object.values(equipment).forEach(dispose), [equipment]);

  const { anchors, frames } = house;
  const c = spec.components;
  const visible: Record<EquipmentKey, boolean> = {
    inverter: c.inverter.visible, battery: c.battery.visible, wallbox: c.wallbox.visible,
    heatpump: c.heatpump.visible, car: c.wallbox.visible,
  };

  // Points in house coordinates for flows and tooltips
  const { nodes, rays, labels } = useMemo(() => {
    const main = spec.layout.slots.filter((s) => s.plane === "main");
    const centre = main.length
      ? main.reduce((acc, s) => acc.add(slotToWorld(frames.main, s.u, s.v, 0.3)), new THREE.Vector3()).divideScalar(main.length)
      : slotToWorld(frames.main, 0, frames.main.plane.slope / 2, 0.3);
    const us = main.map((s) => s.u);
    const vMid = main.length ? main.reduce((a, s) => a + s.v, 0) / main.length : 0;
    const rays = main.length
      ? [Math.min(...us) * 0.7, 0, Math.max(...us) * 0.7].map((u) => slotToWorld(frames.main, u, vMid, 0.25))
      : [];
    const at = (m: Mount, up: number, out: number) => m.position.clone().addScaledVector(facing(m), out).add(new THREE.Vector3(0, up, 0));
    const nodes: Partial<Record<FlowNode, THREE.Vector3>> = {
      panels: centre,
      inverter: at(anchors.inverter, 0.3, 0.25),
      battery: at(anchors.battery, 0.8, 0.35),
      house: anchors.house.clone().add(new THREE.Vector3(0, 0, 0.2)),
      wallbox: at(anchors.wallbox, 0.2, 0.2),
      car: at(anchors.car, 0.95, -1.6),
      heatpump: at(anchors.heatpump, 0.9, 0.35),
    };
    const labels: Record<CompKey, THREE.Vector3> = {
      pv: centre.clone().addScaledVector(frames.main.normal, 1.2),
      inverter: at(anchors.inverter, 1.0, 0.3),
      battery: at(anchors.battery, 1.7, 0.3),
      wallbox: at(anchors.wallbox, 0.8, 0.3),
      heatpump: at(anchors.heatpump, 1.4, 0.3),
    };
    return { nodes, rays, labels };
  }, [spec.layout.slots, frames, anchors]);

  // The sun stays south in the world; express its direction in house coordinates.
  const sunLocal = useMemo(() => SUN_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -rotationY), [rotationY]);
  const activeSpec = active ? c[active] : null;

  return (
    <>
      <color attach="background" args={[palette.surface0]} />
      <fog attach="fog" args={[palette.surface0, 42, 120]} />
      <hemisphereLight args={[palette.surface1, palette.ground, 1.1]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={SUN_DIR.clone().multiplyScalar(40).toArray()}
        intensity={2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <group rotation-y={rotationY}>
        <primitive object={house.group} />
        <Panels slots={spec.layout.slots} frames={frames} palette={palette} reduced={reduced} pointer={pointer} />
        {(Object.keys(equipment) as EquipmentKey[]).map((k) => (
          <Appear
            key={k}
            object={equipment[k]}
            mount={anchors[k]}
            visible={visible[k]}
            reduced={reduced}
            delay={k === "car" ? 0.12 : 0.05}
            hitKey={EQUIPMENT_HIT[k]}
            pointer={pointer}
          />
        ))}
        <EnergyFlow flows={spec.flows} nodes={nodes} sunDir={sunLocal} rayTargets={rays} palette={palette} reduced={reduced} />
        {activeSpec?.visible && <Tooltip spec={activeSpec} position={labels[activeSpec.key]} />}
      </group>
      <CameraRig preset={preset} rotationY={rotationY} reduced={reduced} />
    </>
  );
}

/** The R3F canvas. Client-only: load it through next/dynamic with ssr: false (see House3D). */
export default function Scene(props: SceneProps) {
  const [dpr, setDpr] = useState(2);
  return (
    <Canvas
      shadows
      flat
      dpr={[1, dpr]}
      camera={{ fov: 32, near: 0.5, far: 200, position: [17, 10, 24] }}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      onPointerMissed={props.onMiss}
      onCreated={props.onReady}
      style={{ touchAction: "pan-y" }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)} />
      <World {...props} />
    </Canvas>
  );
}
