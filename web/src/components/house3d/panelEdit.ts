/**
 * Planner panel editing on the procedural roof, pure. Editing only PLACES panels; the engine's size never changes.
 * Candidates are every full-grid position on each plane; a spot is free when no placed panel overlaps it (the
 * design's centred last row sits half a panel off the grid, so overlap, not grid identity, decides).
 */
import { PANEL, capacity, type PanelSlot, type PlaneId, type RoofPlane } from "./layout";

const EPS = 1e-3;

export function fullGrid(planes: RoofPlane[]): PanelSlot[] {
  const out: PanelSlot[] = [];
  for (const plane of planes) {
    const { cols, rows } = capacity(plane);
    for (let row = 0; row < rows; row++) {
      const v = plane.margin.eave + PANEL.h / 2 + row * (PANEL.h + PANEL.gap);
      for (let col = 0; col < cols; col++) {
        const u = (col - (cols - 1) / 2) * (PANEL.w + PANEL.gap);
        out.push({ id: `${plane.id}-r${row}u${Math.round(u * 1000)}`, plane: plane.id, u, v });
      }
    }
  }
  return out;
}

export function overlaps(a: Pick<PanelSlot, "plane" | "u" | "v">, b: Pick<PanelSlot, "plane" | "u" | "v">): boolean {
  return a.plane === b.plane && Math.abs(a.u - b.u) < PANEL.w + PANEL.gap - EPS && Math.abs(a.v - b.v) < PANEL.h + PANEL.gap - EPS;
}

/** The free grid spot nearest (u, v) on `plane`, ignoring the panel `except` (the one being moved). */
export function nearestFree(placed: PanelSlot[], grid: PanelSlot[], plane: PlaneId, u: number, v: number, except?: string): PanelSlot | null {
  const others = placed.filter((p) => p.id !== except);
  let best: PanelSlot | null = null;
  let bestD = Infinity;
  for (const c of grid) {
    if (c.plane !== plane || others.some((p) => overlaps(p, c))) continue;
    const d = (c.u - u) ** 2 + (c.v - v) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Move a panel to a free spot (keeps the list order, so the rest of the roof stays still). */
export function movePanel(placed: PanelSlot[], id: string, to: PanelSlot): PanelSlot[] {
  if (placed.some((p) => p.id !== id && overlaps(p, to))) return placed;
  return placed.map((p) => (p.id === id ? { ...to } : p));
}

/** Add one panel next to `near` (or the first free spot of the main plane), if anything is free. */
export function addPanel(placed: PanelSlot[], grid: PanelSlot[], near?: PanelSlot | null): PanelSlot[] {
  const tries: [PlaneId, number, number][] = near
    ? [[near.plane, near.u, near.v], [near.plane === "main" ? "garage" : "main", 0, 0]]
    : [["main", 0, 0], ["garage", 0, 0]];
  for (const [plane, u, v] of tries) {
    const spot = nearestFree(placed, grid, plane, u, v);
    if (spot) return [...placed, spot];
  }
  return placed;
}

export function removePanel(placed: PanelSlot[], id: string): PanelSlot[] {
  return placed.filter((p) => p.id !== id);
}
