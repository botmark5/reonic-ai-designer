import { describe, expect, it } from "vitest";
import { mockDesign } from "@/lib/engine-mock";
import { EMPTY_LOCKS, type DesignResponse } from "@/lib/types";
import { factsToHome, type Facts } from "./facts";
import { EMPTY_DESIGN, REVEAL_ORDER, revealFromFacts, stagedDesign, stepToward, type LiveReveal } from "./stage";

const draftFor = (f: Facts): DesignResponse => mockDesign({ installer: "2a8ba8e2", home: factsToHome(f), locks: EMPTY_LOCKS });
const NONE: LiveReveal = { shell: false, warm: false, panels: false, battery: false, car: false, heatpump: false };

describe("revealFromFacts: each fact maps to one visible change", () => {
  it("idle (no call): only the house shell", () => {
    expect(revealFromFacts({}, null, false)).toEqual(NONE);
    expect(revealFromFacts({}, null, true)).toEqual({ ...NONE, shell: true });
  });
  it("yearly use (or the bill) warms the house up", () => {
    expect(revealFromFacts({ annual_kwh: 4800 }, null, true).warm).toBe(true);
    expect(revealFromFacts({ monthly_bill_eur: 120 }, null, true).warm).toBe(true);
    expect(revealFromFacts({ household: 4 }, null, true).warm).toBe(false);
  });
  it("first draft drops the panels; battery follows the engine's battery", () => {
    const f: Facts = { annual_kwh: 4800, has_existing_pv: false };
    const r = revealFromFacts(f, draftFor(f), true);
    expect(r.panels).toBe(true);
    expect(r.battery).toBe(true);
  });
  it("no panels or battery before there is a draft, even if facts are complete", () => {
    const r = revealFromFacts({ annual_kwh: 4800, has_ev: true, heating: "gas" }, null, true);
    expect(r.panels).toBe(false);
    expect(r.battery).toBe(false);
    expect(r.car).toBe(false);
  });
  it("an engine design without a battery never shows one", () => {
    const f: Facts = { annual_kwh: 4800 };
    const d = draftFor(f);
    d.design.battery = { ...d.design.battery, include: false, kwh: null };
    expect(revealFromFacts(f, d, true).battery).toBe(false);
  });
  it("EV: the car drives in when the re-draft adds a wallbox, and only then", () => {
    const ev: Facts = { annual_kwh: 4800, has_ev: true, ev_km_year: 15000 };
    expect(revealFromFacts(ev, draftFor(ev), true).car).toBe(true);
    const noEv: Facts = { annual_kwh: 4800, has_ev: false };
    expect(revealFromFacts(noEv, draftFor(noEv), true).car).toBe(false);
    const d = draftFor(ev);
    d.design.wallbox = { ...d.design.wallbox, include: false, kw: null };
    expect(revealFromFacts(ev, d, true).car).toBe(false);
  });
  it("gas or oil heating shows the heat pump option; a heat pump already there does not", () => {
    expect(revealFromFacts({ heating: "gas" }, null, true).heatpump).toBe(true);
    expect(revealFromFacts({ heating: "oil" }, null, true).heatpump).toBe(true);
    expect(revealFromFacts({ heating: "Gas boiler" }, null, true).heatpump).toBe(true);
    expect(revealFromFacts({ heating: "heat_pump" }, null, true).heatpump).toBe(false);
    expect(revealFromFacts({}, null, true).heatpump).toBe(false);
  });
  it("a design that includes a heat pump shows it regardless of the heating", () => {
    const f: Facts = { annual_kwh: 4800 };
    const d = draftFor(f);
    d.design.heatpump = { ...d.design.heatpump, include: true, kw: 10.5 };
    expect(revealFromFacts(f, d, true).heatpump).toBe(true);
  });
});

describe("stagedDesign: the house shows only what has been revealed, sizes untouched", () => {
  const f: Facts = { annual_kwh: 4800, has_ev: true, ev_km_year: 15000 };
  const d = draftFor(f);
  it("hides components not yet revealed by switching include off, never by changing a size", () => {
    const s = stagedDesign(d, { ...NONE, shell: true, warm: true, panels: true });
    expect(s.design.pv).toEqual(d.design.pv);
    expect(s.design.battery.include).toBe(false);
    expect(s.design.battery.kwh).toBe(d.design.battery.kwh);
    expect(s.design.wallbox.include).toBe(false);
  });
  it("everything revealed = the engine's design exactly", () => {
    const s = stagedDesign(d, { shell: true, warm: true, panels: true, battery: true, car: true, heatpump: true });
    expect(s.design).toEqual(d.design);
  });
  it("without a draft it returns the empty house", () => {
    const s = stagedDesign(null, { ...NONE, shell: true });
    expect(s).toBe(EMPTY_DESIGN);
    expect(s.design.pv.include || s.design.battery.include || s.design.wallbox.include || s.design.heatpump.include).toBe(false);
  });
  it("does not mutate the engine response", () => {
    const before = JSON.stringify(d);
    stagedDesign(d, NONE);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("stepToward: one new step at a time, removals at once", () => {
  it("adds the first missing step in build order", () => {
    const target: LiveReveal = { shell: true, warm: true, panels: true, battery: true, car: true, heatpump: false };
    let cur = NONE;
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const next = stepToward(cur, target);
      if (next === cur) break;
      seen.push(REVEAL_ORDER.find((k) => next[k] !== cur[k])!);
      cur = next;
    }
    expect(seen).toEqual(["shell", "warm", "panels", "battery", "car"]);
    expect(cur).toEqual(target);
  });
  it("turns everything off in one go (restart, new call)", () => {
    const all: LiveReveal = { shell: true, warm: true, panels: true, battery: true, car: true, heatpump: true };
    expect(stepToward(all, NONE)).toEqual(NONE);
  });
  it("returns the same object when nothing changes (no re-render)", () => {
    const cur = { ...NONE, shell: true };
    expect(stepToward(cur, { ...cur })).toBe(cur);
  });
});

describe("factsToHome keeps its semantics", () => {
  it("bill → rounded kWh, EV default 15,000 km, default 4,000 kWh", () => {
    expect(factsToHome({ monthly_bill_eur: 120 }).annual_kwh).toBe(4100);
    expect(factsToHome({ has_ev: true }).ev_km_year).toBe(15000);
    expect(factsToHome({}).annual_kwh).toBe(4000);
    expect(factsToHome({ annual_kwh: 4800 }).demand_is_default).toBe(false);
    expect(factsToHome({ heating: "gas", roof_type: "concrete_tile" })).toMatchObject({ heating: "Gas", roof_type: "Concrete tile" });
    expect(factsToHome({ existing_pv_kwp: 8 }).has_existing_pv).toBe(true);
  });
});
