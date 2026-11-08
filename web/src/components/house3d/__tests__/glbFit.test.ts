import { describe, expect, it } from "vitest";
import { fitToFootprint, glbWanted } from "../glbFit";

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
