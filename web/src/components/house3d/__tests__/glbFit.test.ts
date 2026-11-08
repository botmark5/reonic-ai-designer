import { describe, expect, it } from "vitest";
import { fitToFootprint, GLB_HOUSE, glbWanted } from "../glbFit";
import { HOUSE } from "../houseGeometry";

describe("glbWanted", () => {
  it("is off by default and on with ?house=glb or the env flag", () => {
    expect(glbWanted("", undefined)).toBe(false);
    expect(glbWanted("?house=glb", undefined)).toBe(true);
    expect(glbWanted("", "1")).toBe(true);
    expect(glbWanted("?house=procedural", "1")).toBe(false);
    expect(glbWanted("?house=0", "1")).toBe(false);
  });
});

describe("fitToFootprint", () => {
  it("scales the model to the target length, centres it and puts it on the ground", () => {
    const box = { min: { x: -2, y: 1, z: 10 }, max: { x: 2, y: 3, z: 14 } };
    const fit = fitToFootprint(box, { targetLengthM: 13, offset: [0, 0, 0] });
    expect(fit.scale).toBeCloseTo(3.25);
    // centre x 0 -> no x shift; min y 1 -> moved down by 1 * scale; centre z 12 -> moved by -12 * scale
    expect(fit.position[0]).toBeCloseTo(0);
    expect(fit.position[1]).toBeCloseTo(-3.25);
    expect(fit.position[2]).toBeCloseTo(-39);
  });
  it("applies the offset after fitting and survives a degenerate box", () => {
    const fit = fitToFootprint({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, { targetLengthM: 13, offset: [1, 0.5, -2] });
    expect(fit.scale).toBe(1);
    expect(fit.position).toEqual([1, 0.5, -2]);
  });
});

describe("GLB_HOUSE (Kenney two-storey house, public/models/house.glb)", () => {
  // the bounding box GlbHouse prints for this file; wall and roof positions measured in scripts/house/clean_house.py
  const box = { min: { x: -0.868, y: 0, z: -0.503 }, max: { x: 0.868, y: 1.2, z: 0.503 } };
  const fit = fitToFootprint(box, GLB_HOUSE);
  const rad = (d: number) => (d * Math.PI) / 180;

  it("puts the front wall on the procedural facade and the garage east of the house", () => {
    expect(0.335 * fit.scale + fit.position[2]).toBeCloseTo(HOUSE.depth / 2, 1);
    expect(0.432 * fit.scale + fit.position[0]).toBeGreaterThan(HOUSE.length / 2 - 0.5);
    expect(0.868 * fit.scale + fit.position[0]).toBeLessThan(HOUSE.length / 2 + HOUSE.garage.width);
  });

  it("the panel plane lies on the model's main roof", () => {
    expect(GLB_HOUSE.roof.eave[1]).toBeCloseTo(0.794 * fit.scale, 1);
    expect(GLB_HOUSE.roof.eave[2]).toBeCloseTo(0.413 * fit.scale + fit.position[2], 1);
    expect(GLB_HOUSE.roof.slopeM).toBeCloseTo((0.458 * fit.scale) / Math.cos(rad(GLB_HOUSE.pitchDeg)), 1);
    expect(GLB_HOUSE.roof.widthM).toBeLessThanOrEqual(1.3 * fit.scale);
  });

  it("the garage plane lies on the model's lean-to garage roof, eave at its east edge", () => {
    const g = GLB_HOUSE.roof.garage!;
    expect(g.facing).toBe("east");
    expect(g.eave[0]).toBeCloseTo(0.868 * fit.scale + fit.position[0], 1);
    expect(g.eave[1]).toBeCloseTo(0.418 * fit.scale, 1);
    expect(g.slopeM).toBeCloseTo((0.436 * fit.scale) / Math.cos(rad(g.pitchDeg)), 1);
    expect(g.widthM).toBeLessThanOrEqual(0.86 * fit.scale);
  });
});
