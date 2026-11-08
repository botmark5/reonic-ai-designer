import type { FlowNodeId, LiveFlow } from "./energyDay";
import type { RoofInput, StageLocation, StageReveal } from "./types";

/** The location's coordinates feed the sun's path unless the roof facts already carry their own. */
export function stageRoof(roof: RoofInput | undefined, location: StageLocation | undefined): RoofInput | undefined {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return roof;
  return { ...roof, latitude: roof?.latitude ?? location.lat, longitude: roof?.longitude ?? location.lng };
}

/**
 * Real photogrammetry outside is behind a flag until verified on production: `?tiles=1` in the URL or
 * NEXT_PUBLIC_HOUSE_TILES=1. It also needs a location and the Google key; otherwise the procedural house.
 */
export function tilesWanted(search: string, envFlag: string | undefined): boolean {
  const q = new URLSearchParams(search).get("tiles");
  if (q === "0") return false;
  return q === "1" || envFlag === "1";
}

/** What the scene draws during a /live build-up. Without `reveal`, everything the design has. */
export interface Shown {
  shell: boolean;
  roof: boolean;
  existingPv: boolean;
  /** New panels. */
  panels: boolean;
  /** Any panels on the roof (new or existing). */
  pv: boolean;
  inverter: boolean;
  battery: boolean;
  /** Car and wallbox. */
  car: boolean;
  heatpump: boolean;
}

export function revealed(reveal: StageReveal | undefined): Shown {
  if (!reveal) {
    return { shell: true, roof: true, existingPv: true, panels: true, pv: true, inverter: true, battery: true, car: true, heatpump: true };
  }
  const shell = !!reveal.shell;
  const roof = shell && !!reveal.roof;
  const panels = roof && !!reveal.panels;
  const existingPv = roof && (reveal.existingPv ?? panels);
  const pv = panels || existingPv;
  return {
    shell, roof, existingPv, panels, pv,
    inverter: shell && (reveal.inverter ?? pv),
    battery: shell && (reveal.battery ?? panels),
    car: shell && !!reveal.car,
    heatpump: shell && !!reveal.heatpump,
  };
}

const NEEDS: Partial<Record<FlowNodeId, keyof Shown>> = {
  sun: "pv", panels: "pv", inverter: "inverter", battery: "battery",
  wallbox: "car", car: "car", heatpump: "heatpump", house: "shell", grid: "shell",
};

/** Energy only flows through parts that are already on stage. */
export function revealFlows(flows: LiveFlow[], shown: Shown): LiveFlow[] {
  return flows.filter((f) => f.path.every((n) => { const k = NEEDS[n]; return !k || shown[k]; }));
}

const STEPS = ["shell", "roof", "panels", "car", "heatpump", "existingPv", "inverter", "battery"] as const;
/** A stable string for a reveal ("" = no build-up), so a new object with the same steps changes nothing. */
// "1" on, "0" off, "-" not given (falls back to its default)
export const revealKey = (r: StageReveal | undefined) =>
  r ? STEPS.map((k) => (r[k] === undefined ? "-" : r[k] ? "1" : "0")).join("") : "";
export const revealedFromKey = (key: string) =>
  revealed(key ? Object.fromEntries(STEPS.flatMap((k, i) => (key[i] === "-" ? [] : [[k, key[i] === "1"]]))) : undefined);
