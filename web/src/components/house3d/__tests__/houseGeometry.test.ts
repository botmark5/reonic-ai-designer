import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { batteryModuleCount, buildEquipment } from "../equipmentGeometry";
import { HOUSE, buildHouse, countTriangles, roofPlanes, slotToWorld } from "../houseGeometry";
import { getPalette } from "../palette";

const pal = getPalette("light");
const rad = (d: number) => (d * Math.PI) / 180;

describe("roofPlanes", () => {
  it("main plane spans the house plus overhangs", () => {
    const [main, garage] = roofPlanes(35);
    expect(main.id).toBe("main");
    expect(main.width).toBeCloseTo(HOUSE.length + 2 * HOUSE.gableOverhang, 6);
    expect(main.slope).toBeCloseTo((HOUSE.depth / 2 + HOUSE.eaveOverhang) / Math.cos(rad(35)), 2);
    expect(garage.id).toBe("garage");
  });
  it("a steeper pitch gives a longer slope", () => {
    expect(roofPlanes(45)[0].slope).toBeGreaterThan(roofPlanes(35)[0].slope);
  });
});

describe("buildHouse", () => {
  const house = buildHouse(35, pal);

  it("stays well inside the triangle budget", () => {
    const tris = countTriangles(house.group);
    expect(tris).toBeGreaterThan(500);
    expect(tris).toBeLessThan(40_000);
  });

  it("slot (0,0) is the eave centre and v = slope reaches ridge height", () => {
    const main = house.frames.main;
    expect(slotToWorld(main, 0, 0).distanceTo(main.origin)).toBeLessThan(1e-9);
    const top = slotToWorld(main, 0, main.plane.slope);
    expect(top.y).toBeCloseTo(HOUSE.eaveHeight + (HOUSE.depth / 2) * Math.tan(rad(35)), 1);
    expect(Math.abs(top.z)).toBeLessThan(0.01);
  });

  it("the main plane faces south (+z) and up", () => {
    const n = house.frames.main.normal;
    expect(n.z).toBeGreaterThan(0);
    expect(n.y).toBeGreaterThan(0);
    expect(n.length()).toBeCloseTo(1, 9);
  });

  it("frames match the planes used for layout", () => {
    const planes = roofPlanes(35);
    expect(house.frames.main.plane).toEqual(planes[0]);
    expect(house.frames.garage.plane).toEqual(planes[1]);
  });
});

describe("buildEquipment", () => {
  it("builds every component plus the car within budget", () => {
    const eq = buildEquipment(pal);
    for (const k of ["inverter", "wallbox", "heatpump", "car"] as const) expect(eq[k]).toBeInstanceOf(THREE.Group);
    expect(eq.heatpump.getObjectByName("fan")).toBeDefined();
    expect(eq.car.children.filter((c) => c.name === "wheel")).toHaveLength(4);
    const total = Object.values(eq).reduce((a, g) => a + countTriangles(g), 0);
    expect(total).toBeLessThan(8_000);
  });
});

describe("batteryModuleCount", () => {
  it("stacks ≈ 2.5 kWh modules, 1 to 8", () => {
    expect([5, 7, 10, 14, 20, 30].map(batteryModuleCount)).toEqual([2, 3, 4, 6, 8, 8]);
    expect(batteryModuleCount(1)).toBe(1);
    expect(batteryModuleCount(null)).toBe(0);
    expect(batteryModuleCount(0)).toBe(0);
  });
});

describe("a ready-made building (GLB) roof", () => {
  const glb = { widthM: 11.9, slopeM: 5.3, eave: [0.25, 7.3, 5.2] as [number, number, number] };
  const garage = { pitchDeg: 14, widthM: 7.9, slopeM: 4.1, eave: [9.8, 3.9, 1.0] as [number, number, number], facing: "east" as const };

  it("uses the plane measured on the model and leaves the garage out when the model has no garage roof for panels", () => {
    const planes = roofPlanes(37, glb);
    expect(planes.map((p) => p.id)).toEqual(["main"]);
    expect(planes[0].width).toBe(11.9);
    expect(planes[0].slope).toBe(5.3);
    const withGarage = roofPlanes(37, { ...glb, garage });
    expect(withGarage.map((p) => p.id)).toEqual(["main", "garage"]);
    expect(withGarage[1].width).toBe(7.9);
    expect(withGarage[1].slope).toBe(4.1);
  });

  it("an east-facing garage roof gets a right-handed frame whose rows climb west and whose normal points east and up", () => {
    const house = buildHouse(37, pal, { ...glb, garage });
    const f = house.frames.garage;
    expect(f.origin.toArray()).toEqual([9.8, 3.9, 1.0]);
    const top = slotToWorld(f, 0, 4.1);
    expect(top.x).toBeCloseTo(9.8 - 4.1 * Math.cos(rad(14)), 6);
    expect(top.y).toBeCloseTo(3.9 + 4.1 * Math.sin(rad(14)), 6);
    expect(top.z).toBeCloseTo(1.0, 6);
    expect(f.normal.x).toBeGreaterThan(0);
    expect(f.normal.y).toBeGreaterThan(0);
    expect(new THREE.Vector3().crossVectors(f.uAxis, f.vAxis).distanceTo(f.normal)).toBeLessThan(1e-9);
  });

  it("puts the panel frame on the model's eave while the drawn (stand-in) roof stays where it was", () => {
    const house = buildHouse(37, pal, glb);
    expect(house.frames.main.origin.toArray()).toEqual([0.25, 7.3, 5.2]);
    expect(house.frames.main.plane.slope).toBe(5.3);
    const top = slotToWorld(house.frames.main, 0, 5.3);
    expect(top.y).toBeCloseTo(7.3 + 5.3 * Math.sin(rad(37)), 6);
    expect(top.z).toBeCloseTo(5.2 - 5.3 * Math.cos(rad(37)), 6);
    expect(countTriangles(house.parts.roof)).toBe(countTriangles(buildHouse(37, pal).parts.roof));
  });
});
