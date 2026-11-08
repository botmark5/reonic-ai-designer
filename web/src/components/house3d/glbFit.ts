/**
 * A ready-made building (a GLB) in place of the procedural shell and roof. Behind a flag: `?house=glb` in the URL or
 * NEXT_PUBLIC_HOUSE_GLB=1. Everything else stays procedural: the site (ground, driveway, trees), the panels, the
 * battery, wallbox, heat pump, flows and labels, so the engine's design is drawn exactly as before; only the building
 * itself is the model.
 *
 * Alignment: the GLB is fitted to the procedural footprint (world axes: y up, +z south, +x east, ridge along x) with a
 * uniform scale and an offset, so the walls the equipment hangs on and the driveway line up. The panels sit on the
 * roof plane measured on the model (`roof`), not on the procedural one. Tune `GLB_HOUSE` once per model: the dev
 * console prints the model's bounding box on load.
 *
 * Current model: `public/models/house.glb`, Kenney's two-storey house with attached garage (City Kit Suburban, CC0,
 * taken from poly.pizza), rebuilt by `scripts/house/clean_house.py`: node scale baked in, turned so the door faces +z
 * and the garage sits east, the front dormer removed (the panels need a clear plane) and the hole patched, flat
 * per-face normals. Its materials are recoloured at runtime to the scene palette (`materials`), so it reads as the
 * same matte architectural model as the procedural house.
 */
import type * as THREE from "three";
import type { Palette } from "./palette";

/** A roof plane that carries panels, measured on the fitted model (metres, world axes). */
export interface GlbPlane {
  /** Length along the eave. */
  widthM: number;
  /** Eave-to-ridge (or top edge) length. */
  slopeM: number;
  /** Centre of the eave line on the roof's top surface: x east, y up, z south. */
  eave: [number, number, number];
}

/** The model's main (south-facing) plane, and its garage roof when that can carry panels too. */
export interface GlbRoof extends GlbPlane {
  /** The garage roof: its own pitch, and the way it slopes down (a lean-to against the east wall slopes east). */
  garage?: GlbPlane & { pitchDeg: number; facing: "south" | "east" };
}

export interface GlbHouseConfig {
  /** Public URL of the model. */
  url: string;
  /** Rotation about y (degrees) so the model's main roof faces +z (south) and its ridge runs along x. */
  rotationYDeg: number;
  /** Footprint length along x the model is scaled to (metres), including a garage if the model has one. */
  targetLengthM: number;
  /** Extra offset after fitting (metres): x east, y up, z south. */
  offset: [number, number, number];
  /** Pitch of the model's main roof (degrees). */
  pitchDeg: number;
  roof: GlbRoof;
  /** Material name in the file → scene palette colour. Unmapped materials keep the file's colour. */
  materials: Record<string, Exclude<keyof Palette, "flow">>;
}

/**
 * Kenney's house: 1.736 × 1.2 × 1.006 model units (x, y, z), main body x −0.818..0.482, garage x 0.432..0.868,
 * front wall z 0.335, main roof 37°, top surface from the eave (y 0.794, z 0.413) to the ridge (y 1.137, z −0.045);
 * the garage roof is a 14° lean-to sloping east, top surface from y 0.531 at the house wall to y 0.418 at x 0.868,
 * z −0.475..0.385. Scaled 16 / 1.736 and shifted so the front wall is on the procedural facade (z 4.5) and the
 * garage east of x 6.
 */
export const GLB_HOUSE: GlbHouseConfig = {
  url: "/models/house.glb",
  rotationYDeg: 0,
  targetLengthM: 16,
  offset: [1.8, 0, 1.41],
  pitchDeg: 37,
  roof: {
    widthM: 11.9,
    slopeM: 5.29,
    eave: [0.25, 7.32, 5.22],
    garage: { pitchDeg: 14, widthM: 7.9, slopeM: 4.14, eave: [9.8, 3.85, 1.0], facing: "east" },
  },
  materials: { _defaultMat: "wall", roof: "roof", border: "roofEdge", window: "glass", door: "door" },
};

/** `?house=glb` in the URL (or the env flag) asks for the model; `?house=procedural` forces the built one. */
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
