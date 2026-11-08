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

/** A part of the system the stage can highlight or report as selected (same keys as the planner's cards). */
export type ComponentKey = "pv" | "battery" | "inverter" | "wallbox" | "heatpump";

/** Where the house stands. Only for real addresses the planner entered; never geocode Reonic project data. */
export interface StageLocation {
  lat: number;
  lng: number;
  address?: string;
}

/** Build-up steps for the /live reveal. A step that is false (or missing) is not drawn yet. */
export interface StageReveal {
  shell?: boolean;
  roof?: boolean;
  /** Panels drop in row by row when this turns true. */
  panels?: boolean;
  /** The car drives in (only if the design has a wallbox). */
  car?: boolean;
  /** Heat pump appears as a ghost first, then solid (only if the design has one). */
  heatpump?: boolean;
}

/**
 * One panel as the planner placed it. Position is in metres on its roof segment's plane, measured from the
 * segment's lower-left corner (u along the eave, v up the slope). Moving panels never changes the engine's size.
 */
export interface StagePanel {
  id: string;
  segment: number;
  u: number;
  v: number;
  portrait: boolean;
}

export type StageView = "outside" | "inside";
/** "full": live numbers, time bar, camera presets. "minimal": camera presets only. "none": the model alone. */
export type StageControls = "full" | "minimal" | "none";
