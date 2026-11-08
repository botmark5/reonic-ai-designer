/**
 * The inside diorama's rules, pure: three zones side by side, a few slots along each zone's back wall, and where
 * each part may go. World: +x right, +z towards the viewer, y up; the board's top is y = 0.
 */
export type Zone = "basement" | "garage" | "outside";
export type InsideKey = "battery" | "inverter" | "heatpump" | "wallbox";
export const INSIDE_KEYS: readonly InsideKey[] = ["battery", "inverter", "heatpump", "wallbox"];
export type Placement = Partial<Record<InsideKey, { zone: Zone; slot: number }>>;

export interface ZoneSpec {
  zone: Zone;
  label: string;
  /** x range of the zone's floor */
  x0: number;
  x1: number;
  /** floor height (the basement is sunk) */
  floorY: number;
  /** slot x positions along the back wall */
  slots: number[];
}

export const ZONES: Record<Zone, ZoneSpec> = {
  basement: { zone: "basement", label: "Basement", x0: -5.2, x1: -1.9, floorY: -1.4, slots: [-4.4, -3.5, -2.6] },
  garage: { zone: "garage", label: "Garage", x0: -1.6, x1: 1.9, floorY: 0, slots: [-1.0, 0.15, 1.3] },
  outside: { zone: "outside", label: "Outside wall", x0: 2.2, x1: 5.6, floorY: 0, slots: [3.0, 4.1, 5.0] },
};
export const ZONE_ORDER: readonly Zone[] = ["basement", "garage", "outside"];
/** Back wall plane (items stand against it or hang on it). */
export const WALL_Z = -1.6;

export const ALLOWED: Record<InsideKey, readonly Zone[]> = {
  battery: ["basement", "garage"],
  inverter: ["basement", "garage", "outside"],
  heatpump: ["outside"],
  wallbox: ["garage", "outside"],
};

/** Why a part cannot go into a zone (plain words for the planner and the homeowner). */
export const WHY_NOT: Record<InsideKey, string> = {
  battery: "The battery stays indoors and frost-free.",
  inverter: "",
  heatpump: "The heat pump needs outside air.",
  wallbox: "The wallbox goes where the car parks.",
};

export const DEFAULTS: Record<InsideKey, Zone> = { battery: "garage", inverter: "garage", heatpump: "outside", wallbox: "garage" };

/** Zone under a point, or null between zones / off the board. */
export function zoneAt(x: number): Zone | null {
  return ZONE_ORDER.find((z) => x >= ZONES[z].x0 && x <= ZONES[z].x1) ?? null;
}

/** First free slot in a zone, preferring the one nearest x. null when the zone is full. */
export function freeSlot(p: Placement, zone: Zone, x: number, except?: InsideKey): number | null {
  const taken = new Set(INSIDE_KEYS.filter((k) => k !== except && p[k]?.zone === zone).map((k) => p[k]!.slot));
  const order = ZONES[zone].slots.map((sx, i) => ({ i, d: Math.abs(sx - x) })).sort((a, b) => a.d - b.d);
  return order.find((o) => !taken.has(o.i))?.i ?? null;
}

/** Default placement for the parts the design has. */
export function defaultPlacement(keys: readonly InsideKey[]): Placement {
  const p: Placement = {};
  for (const k of keys) {
    const zone = DEFAULTS[k];
    const slot = freeSlot(p, zone, ZONES[zone].slots[0]);
    if (slot !== null) p[k] = { zone, slot };
  }
  return p;
}

export type DropResult = { ok: true; placement: Placement } | { ok: false; reason: string };

/** Drop a part at x: snaps into the nearest free slot of the zone under it, or says why it goes back. */
export function drop(p: Placement, key: InsideKey, x: number): DropResult {
  const zone = zoneAt(x);
  if (!zone) return { ok: false, reason: "Drop it into one of the three areas." };
  return moveTo(p, key, zone, x);
}

export function moveTo(p: Placement, key: InsideKey, zone: Zone, x = ZONES[zone].slots[0]): DropResult {
  if (!ALLOWED[key].includes(zone)) return { ok: false, reason: WHY_NOT[key] || "Not here." };
  const slot = freeSlot(p, zone, x, key);
  if (slot === null) return { ok: false, reason: `The ${ZONES[zone].label.toLowerCase()} is full.` };
  return { ok: true, placement: { ...p, [key]: { zone, slot } } };
}

/** Where a placed part stands in the scene. */
export function slotPosition(zone: Zone, slot: number): [number, number, number] {
  const z = ZONES[zone];
  return [z.slots[slot], z.floorY, WALL_Z];
}
