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

/** engine/evaluate.py step_index: 0 = no battery, 1 = smallest catalogue size, ... (nearest size). */
export function stepIndex(kwh: number | null, catalogue: number[]): number {
  const steps = [0, ...[...new Set(catalogue)].sort((x, y) => x - y)];
  const v = kwh ?? 0;
  return steps.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(steps[best] - v) ? i : best), 0);
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

  // Battery exactly like evaluate.py: "no battery" is step 0, a hit is within one step of the offered range.
  const steps = variants.map((x) => stepIndex(x.battery_kwh, batteryCatalogue));
  const lo = Math.min(...steps), hi = Math.max(...steps);
  const sOurs = stepIndex(ours.battery, batteryCatalogue);
  const sPrimary = stepIndex(primary?.battery_kwh ?? null, batteryCatalogue);
  const battery =
    sOurs === sPrimary
      ? V("match", "Match")
      : variants.length > 1 && sOurs >= lo && sOurs <= hi
        ? V("range", "Inside offered range")
        : sOurs >= lo - 1 && sOurs <= hi + 1
          ? V("close", "One size step away")
          : sOurs === 0
            ? V("missing", "Expert offered one")
            : hi === 0
              ? V("extra", "Expert offered none")
              : V("off", "Different from the expert");

  // Wallbox and heat pump yes/no are scored against the expert's primary option (as in the metrics).
  const expertWb = !!primary?.has_wallbox;
  const wallbox = ours.wallbox === expertWb ? V("match", "Match") : ours.wallbox ? V("extra", "Expert offered none") : V("missing", "Expert offered one");

  const expertHp = (primary?.heatpump_kw ?? 0) > 0;
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

// ---------------------------------------------------------------------------
// Headline metrics: our model vs the BEST simple baseline for each metric (named), read live from /eval.
// ---------------------------------------------------------------------------
export interface HeadlineDef {
  key: string;
  label: string;
  better: "lower" | "higher";
  unit: "kWp" | "%";
  note?: string;
}

export const HEADLINES: HeadlineDef[] = [
  { key: "pv_kwp_mae_all_projects", label: "Solar size error, all homes", better: "lower", unit: "kWp", note: "An unwanted or missing system counts as an error." },
  { key: "pv_variant_hit_tolerant_pct", label: "Solar inside the expert's range", better: "higher", unit: "%", note: "Within 1 kWp of any variant the expert offered." },
  { key: "pv_kwp_mae_when_both_pv", label: "Solar size error, where both chose solar", better: "lower", unit: "kWp" },
  { key: "has_battery_accuracy", label: "Battery yes or no right", better: "higher", unit: "%", note: "The simple rule always guesses the majority answer." },
  { key: "has_wallbox_accuracy", label: "Wallbox yes or no right", better: "higher", unit: "%", note: "The simple rule always guesses the majority answer." },
];

export const BASELINE_NAME: Record<string, string> = {
  baseline_band_median: "consumption-band median",
  baseline_kwh_per_1000: "kWh ÷ 1000 rule",
  baseline_kwp_per_mwh: "kWp-per-MWh rule",
};

export interface Headline extends HeadlineDef {
  ours: number | null;
  base: number | null;
  baseName: string | null;
  /** null = no comparison possible or a tie at the shown precision */
  wins: boolean | null;
  tie: boolean;
}

type Metrics = Record<string, Record<string, number | null | undefined>>;

/** Add-on sales (battery retrofits, extensions, wallbox only): a separate small block, never mixed into the headline. */
export const ADDON_HEADLINES: HeadlineDef[] = [
  { key: "has_pv_accuracy", label: "No new solar where none was sold", better: "higher", unit: "%" },
  { key: "has_battery_accuracy", label: "Battery yes or no right", better: "higher", unit: "%" },
  { key: "battery_within_one_step_pct", label: "Battery within one size step", better: "higher", unit: "%" },
];

/** Share of held-out homes whose expert PV lies inside our P10–P90 range (target 80 %). Key names tolerated. */
export const COVERAGE_KEYS = ["pv_interval_coverage_pct", "pv_p10_p90_coverage_pct", "pv_range_coverage_pct"];
export function coverage(m: Record<string, number | null | undefined> | undefined): number | null {
  for (const k of COVERAGE_KEYS) if (typeof m?.[k] === "number") return m[k] as number;
  return null;
}

/** Minimum homes behind a coverage number before we show it (pv_n = homes where both chose solar). */
export const MIN_COVERAGE_N = 20;

type EvalLike = {
  metrics: Metrics;
  segments?: Record<string, Metrics>;
  with_existing_pv_answer?: { metrics?: Metrics; segments?: Record<string, Metrics> };
};
const nonEmpty = (m: Metrics | undefined) => (m && Object.keys(m).length ? m : null);

/**
 * Where the headline numbers come from. Answered mode (the planner answered "Solar already on the roof?", as in the
 * planner and the pitch) when /eval reports it, else the unanswered numbers. Within a mode: new full systems when
 * that slice exists, else all projects; add-on sales separately.
 */
export function headlineSource(e: EvalLike) {
  const a = e.with_existing_pv_answer;
  const answered = !!(nonEmpty(a?.segments?.full_designs) || nonEmpty(a?.metrics));
  const mode = answered ? { metrics: a?.metrics ?? e.metrics, segments: a?.segments } : { metrics: e.metrics, segments: e.segments };
  const full = nonEmpty(mode.segments?.full_designs);
  return { metrics: full ?? mode.metrics, overall: mode.metrics, fullOnly: !!full, addOns: nonEmpty(mode.segments?.add_ons), answered };
}

/** Coverage only when enough homes stand behind it (pv_n >= MIN_COVERAGE_N; older /eval without pv_n: n_projects). */
export function trustedCoverage(m: Record<string, number | null | undefined> | undefined): number | null {
  const c = coverage(m);
  const nBoth = typeof m?.pv_n === "number" ? m.pv_n : typeof m?.n_projects === "number" ? m.n_projects : null;
  return c != null && nBoth != null && nBoth >= MIN_COVERAGE_N ? c : null;
}

export function headlines(metrics: Metrics, model = "design_model", defs: HeadlineDef[] = HEADLINES): Headline[] {
  const baselines = Object.keys(metrics).filter((k) => k.startsWith("baseline_"));
  return defs.map((h) => {
    const ours = metrics[model]?.[h.key] ?? null;
    let base: number | null = null;
    let baseName: string | null = null;
    for (const b of baselines) {
      const v = metrics[b]?.[h.key];
      if (typeof v !== "number") continue;
      if (base == null || (h.better === "lower" ? v < base : v > base)) {
        base = v;
        baseName = BASELINE_NAME[b] ?? b.replace("baseline_", "").replace(/_/g, " ");
      }
    }
    // compare at the precision shown (kWp 2 decimals, % whole numbers): a tie on screen is a tie, not a loss
    const shown = (x: number) => (h.unit === "kWp" ? Math.round(x * 100) : Math.round(x));
    const tie = typeof ours === "number" && base != null && shown(ours) === shown(base);
    const wins = ours == null || base == null || tie ? null : h.better === "lower" ? ours < base : ours > base;
    return { ...h, ours: typeof ours === "number" ? ours : null, base, baseName, wins, tie };
  });
}
