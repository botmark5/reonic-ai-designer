/**
 * An AI-generated house (a GLB, e.g. from Tripo) in place of the procedural shell and roof. Behind a flag:
 * `?house=glb` in the URL or NEXT_PUBLIC_HOUSE_GLB=1. Everything else stays procedural: the site (ground, driveway,
 * trees), the panels on the roof plane, the battery, wallbox, heat pump, flows and labels, so the engine's design is
 * drawn exactly as before; only the building itself is the generated model.
 *
 * Alignment: the GLB is fitted to the procedural footprint (world axes: y up, +z south, +x east, ridge along x) with
 * a uniform scale, so the procedural roof plane (where the panels sit) and the model's roof coincide as far as a
 * generated mesh allows. Tune `GLB_HOUSE` once per model: the dev console prints the model's bounding box on load.
 */
import type * as THREE from "three";

export interface GlbHouseConfig {
  /** Public URL of the model. */
  url: string;
  /** Rotation about y (degrees) so the model's main roof faces +z (south) and its ridge runs along x. */
  rotationYDeg: number;
  /** Footprint length along x the model is scaled to (metres), including a garage if the model has one. */
  targetLengthM: number;
  /** Extra offset after fitting (metres): x east, y up, z south. */
  offset: [number, number, number];
  /** Pitch of the model's main roof (degrees): the procedural roof plane that carries the panels uses it. */
  pitchDeg: number;
  /** Eave height of the model's main roof after scaling (metres): lifts the panel plane to the model's roof. */
  eaveHeightM?: number;
}

/** Defaults for the first Tripo model; adjust after reading the bounding box in the console. */
export const GLB_HOUSE: GlbHouseConfig = {
  url: "/models/house.glb",
  rotationYDeg: 0,
  targetLengthM: 13,
  offset: [0, 0, 0],
  pitchDeg: 30,
};

/** `?house=glb` in the URL (or the env flag) asks for the generated model; `?house=procedural` forces the built one. */
export function glbWanted(search: string, envFlag: string | undefined): boolean {
  const q = new URLSearchParams(search).get("house");
  if (q === "procedural" || q === "0") return false;
  return q === "glb" || envFlag === "1";
}

export interface Fit {
  scale: number;
  /** Translation applied after scaling, so the footprint is centred at x = 0 / z = 0 and stands on y = 0. */
  position: [number, number, number];
}

/**
 * Uniform scale and translation that put a model with bounding box `box` (in its own units, after rotation)
 * on the ground, centred, `targetLengthM` long along x.
 */
export function fitToFootprint(box: { min: THREE.Vector3Like; max: THREE.Vector3Like }, cfg: Pick<GlbHouseConfig, "targetLengthM" | "offset">): Fit {
  const sx = box.max.x - box.min.x;
  const scale = sx > 1e-6 ? cfg.targetLengthM / sx : 1;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  return {
    scale,
    position: [-cx * scale + cfg.offset[0], -box.min.y * scale + cfg.offset[1], -cz * scale + cfg.offset[2]],
  };
}
