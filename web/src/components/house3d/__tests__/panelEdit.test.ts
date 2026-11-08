import { describe, expect, it } from "vitest";
import { layoutPanels, type RoofPlane } from "../layout";
import { addPanel, fullGrid, movePanel, nearestFree, overlaps, removePanel, touches } from "../panelEdit";

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
  it("an attached drop never makes an island", () => {
    const spot = nearestFree(design, grid, "main", 0, 99, design[0].id, true)!;
    expect(design.some((p) => p.id !== design[0].id && touches(p, spot))).toBe(true);
  });
  it("the first panel on an empty plane may go anywhere", () => {
    expect(nearestFree(design, grid, "garage", 0, 0, undefined, true)).not.toBeNull();
  });
  it("removing from the middle of a row closes the gap, the sliding panels keep their ids", () => {
    const row0 = design.filter((p) => Math.abs(p.v - design[0].v) < 1e-6);
    const mid = row0[3];
    const after = removePanel(design, mid.id);
    expect(after).toHaveLength(13);
    const left = after.filter((p) => Math.abs(p.v - mid.v) < 1e-6).sort((a, b) => a.u - b.u);
    for (let i = 1; i < left.length; i++) expect(left[i].u - left[i - 1].u).toBeCloseTo(1.154, 3);
    expect(new Set(after.map((p) => p.id)).size).toBe(13);
    for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) expect(overlaps(after[i], after[j])).toBe(false);
  });
  it("removing an end panel moves nothing else; locked panels never slide", () => {
    const row0 = design.filter((p) => Math.abs(p.v - design[0].v) < 1e-6).sort((a, b) => a.u - b.u);
    expect(removePanel(design, row0[0].id)).toEqual(design.filter((p) => p.id !== row0[0].id));
    const locked = new Set(design.map((p) => p.id));
    expect(removePanel(design, row0[3].id, locked)).toEqual(design.filter((p) => p.id !== row0[3].id));
  });
  it("moving a panel out of the middle of a row leaves no hole", () => {
    const row0 = design.filter((p) => Math.abs(p.v - design[0].v) < 1e-6).sort((a, b) => a.u - b.u);
    const top = nearestFree(design, grid, "main", 0, 99)!;
    const after = movePanel(design, row0[4].id, top);
    expect(after).toHaveLength(14);
    const row = after.filter((p) => Math.abs(p.v - design[0].v) < 1e-6).sort((a, b) => a.u - b.u);
    for (let i = 1; i < row.length; i++) expect(row[i].u - row[i - 1].u).toBeCloseTo(1.154, 3);
    expect(after.find((p) => p.id === row0[4].id)?.u).toBe(top.u);
    expect(new Set(after.map((p) => p.id)).size).toBe(14);
  });
  it("adding onto a spot whose grid id a moved panel carries still gives a unique id", () => {
    const row0 = design.filter((p) => Math.abs(p.v - design[0].v) < 1e-6).sort((a, b) => a.u - b.u);
    const top = nearestFree(design, grid, "main", row0[9].u, 99, row0[9].id, true)!;
    let placed = movePanel(design, row0[9].id, top);
    for (let k = 0; k < 6; k++) placed = addPanel(placed, grid, null);
    expect(new Set(placed.map((p) => p.id)).size).toBe(placed.length);
  });
});
