"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { fitToFootprint, type GlbHouseConfig } from "./glbFit";
import type { Palette } from "./palette";

/**
 * The ready-made building, fitted to the procedural footprint and recoloured to the scene palette. Rendered inside a
 * Suspense whose fallback is the procedural shell and roof, so the page never waits on the download.
 */
export function GlbHouse({ cfg, palette, visible = true }: { cfg: GlbHouseConfig; palette: Palette; visible?: boolean }) {
  const { scene } = useGLTF(cfg.url);
  // one clone per mount: useGLTF caches the scene, and we swap its materials and shadow flags
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
  // the file's colours become the matte model materials (same roughness as the procedural house), by material name
  const materials = useMemo(() => {
    const out = new Map<string, THREE.MeshStandardMaterial>();
    for (const [name, key] of Object.entries(cfg.materials)) {
      out.set(name, new THREE.MeshStandardMaterial({ color: palette[key], roughness: key === "glass" ? 0.55 : 0.9, metalness: 0 }));
    }
    return out;
  }, [cfg.materials, palette]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useLayoutEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const swapped = materials.get(original?.name ?? "");
      if (swapped) mesh.material = swapped;
    });
  }, [model, materials]);
  return (
    <group visible={visible} position={fit.position} scale={fit.scale}>
      <primitive object={model} rotation-y={THREE.MathUtils.degToRad(cfg.rotationYDeg)} />
    </group>
  );
}
