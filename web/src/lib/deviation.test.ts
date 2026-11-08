import { describe, expect, it } from "vitest";
import { bandLabel, bandRows, transferRows } from "./deviation";

describe("bandLabel", () => {
  it("reads engine band keys in plain words", () => {
    expect(bandLabel("0-2500")).toBe("under 2,500 kWh");
    expect(bandLabel("4500-5500")).toBe("4,500–5,500 kWh");
    expect(bandLabel("9000+")).toBe("over 9,000 kWh");
    expect(bandLabel("9000-inf")).toBe("over 9,000 kWh");
  });
});

describe("bandRows", () => {
  const byBand = {
    "0-2500": { design_model: { n_projects: 30, pv_n: 25, pv_kwp_mae_when_both_pv: 1.2, pv_kwp_bias_when_both_pv: 0.1 }, baseline_band_median: { pv_kwp_mae_when_both_pv: 1.4 } },
    "9000+": { design_model: { n_projects: 22, pv_n: 21, pv_kwp_mae_when_both_pv: 4.1, pv_kwp_bias_when_both_pv: -1.6 }, baseline_band_median: { pv_kwp_mae_when_both_pv: 4.5 } },
    "4500-5500": { design_model: { n_projects: 4, pv_n: 3, pv_kwp_mae_when_both_pv: 9 } },
  };
  it("orders bands by consumption, marks the hardest, explains the bias, skips tiny bands", () => {
    const rows = bandRows(byBand);
    expect(rows.map((r) => r.key)).toEqual(["0-2500", "9000+"]);
    expect(rows[1]).toMatchObject({ ours: 4.1, base: 4.5, hardest: true });
    expect(rows[1].sentence).toBe("We size smaller than the experts here, by 1.6 kWp on average.");
    expect(rows[0].sentence).toBe("Close to the experts on average.");
    expect(rows[0].hardest).toBe(false);
  });
  it("is empty without by_band", () => {
    expect(bandRows(undefined)).toEqual([]);
  });
});

describe("transferRows", () => {
  it("names installers A/B and says whether the engine carries over", () => {
    const rows = transferRows({
      "bbb->aaa": { design_model: { pv_kwp_mae_when_both_pv: 2.8 }, baseline_band_median: { pv_kwp_mae_when_both_pv: 3.2 } },
      "aaa->bbb": { design_model: { pv_kwp_mae_when_both_pv: 3.4 }, baseline_band_median: { pv_kwp_mae_when_both_pv: 3.0 } },
    });
    expect(rows[0]).toMatchObject({ from: "Installer A", to: "Installer B", ours: 3.4, base: 3.0, carries: false });
    expect(rows[1]).toMatchObject({ from: "Installer B", to: "Installer A", carries: true });
    expect(rows[1].sentence).toBe("Learned only on Installer B, it still beats the band median for Installer A.");
    expect(rows[0].sentence).toBe("Learned only on Installer A, it is weaker than the band median for Installer B: each installer has its own habits.");
  });
});
