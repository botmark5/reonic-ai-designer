import type { RoofInput, StageLocation } from "./types";

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
