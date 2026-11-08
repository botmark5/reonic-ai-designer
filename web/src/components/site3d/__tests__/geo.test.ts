import { describe, expect, it } from "vitest";
import { downslope, dropOrder, median, panelPose, toScene } from "../geo";

const size = { width_m: 1.045, height_m: 1.879 };
const seg = (az: number, pitch = 30) => ({ pitch_deg: pitch, azimuth_deg: az, center: { lat: 0, lng: 0, x_m: 0, y_m: 0 } });

describe("axes", () => {
  it("east is +x, north is -z", () => expect(toScene(3, 4)).toEqual([3, -4]));
  it("a south roof slopes down to +z, an east roof to +x", () => {
    const [sx, sz] = downslope(180);
    expect(sx).toBeCloseTo(0);
    expect(sz).toBeCloseTo(1);
    const [ex, ez] = downslope(90);
    expect(ex).toBeCloseTo(1);
    expect(ez).toBeCloseTo(0);
  });
});

describe("panelPose", () => {
  it("panels south of the centre on a south roof sit lower", () => {
    const low = panelPose({ x_m: 0, y_m: -2, orientation: "LANDSCAPE" }, seg(180), 10, size);
    expect(low.z).toBe(2);
    expect(low.y).toBeCloseTo(10 - 2 * Math.tan(Math.PI / 6));
    const high = panelPose({ x_m: 0, y_m: 2, orientation: "LANDSCAPE" }, seg(180), 10, size);
    expect(high.y).toBeGreaterThan(10);
  });
  it("sideways along the eave keeps the height", () => {
    expect(panelPose({ x_m: 5, y_m: 0, orientation: "PORTRAIT" }, seg(180), 10, size).y).toBeCloseTo(10);
  });
  it("landscape puts the long side across the slope", () => {
    expect(panelPose({ x_m: 0, y_m: 0, orientation: "LANDSCAPE" }, seg(180), 0, size)).toMatchObject({ across: 1.879, along: 1.045 });
    expect(panelPose({ x_m: 0, y_m: 0, orientation: "PORTRAIT" }, seg(180), 0, size)).toMatchObject({ across: 1.045, along: 1.879 });
  });
  it("yaw turns +z towards the azimuth", () => {
    expect(panelPose({ x_m: 0, y_m: 0, orientation: "LANDSCAPE" }, seg(180), 0, size).yaw).toBeCloseTo(0);
    expect(panelPose({ x_m: 0, y_m: 0, orientation: "LANDSCAPE" }, seg(90), 0, size).yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe("dropOrder", () => {
  it("eave row first, then up; best segment first", () => {
    const poses = [
      { x: 0, y: 11, z: 0 }, { x: 1, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 5, z: 0 },
    ].map((p) => ({ ...p, yaw: 0, pitch: 0, across: 1, along: 1 }));
    expect(dropOrder(poses, [0, 0, 0, 1])).toEqual([2, 1, 0, 3]);
  });
});

describe("median", () => {
  it("ignores bad values", () => {
    expect(median([3, Number.NaN, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

import { quantile, segmentHeights } from "../geo";
describe("segmentHeights", () => {
  it("calibrates one offset and ignores a segment under a tree", () => {
    const segs = [{ index: 0, plane_height_m: 540 }, { index: 1, plane_height_m: 538 }, { index: 2, plane_height_m: 541 }];
    const hits = new Map([[0, 587], [1, 585], [2, 600]]); // segment 2's ray hit a tree crown
    const { offset, heights } = segmentHeights(segs, hits, 47);
    expect(offset).toBe(47);
    expect(heights.get(2)).toBe(588);
  });
  it("falls back to the default offset without hits", () => {
    expect(segmentHeights([{ index: 0, plane_height_m: 500 }], new Map(), 47).heights.get(0)).toBe(547);
  });
  it("quantile", () => expect(quantile([5, 1, 3, 2, 4], 0.25)).toBe(2));
});
