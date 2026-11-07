export type { Design, DesignResponse, Home } from "../../lib/types";

/** Who is looking: the planner gets exact sizes, the homeowner plain words. */
export type House3DMode = "planner" | "homeowner";

/**
 * Roof facts that override `home.tilt_deg` / `home.orientation_deg` (e.g. from Google Solar).
 * Defaults: 35° pitch, 180° (south).
 */
export interface RoofInput {
  pitchDeg?: number;
  azimuthDeg?: number;
  /** Upper bound on panels the roof can take (Google Solar maxArrayPanelsCount). */
  maxPanels?: number;
  /** Where the house is, for the sun's path (default Munich). */
  latitude?: number;
  longitude?: number;
}

export type ThemeName = "light" | "dark";
