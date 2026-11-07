import { describe, expect, it } from "vitest";
import { allowedLockValues, numbersIn } from "./agent";
import { mockDesign } from "./engine-mock";
import { EMPTY_LOCKS } from "./types";

const r = mockDesign({
  installer: "2a8ba8e2",
  home: { annual_kwh: 4800, price_eur_kwh: 0.32, load_profile: "H0", has_ev: true, ev_km_year: 15000, existing_pv_kwp: null,
    existing_battery_kwh: null, heating: "Gas", heating_demand_kwh: null, roof_type: null, house_sqm: null, inhabitants: 4 },
  locks: EMPTY_LOCKS,
});

describe("agent guards", () => {
  it("reads planner numbers in English and German notation", () => {
    expect(numbersIn("make the battery 10 kWh")).toEqual([10]);
    expect(numbersIn("12,5 kWp and 15.000 km")).toEqual([12.5, 15000]);
    expect(numbersIn("15,000 km a year")).toEqual([15000]);
  });

  it("only allows lock values the planner wrote or the engine offered", () => {
    const battery = allowedLockValues("battery", r, []);
    expect(battery.has(0)).toBe(true);
    for (const a of r.design.battery.alternatives ?? []) expect(battery.has(a.kwh)).toBe(true);
    expect(battery.has(23)).toBe(false);
    expect(allowedLockValues("battery", r, [23]).has(23)).toBe(true);
    expect(allowedLockValues("pv", r, []).has(r.design.pv.kwp!)).toBe(true);
    expect(allowedLockValues("pv", r, []).has(42)).toBe(false);
  });
});
