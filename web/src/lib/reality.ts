/**
 * Ours vs the expert, per component, with the same tolerances as engine/evaluate.py:
 * PV ±1 kWp, battery ±1 catalogue step, and anything inside the expert's offered variant range counts as a hit.
 */
import type { ExpertVariant } from "./types";

export type VerdictKind = "match" | "range" | "close" | "option" | "off" | "missing" | "extra";
export interface Verdict {
  kind: VerdictKind;
  label: string;
  hit: boolean;
}

export interface OurSizes {
  pv: number | null; // null = none
  battery: number | null;
  wallbox: boolean;
  heatpump: number | null;
  heatpumpOption: number | null; // heat pump offered as a customer option
}

const PV_TOL = 1;
const V = (kind: VerdictKind, label: string): Verdict => ({ kind, label, hit: ["match", "range", "close", "option"].includes(kind) });

function steps(cat: number[], a: number, b: number) {
  const sorted = [...new Set(cat)].sort((x, y) => x - y);
  const idx = (x: number) => sorted.reduce((best, s, i) => (Math.abs(s - x) < Math.abs(sorted[best] - x) ? i : best), 0);
  return sorted.length ? Math.abs(idx(a) - idx(b)) : Math.abs(a - b) > 0.01 ? 99 : 0;
}

function sizeVerdict(ours: number | null, expert: (number | null)[], primary: number | null, tol: (a: number, b: number) => boolean): Verdict {
  const offered = expert.filter((x): x is number => x != null && x > 0);
  const oursYes = ours != null && ours > 0;
  if (!offered.length) return oursYes ? V("extra", "Expert offered none") : V("match", "Match");
  if (!oursYes) return V("missing", "Expert offered one");
  const p = primary && primary > 0 ? primary : offered[0];
  if (tol(ours!, p)) return V("match", "Match");
  const lo = Math.min(...offered), hi = Math.max(...offered);
  if (offered.length > 1 && ours! >= lo - 1e-9 && ours! <= hi + 1e-9) return V("range", "Inside offered range");
  if (offered.length > 1 && (tol(ours!, lo) || tol(ours!, hi))) return V("range", "At the edge of the offered range");
  return V("off", "Different from the expert");
}

export function verdicts(ours: OurSizes, variants: ExpertVariant[], batteryCatalogue: number[]) {
  const primary = variants.find((v) => v.is_primary) ?? variants[0];
  const pv = sizeVerdict(ours.pv, variants.map((v) => v.pv_kwp), primary?.pv_kwp ?? null, (a, b) => Math.abs(a - b) <= PV_TOL + 1e-9);

  let battery = sizeVerdict(ours.battery, variants.map((v) => v.battery_kwh), primary?.battery_kwh ?? null, (a, b) => Math.abs(a - b) < 0.01);
  if (battery.kind === "off" && ours.battery && primary?.battery_kwh && steps(batteryCatalogue, ours.battery, primary.battery_kwh) <= 1)
    battery = V("close", "One size step away");

  const expertWb = variants.some((v) => v.has_wallbox);
  const wallbox = ours.wallbox === expertWb ? V("match", "Match") : ours.wallbox ? V("extra", "Expert offered none") : V("missing", "Expert offered one");

  const expertHp = variants.some((v) => (v.heatpump_kw ?? 0) > 0);
  const oursHp = (ours.heatpump ?? 0) > 0;
  const heatpump = expertHp
    ? oursHp
      ? V("match", "Match")
      : ours.heatpumpOption
        ? V("option", "Offered as customer option")
        : V("missing", "Expert offered one")
    : oursHp
      ? V("extra", "Expert offered none")
      : V("match", "Match");

  return { pv, battery, wallbox, heatpump };
}
