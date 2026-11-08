import { describe, expect, it } from "vitest";
import { layoutPanels, type RoofPlane } from "../layout";
import { addPanel, fullGrid, movePanel, nearestFree, overlaps, removePanel } from "../panelEdit";

const planes: RoofPlane[] = [
  { id: "main", width: 13, slope: 6.1, margin: { side: 0.4, eave: 0.4, ridge: 0.3 } },
  { id: "garage", width: 5, slope: 4.2, margin: { side: 0.3, eave: 0.3, ridge: 0.3 } },
];
const grid = fullGrid(planes);
const design = layoutPanels(14, planes).slots; // 10 in the first row, 4 centred in the second

describe("panel editing", () => {
  it("the grid covers every spot of both planes", () => {
    expect(grid.filter((s) => s.plane === "main")).toHaveLength(30);
    expect(grid.filter((s) => s.plane === "garage")).toHaveLength(6);
  });
  it("a free spot never overlaps a placed panel, also next to the centred last row", () => {
    const spot = nearestFree(design, grid, "main", 0, design[12].v)!;
    expect(design.some((p) => overlaps(p, spot))).toBe(false);
  });
  it("moving keeps the count and frees the old spot", () => {
    const top = nearestFree(design, grid, "main", 0, 99)!;
    const moved = movePanel(design, design[0].id, top);
    expect(moved).toHaveLength(14);
    expect(nearestFree(moved, grid, "main", design[0].u, design[0].v)).not.toBeNull();
  });
  it("cannot move onto another panel", () => {
    expect(movePanel(design, design[0].id, design[1])).toBe(design);
  });
  it("add and remove change only the placement", () => {
    const more = addPanel(design, grid, design[13]);
    expect(more).toHaveLength(15);
    expect(removePanel(more, more[14].id)).toHaveLength(14);
  });
  it("a full roof spills to the garage, then refuses", () => {
    let p = layoutPanels(30, planes).slots;
    p = addPanel(p, grid, p[0]);
    expect(p[30].plane).toBe("garage");
    const full = layoutPanels(36, planes).slots;
    expect(addPanel(full, grid, full[0])).toBe(full);
  });
});
