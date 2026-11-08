/**
 * Geometry for the real outside, pure (no three.js). Scene axes after re-orienting the tiles on the address:
 * +x east, +y up, -z north (so a south-facing roof faces +z, like the procedural house).
 */
import type { PanelSegment, PlacedPanel, Placement } from "../../lib/solar-panels";

export type { PanelSegment, PlacedPanel, Placement };

const rad = (d: number) => (d * Math.PI) / 180;

/** Metres east / north → scene x / z. */
export const toScene = (east: number, north: number): [number, number] => [east, -north];

/** Horizontal unit vector a roof facing compass `azimuthDeg` slopes down towards (180 = south = +z). */
export function downslope(azimuthDeg: number): [number, number] {
  const a = rad(azimuthDeg);
  return [Math.sin(a), -Math.cos(a)];
}

export interface PanelPose {
  /** Scene position of the panel's centre on the roof plane (before the small lift). */
  x: number;
  y: number;
  z: number;
  /** Euler YXZ: yaw turns +z downslope, then pitch tilts the +z end down. */
  yaw: number;
  pitch: number;
  /** Panel size across the slope / along the slope, metres. */
  across: number;
  along: number;
}

/**
 * Where a panel sits: on its segment's plane through the segment centre at `centreY`, tilted by the pitch and
 * facing the azimuth. LANDSCAPE = long side across the slope.
 */
export function panelPose(
  p: Pick<PlacedPanel, "x_m" | "y_m" | "orientation">,
  seg: Pick<PanelSegment, "pitch_deg" | "azimuth_deg" | "center">,
  centreY: number,
  size: { width_m: number; height_m: number },
): PanelPose {
  const [x, z] = toScene(p.x_m, p.y_m);
  const [cx, cz] = toScene(seg.center.x_m, seg.center.y_m);
  const [dx, dz] = downslope(seg.azimuth_deg);
  const downhill = (x - cx) * dx + (z - cz) * dz; // metres downslope of the segment centre (horizontal)
  const y = centreY - downhill * Math.tan(rad(seg.pitch_deg));
  const long = Math.max(size.width_m, size.height_m);
  const short = Math.min(size.width_m, size.height_m);
  const landscape = p.orientation === "LANDSCAPE";
  return {
    x, y, z,
    yaw: Math.atan2(dx, dz),
    pitch: rad(seg.pitch_deg),
    across: landscape ? long : short,
    along: landscape ? short : long,
  };
}

/** Drop order: per segment, the eave row first (lowest panels), then up the roof; segments best-first. */
export function dropOrder(poses: PanelPose[], segmentOf: number[]): number[] {
  return poses
    .map((p, i) => ({ i, seg: segmentOf[i], y: Math.round(p.y * 4) / 4, x: p.x }))
    .sort((a, b) => a.seg - b.seg || a.y - b.y || a.x - b.x)
    .map((e) => e.i);
}

/** Middle value (robust height from a few rays on noisy photogrammetry). */
export function median(xs: number[]): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** A low quantile: trees and chimneys sit above a roof, so the lower hits are the roof itself. */
export function quantile(xs: number[], q: number): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
}

/**
 * Segment heights in scene metres. Google gives each roof plane's height above sea level; the tiles sit on the
 * ellipsoid. One offset (the local geoid, ≈ 47 m in Germany) maps one onto the other: the median over segments of
 * (ray hit − plane height) is robust to a segment hidden under a tree. Segments without a plane height use their hit.
 */
export function segmentHeights(
  segs: { index: number; plane_height_m: number | null }[],
  hits: Map<number, number>,
  fallbackOffset: number,
): { offset: number; heights: Map<number, number> } {
  const deltas = segs.flatMap((s) => {
    const h = hits.get(s.index);
    return h !== undefined && s.plane_height_m !== null && Number.isFinite(s.plane_height_m) ? [h - s.plane_height_m] : [];
  });
  const offset = median(deltas) ?? fallbackOffset;
  const heights = new Map<number, number>();
  for (const s of segs) {
    if (s.plane_height_m !== null && Number.isFinite(s.plane_height_m)) heights.set(s.index, s.plane_height_m + offset);
    else if (hits.has(s.index)) heights.set(s.index, hits.get(s.index)!);
  }
  return { offset, heights };
}

/** Where the sun-map image lies in the scene: centre, unit axes of its right and up edges, size (metres). */
export interface SunFrame { cx: number; cz: number; right: [number, number]; up: [number, number]; w: number; h: number }

/** The image's "up" points `rotation_deg` clockwise of true north (UTM grid). Scene: +x east, −z north. */
export function sunFrame(local: { center: { x_m: number; y_m: number }; width_m: number; height_m: number; rotation_deg: number }): SunFrame {
  const r = rad(local.rotation_deg);
  const [cx, cz] = toScene(local.center.x_m, local.center.y_m);
  return { cx, cz, right: [Math.cos(r), Math.sin(r)], up: [Math.sin(r), -Math.cos(r)], w: local.width_m, h: local.height_m };
}

/** Texture coordinates of a scene point (x, z) in the sun map; outside [0, 1] = off the image. */
export function sunUv(f: SunFrame, x: number, z: number): [number, number] {
  const dx = x - f.cx;
  const dz = z - f.cz;
  return [0.5 + (dx * f.right[0] + dz * f.right[1]) / f.w, 0.5 + (dx * f.up[0] + dz * f.up[1]) / f.h];
}
