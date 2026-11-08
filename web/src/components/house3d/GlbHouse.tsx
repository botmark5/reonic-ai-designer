"use client";

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { fitToFootprint, type GlbHouseConfig } from "./glbFit";

/**
 * The generated building, fitted to the procedural footprint. Rendered inside a Suspense whose fallback is the
 * procedural shell and roof, so the page never waits on the download.
 */
export function GlbHouse({ cfg, visible = true }: { cfg: GlbHouseConfig; visible?: boolean }) {
  const { scene } = useGLTF(cfg.url);
  // one clone per mount: useGLTF caches the scene, and we change its materials' shadow flags
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => {
    const probe = model.clone(true);
    probe.rotation.y = THREE.MathUtils.degToRad(cfg.rotationYDeg);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe);
    if (process.env.NODE_ENV !== "production") {
      const size = box.getSize(new THREE.Vector3());
      console.info("[GlbHouse] bounding box after rotation", { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() });
    }
    return fitToFootprint(box, cfg);
  }, [model, cfg]);
  useLayoutEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [model]);
  return (
    <group visible={visible} position={fit.position} scale={fit.scale}>
      <primitive object={model} rotation-y={THREE.MathUtils.degToRad(cfg.rotationYDeg)} />
    </group>
  );
}
