import { describe, expect, it } from "vitest";
import { rankForHouseNumber, stripCountry, typedHouseNumber } from "./address-rank";

const s = (main: string, secondary: string) => ({ main, secondary, text: `${main}, ${secondary}` });

describe("typedHouseNumber", () => {
  it("reads the number after the street, not the postcode", () => {
    expect(typedHouseNumber("Ungererstraße 80")).toBe("80");
    expect(typedHouseNumber("Ungererstraße 80a, München")).toBe("80a");
    expect(typedHouseNumber("Schweidnitzer Str. 59 a")).toBe("59 a");
    expect(typedHouseNumber("Ungererstraße")).toBeNull();
    expect(typedHouseNumber("80939 München")).toBeNull();
    expect(typedHouseNumber("München")).toBeNull();
  });
});

describe("rankForHouseNumber", () => {
  it("puts suggestions with the typed number first and drops number-less ones", () => {
    const r = rankForHouseNumber("Ungererstraße 80", [s("Ungererstraße", "80939 München"), s("Ungererstraße 80", "München"), s("Ungererstraße 8", "München")]);
    expect(r.map((x) => x.main)).toEqual(["Ungererstraße 80"]);
  });

  it("keeps the typed number when Google only knows the street", () => {
    const r = rankForHouseNumber("Ungererstraße 80", [s("Ungererstraße", "80939 München, Deutschland")]);
    expect(r).toEqual([{ main: "Ungererstraße 80", secondary: "80939 München, Deutschland", text: "Ungererstraße 80, 80939 München, Deutschland" }]);
  });

  it("changes nothing while no number is typed", () => {
    const list = [s("München", "Deutschland"), s("Münchener Str.", "Berlin")];
    expect(rankForHouseNumber("Münch", list)).toEqual(list);
  });
});

describe("stripCountry", () => {
  it("drops a trailing Deutschland / Germany only", () => {
    expect(stripCountry("Ungererstraße 80, München-Schwabing-Freimann, Deutschland")).toBe("Ungererstraße 80, München-Schwabing-Freimann");
    expect(stripCountry("Deutschlandstraße 1, Berlin")).toBe("Deutschlandstraße 1, Berlin");
  });
});
