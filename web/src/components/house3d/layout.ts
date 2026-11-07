/**
 * Where the PV panels go. Pure and unit-free except metres.
 * A roof plane is a rectangle: u runs along the eave (0 = plane centre), v runs from the eave up to the ridge.
 */

/** A 450 W module in portrait, metres. */
export const PANEL = { w: 1.134, h: 1.762, gap: 0.02, kwp: 0.45 } as const;

export type PlaneId = "main" | "garage";

export interface RoofPlane {
  id: PlaneId;
  /** Length along the eave, metres. */
  width: number;
  /** Length from eave to ridge (or top edge), metres. */
  slope: number;
  margin: { side: number; eave: number; ridge: number };
}

export interface PanelSlot {
  /** Stable per position (`${plane}-r${row}u${mm}`): a panel that stays put keeps its id when the system grows. */
  id: string;
  plane: PlaneId;
  /** Panel centre, metres. */
  u: number;
  v: number;
}

export interface Layout {
  slots: PanelSlot[];
  requested: number;
  placed: number;
  /** Panels that fit on no plane. */
  overflow: number;
}

/** Panels for a PV size: round(kWp / 0.45), optionally capped (e.g. by Google Solar). */
export function panelCount(kwp: number | null | undefined, maxPanels?: number): number {
  if (kwp == null || !Number.isFinite(kwp) || kwp <= 0) return 0;
  const n = Math.round(kwp / PANEL.kwp);
  return maxPanels != null && maxPanels >= 0 ? Math.min(n, Math.floor(maxPanels)) : n;
}

const fit = (length: number, size: number) => Math.max(0, Math.floor((length + PANEL.gap + 1e-9) / (size + PANEL.gap)));

export function capacity(plane: RoofPlane): { cols: number; rows: number; total: number } {
  const cols = fit(plane.width - 2 * plane.margin.side, PANEL.w);
  const rows = fit(plane.slope - plane.margin.eave - plane.margin.ridge, PANEL.h);
  return { cols, rows, total: cols * rows };
}

/** Fill planes in order. On each plane: full rows from the eave up, the last row centred. */
export function layoutPanels(n: number, planes: RoofPlane[]): Layout {
  const requested = Math.max(0, Math.floor(n));
  const slots: PanelSlot[] = [];
  let left = requested;
  for (const plane of planes) {
    if (left <= 0) break;
    const { cols, total } = capacity(plane);
    const k = Math.min(left, total);
    for (let i = 0, row = 0; i < k; row++) {
      const inRow = Math.min(cols, k - i);
      const v = plane.margin.eave + PANEL.h / 2 + row * (PANEL.h + PANEL.gap);
      for (let col = 0; col < inRow; col++, i++) {
        const u = (col - (inRow - 1) / 2) * (PANEL.w + PANEL.gap);
        slots.push({ id: `${plane.id}-r${row}u${Math.round(u * 1000)}`, plane: plane.id, u, v });
      }
    }
    left -= k;
  }
  return { slots, requested, placed: slots.length, overflow: requested - slots.length };
}
