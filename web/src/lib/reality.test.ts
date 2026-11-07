import { describe, expect, it } from "vitest";
import { verdicts, coverage, headlineSource, headlines } from "./reality";
import type { ExpertVariant } from "./types";

const v = (o: Partial<ExpertVariant>): ExpertVariant => ({ option_number: 1, is_primary: true, pv_kwp: 9, battery_kwh: 10, has_wallbox: false, heatpump_kw: 0, ...o });
const cat = [5, 7, 10, 14, 15];

describe("reality verdicts", () => {
  it("PV within 1 kWp of the expert is a match", () => {
    const r = verdicts({ pv: 8.55, battery: 10, wallbox: false, heatpump: null, heatpumpOption: null }, [v({})], cat);
    expect(r.pv.kind).toBe("match");
    expect(r.battery.kind).toBe("match");
    expect(r.wallbox.kind).toBe("match");
    expect(r.heatpump.kind).toBe("match");
  });

  it("inside the range of several offered variants counts as a hit", () => {
    const variants = [v({ pv_kwp: 6.75, battery_kwh: 10 }), v({ is_primary: false, option_number: 2, pv_kwp: 12.15, battery_kwh: 15 })];
    const r = verdicts({ pv: 10.8, battery: 14, wallbox: false, heatpump: null, heatpumpOption: null }, variants, cat);
    expect(r.pv.kind).toBe("range");
    expect(r.battery.kind).toBe("range");
  });

  it("battery one catalogue step away is close, further is off", () => {
    expect(verdicts({ pv: 9, battery: 14, wallbox: false, heatpump: null, heatpumpOption: null }, [v({ battery_kwh: 10 })], cat).battery.kind).toBe("close");
    expect(verdicts({ pv: 9, battery: 5, wallbox: false, heatpump: null, heatpumpOption: null }, [v({ battery_kwh: 14 })], cat).battery.kind).toBe("off");
  });

  it("no battery inside a [none, 5.12] offer range is a hit, like evaluate.py", () => {
    const variants = [v({ battery_kwh: 0 }), v({ is_primary: false, option_number: 2, battery_kwh: 5.12 })];
    expect(verdicts({ pv: 9, battery: null, wallbox: false, heatpump: null, heatpumpOption: null }, variants, cat).battery.hit).toBe(true);
  });

  it("yes/no disagreements are flagged", () => {
    const r = verdicts({ pv: null, battery: 5, wallbox: true, heatpump: null, heatpumpOption: null }, [v({ pv_kwp: 9, has_wallbox: false })], cat);
    expect(r.pv.kind).toBe("missing");
    expect(r.wallbox.kind).toBe("extra");
  });

  it("an expert heat pump that we offer as an option is a hit", () => {
    const r = verdicts({ pv: 9, battery: 10, wallbox: false, heatpump: null, heatpumpOption: 12 }, [v({ heatpump_kw: 12.5 })], cat);
    expect(r.heatpump.kind).toBe("option");
  });
});

describe("headline metrics", () => {
  it("compares with the best baseline per metric and names it", async () => {
    const { headlines } = await import("./reality");
    const h = headlines({
      design_model: { pv_kwp_mae_all_projects: 2.94, has_battery_accuracy: 86.7 },
      baseline_band_median: { pv_kwp_mae_all_projects: 3.77, has_battery_accuracy: 89.8 },
      baseline_kwh_per_1000: { pv_kwp_mae_all_projects: 4.95, has_battery_accuracy: 89.8 },
    });
    const pv = h.find((x) => x.key === "pv_kwp_mae_all_projects")!;
    expect(pv.base).toBe(3.77);
    expect(pv.baseName).toBe("consumption-band median");
    expect(pv.wins).toBe(true);
    const bat = h.find((x) => x.key === "has_battery_accuracy")!;
    expect(bat.wins).toBe(false); // shown honestly
  });
});

describe("headlineSource / coverage (old and new /eval shapes)", () => {
  const all = { design_model: { n_projects: 323, pv_kwp_mae_all_projects: 2.9 }, baseline_band_median: { pv_kwp_mae_all_projects: 3.9 } };
  it("falls back to all projects on the old shape", () => {
    const s = headlineSource({ metrics: all });
    expect(s.fullOnly).toBe(false);
    expect(s.metrics).toBe(all);
    expect(s.addOns).toBeNull();
  });
  it("uses new full systems for the headline and keeps add-ons apart", () => {
    const full = { design_model: { n_projects: 42 } };
    const addOns = { design_model: { n_projects: 281 } };
    const s = headlineSource({ metrics: all, segments: { full_designs: full, add_ons: addOns } });
    expect(s.fullOnly).toBe(true);
    expect(s.metrics).toBe(full);
    expect(s.addOns).toBe(addOns);
  });
  it("reads P10–P90 coverage under any known key, else null", () => {
    expect(coverage({ pv_interval_coverage_pct: 79.6 })).toBe(79.6);
    expect(coverage({ pv_p10_p90_coverage_pct: 81 })).toBe(81);
    expect(coverage({ pv_kwp_mae: 2 })).toBeNull();
    expect(coverage(undefined)).toBeNull();
  });
});

describe("headlines ties", () => {
  it("a tie at the shown precision is neither a win nor a loss", () => {
    const [h] = headlines({ design_model: { has_battery_accuracy: 69.2 }, baseline_band_median: { has_battery_accuracy: 68.9 } }, "design_model", [
      { key: "has_battery_accuracy", label: "x", better: "higher", unit: "%" },
    ]);
    expect(h.tie).toBe(true);
    expect(h.wins).toBeNull();
  });
});
