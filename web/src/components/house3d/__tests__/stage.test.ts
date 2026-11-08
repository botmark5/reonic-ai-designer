import { describe, expect, it } from "vitest";
import { stageRoof, tilesWanted } from "../stage";

describe("stageRoof", () => {
  it("passes the roof through without a location", () => {
    expect(stageRoof({ pitchDeg: 30 }, undefined)).toEqual({ pitchDeg: 30 });
    expect(stageRoof(undefined, undefined)).toBeUndefined();
  });
  it("uses the location for the sun when the roof has no coordinates", () => {
    expect(stageRoof({ pitchDeg: 30 }, { lat: 52.5, lng: 13.4 })).toEqual({ pitchDeg: 30, latitude: 52.5, longitude: 13.4 });
  });
  it("keeps the roof's own coordinates", () => {
    expect(stageRoof({ latitude: 48, longitude: 11 }, { lat: 52.5, lng: 13.4 })).toEqual({ latitude: 48, longitude: 11 });
  });
  it("ignores a broken location", () => {
    expect(stageRoof(undefined, { lat: Number.NaN, lng: 13 })).toBeUndefined();
  });
});

describe("tilesWanted", () => {
  it("is off by default", () => expect(tilesWanted("", undefined)).toBe(false));
  it("turns on with ?tiles=1 or the env flag", () => {
    expect(tilesWanted("?tiles=1", undefined)).toBe(true);
    expect(tilesWanted("?a=b", "1")).toBe(true);
  });
  it("?tiles=0 wins over the env flag", () => expect(tilesWanted("?tiles=0", "1")).toBe(false));
});
