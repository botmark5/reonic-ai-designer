import { describe, expect, it } from "vitest";
import type { DesignResponse } from "../../../lib/types";
import type { RoofPlane } from "../layout";
import { demoDesign, demoDesignBig, demoHome } from "../mock";
import { buildSceneSpec, resolveRoof } from "../sceneSpec";

const planesFor = (): RoofPlane[] => [
  { id: "main", width: 13, slope: 6.1, margin: { side: 0.4, eave: 0.4, ridge: 0.3 } },
  { id: "garage", width: 5, slope: 4.2, margin: { side: 0.3, eave: 0.3, ridge: 0.3 } },
];

const withDesign = (patch: (d: DesignResponse) => void): DesignResponse => {
  const d = structuredClone(demoDesign);
  patch(d);
  return d;
};

describe("buildSceneSpec", () => {
  it("planner view of the demo design", () => {
    const s = buildSceneSpec(demoDesign, demoHome, "planner", planesFor);
    expect(s.layout.placed).toBe(16);
    expect(s.components.pv).toMatchObject({ visible: true, title: "PV", size: "7.2 kWp (16 × 450 W)" });
    expect(s.components.battery).toMatchObject({ visible: true, title: "Battery", size: "7 kWh" });
    expect(s.components.inverter.visible).toBe(true);
    expect(s.components.wallbox).toMatchObject({ visible: true, title: "Wallbox", size: "11 kW" });
    expect(s.components.heatpump.visible).toBe(false);
    expect(s.components.battery.reason).toBe(demoDesign.design.battery.reasons[0]);
    expect(s.flows.map((f) => f.id)).toEqual([
      "sun-panels", "panels-inverter", "inverter-battery", "inverter-house", "house-wallbox", "wallbox-car",
    ]);
    expect(s.flows.find((f) => f.id === "inverter-battery")?.color).toBe("battery");
  });

  it("homeowner titles drop jargon", () => {
    const s = buildSceneSpec(demoDesign, demoHome, "homeowner", planesFor);
    expect(s.components.pv).toMatchObject({ title: "Solar panels", size: "16 panels" });
    expect(s.components.wallbox).toMatchObject({ title: "Car charger", size: null });
    expect(s.summary).toBe("House with 16 solar panels, a 7 kWh battery and a car charger.");
  });

  it("big design adds the heat pump and its flow", () => {
    const s = buildSceneSpec(demoDesignBig, demoHome, "planner", planesFor);
    expect(s.components.heatpump).toMatchObject({ visible: true, size: "9 kW" });
    expect(s.flows.map((f) => f.id)).toContain("house-heatpump");
    expect(s.components.pv.size).toBe("14.4 kWp (32 × 450 W)");
    expect(s.layout.placed).toBe(32);
  });

  it("excluded and null components are hidden, with no NaN or null in labels", () => {
    const d = withDesign((x) => {
      x.design.pv.include = false;
      x.design.battery.kwh = null;
      x.design.wallbox.include = false;
    });
    const s = buildSceneSpec(d, demoHome, "planner", planesFor);
    for (const k of ["pv", "battery", "inverter", "wallbox", "heatpump"] as const) expect(s.components[k].visible).toBe(false);
    expect(s.layout.placed).toBe(0);
    expect(s.flows).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/NaN|undefined|null kW/);
    expect(s.summary).toBe("House without solar panels.");
  });

  it("notes panels that do not fit on the roof", () => {
    const d = withDesign((x) => { x.design.pv.kwp = 25.2; }); // 56 panels
    const s = buildSceneSpec(d, demoHome, "planner", planesFor);
    expect(s.layout.requested).toBe(56);
    expect(s.components.pv.note).toBe(`${56 - s.layout.placed} of 56 panels don't fit on this roof`);
  });

  it("Google Solar maxPanels caps the panels drawn", () => {
    const s = buildSceneSpec(demoDesign, demoHome, "planner", planesFor, { maxPanels: 12 });
    expect(s.layout.placed).toBe(12);
    expect(s.components.pv.note).toBe("4 of 16 panels don't fit on this roof");
  });
});

describe("zero panels", () => {
  it("a PV size that rounds to no panel counts as no PV", () => {
    const d = withDesign((x) => { x.design.pv.kwp = 0.2; });
    const s = buildSceneSpec(d, demoHome, "planner", planesFor);
    expect(s.components.pv.visible).toBe(false);
    expect(s.components.inverter.visible).toBe(false);
    expect(s.flows.some((f) => f.from === "sun" || f.from === "panels")).toBe(false);
  });

  it("a roof that fits nothing keeps PV in the legend with a note, but no flows from an empty roof", () => {
    const s = buildSceneSpec(demoDesign, demoHome, "planner", planesFor, { maxPanels: 0 });
    expect(s.layout.placed).toBe(0);
    expect(s.components.pv).toMatchObject({ visible: true, note: "16 of 16 panels don't fit on this roof" });
    expect(s.flows.map((f) => f.id)).not.toContain("sun-panels");
    expect(s.flows.map((f) => f.id)).not.toContain("panels-inverter");
  });
});

describe("resolveRoof", () => {
  it("defaults to 35° south, prefers the roof prop over the home, clamps pitch for drawing", () => {
    const bare = { ...demoHome, tilt_deg: null, orientation_deg: null };
    expect(resolveRoof(bare)).toEqual({ pitchDeg: 35, azimuthDeg: 180 });
    expect(resolveRoof({ ...demoHome, tilt_deg: 30, orientation_deg: 200 })).toEqual({ pitchDeg: 30, azimuthDeg: 200 });
    expect(resolveRoof(demoHome, { pitchDeg: 40, azimuthDeg: 90 })).toEqual({ pitchDeg: 40, azimuthDeg: 90 });
    expect(resolveRoof(demoHome, { pitchDeg: 0 }).pitchDeg).toBe(15);
    expect(resolveRoof(demoHome, { pitchDeg: 70 }).pitchDeg).toBe(50);
  });
});
