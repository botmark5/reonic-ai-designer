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

/** Shares an edge with `b` (same row side by side, or the row above/below overlapping in u). */
export function touches(a: Pick<PanelSlot, "plane" | "u" | "v">, b: Pick<PanelSlot, "plane" | "u" | "v">): boolean {
  if (a.plane !== b.plane) return false;
  const du = Math.abs(a.u - b.u);
  const dv = Math.abs(a.v - b.v);
  const W = PANEL.w + PANEL.gap;
  const H = PANEL.h + PANEL.gap;
  return (dv < EPS && du < W + EPS) || (Math.abs(dv - H) < EPS && du < W - EPS);
}

/**
 * The free grid spot nearest (u, v) on `plane`, ignoring the panel `except` (the one being moved). With `attached`,
 * only spots touching another panel on that plane count (no islands), unless that plane has none yet.
 */
export function nearestFree(placed: PanelSlot[], grid: PanelSlot[], plane: PlaneId, u: number, v: number, except?: string, attached = false): PanelSlot | null {
  const others = placed.filter((p) => p.id !== except);
  const onPlane = others.filter((p) => p.plane === plane);
  const needTouch = attached && onPlane.length > 0;
  let best: PanelSlot | null = null;
  let bestD = Infinity;
  for (const c of grid) {
    if (c.plane !== plane || others.some((p) => overlaps(p, c))) continue;
    if (needTouch && !onPlane.some((p) => touches(p, c))) continue;
    const d = (c.u - u) ** 2 + (c.v - v) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Move a panel to a free spot; the row it left closes its gap (the moved panel and `locked` ones stay put). */
export function movePanel(placed: PanelSlot[], id: string, to: PanelSlot, locked?: ReadonlySet<string>): PanelSlot[] {
  const from = placed.find((p) => p.id === id);
  if (!from || placed.some((p) => p.id !== id && overlaps(p, to))) return placed;
  const moved = placed.map((p) => (p.id === id ? { ...to } : p));
  return closeGap(moved, from, new Set([...(locked ?? []), to.id]));
}

/** Add one panel next to `near` (or the first free spot of the main plane), if anything is free. */
export function addPanel(placed: PanelSlot[], grid: PanelSlot[], near?: PanelSlot | null): PanelSlot[] {
  const tries: [PlaneId, number, number][] = near
    ? [[near.plane, near.u, near.v], [near.plane === "main" ? "garage" : "main", 0, 0]]
    : [["main", 0, 0], ["garage", 0, 0]];
  for (const [plane, u, v] of tries) {
    const spot = nearestFree(placed, grid, plane, u, v, undefined, true);
    if (spot) return [...placed, spot];
  }
  return placed;
}

const idAt = (row: string, u: number) => `${row}u${Math.round(u * 1000)}`;

/**
 * Remove a panel and close the gap in its row: the shorter side of the row slides one panel inward (never panels
 * in `locked`), so a removal leaves no hole. Ids follow the position, like the layout's.
 */
export function removePanel(placed: PanelSlot[], id: string, locked?: ReadonlySet<string>): PanelSlot[] {
  const gone = placed.find((p) => p.id === id);
  const rest = placed.filter((p) => p.id !== id);
  return gone ? closeGap(rest, gone, locked) : rest;
}

/** `rest` has a hole where `gone` was: the shorter unlocked side of that row slides one panel inward. */
function closeGap(rest: PanelSlot[], gone: PanelSlot, locked?: ReadonlySet<string>): PanelSlot[] {
  if (rest.some((p) => overlaps(p, gone))) return rest; // the spot is taken again
  const row = rest.filter((p) => p.plane === gone.plane && Math.abs(p.v - gone.v) < EPS);
  const left = row.filter((p) => p.u < gone.u);
  const right = row.filter((p) => p.u > gone.u);
  const W = PANEL.w + PANEL.gap;
  const free = (side: PanelSlot[]) => side.length > 0 && !side.some((p) => locked?.has(p.id));
  // only a real hole: panels on both sides
  if (!left.length || !right.length) return rest;
  const side = [left, right].filter(free).sort((a, b) => a.length - b.length)[0];
  if (!side) return rest;
  const dir = side === left ? 1 : -1;
  const shift = new Set(side.map((p) => p.id));
  const prefix = /^(.*-r\d+)u-?\d+$/;
  return rest.map((p) => {
    if (!shift.has(p.id)) return p;
    const u = p.u + dir * W;
    const m = prefix.exec(p.id);
    return { ...p, u, id: m ? idAt(m[1], u) : p.id };
  });
}
