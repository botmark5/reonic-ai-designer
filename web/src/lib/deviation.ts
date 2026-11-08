/** "Where we differ from the experts" on /reality: plain-language rows from /eval aggregates (no project rows). */
type Preds = Record<string, Record<string, number | null | undefined> | undefined>;
const num = (m: Record<string, number | null | undefined> | undefined, k: string) => (typeof m?.[k] === "number" ? (m[k] as number) : null);
const int = (s: string) => Number(s).toLocaleString("en-US");

/** Engine band keys ("0-2500", "4500-5500", "9000+" or "9000-inf") in plain words. */
export function bandLabel(key: string): string {
  const [lo, hi] = key.replace("+", "-inf").split("-");
  if (!hi || hi === "inf") return `over ${int(lo)} kWh`;
  if (Number(lo) === 0) return `under ${int(hi)} kWh`;
  return `${int(lo)}–${int(hi)} kWh`;
}

const lower = (key: string) => Number(key.split(/[-+]/)[0]);
export const MIN_BAND_N = 10;
const BIAS_KWP = 0.5;

export interface BandRow {
  key: string;
  label: string;
  n: number;
  ours: number;
  base: number | null;
  hardest: boolean;
  sentence: string;
}

export function bandRows(byBand: Record<string, Preds> | undefined, model = "design_model", baseline = "baseline_band_median"): BandRow[] {
  if (!byBand) return [];
  const rows = Object.entries(byBand)
    .map(([key, p]) => {
      const m = p[model];
      const n = num(m, "pv_n") ?? num(m, "n_projects") ?? 0;
      const ours = num(m, "pv_kwp_mae_when_both_pv");
      const bias = num(m, "pv_kwp_bias_when_both_pv");
      const sentence =
        bias == null || Math.abs(bias) < BIAS_KWP
          ? "Close to the experts on average."
          : `We size ${bias < 0 ? "smaller" : "larger"} than the experts here, by ${Math.abs(bias).toFixed(1)} kWp on average.`;
      return { key, label: bandLabel(key), n, ours, base: num(p[baseline], "pv_kwp_mae_when_both_pv"), hardest: false, sentence };
    })
    .filter((r): r is BandRow & { ours: number } => r.ours != null && r.n >= MIN_BAND_N)
    .sort((a, b) => lower(a.key) - lower(b.key));
  const worst = rows.reduce<BandRow | null>((w, r) => (!w || r.ours > w.ours ? r : w), null);
  if (worst) worst.hardest = true;
  return rows;
}

export interface TransferRow {
  key: string;
  from: string;
  to: string;
  ours: number | null;
  base: number | null;
  carries: boolean;
  sentence: string;
}

/** Installer ids, most held-out homes first: "Installer A" is the larger one, as in the README and pitch facts. */
export function installerOrder(byInstaller: Record<string, Record<string, Record<string, number | null | undefined>>> | undefined, model = "design_model"): string[] {
  const m = byInstaller?.[model] ?? {};
  return Object.keys(m).sort((a, b) => (num(m[b], "n_projects") ?? 0) - (num(m[a], "n_projects") ?? 0) || a.localeCompare(b));
}

export function transferRows(
  transfer: Record<string, Preds> | undefined,
  model = "design_model",
  baseline = "baseline_band_median",
  order: string[] = [],
): TransferRow[] {
  const entries = Object.entries(transfer ?? {});
  const seen = Array.from(new Set(entries.flatMap(([k]) => k.split("->").map((x) => x.trim())))).sort();
  const ids = [...order.filter((x) => seen.includes(x)), ...seen.filter((x) => !order.includes(x))];
  const name = (id: string) => `Installer ${String.fromCharCode(65 + ids.indexOf(id))}`;
  return entries
    .map(([key, p]) => {
      const [a, b] = key.split("->").map((x) => x.trim());
      const ours = num(p[model], "pv_kwp_mae_when_both_pv");
      const base = num(p[baseline], "pv_kwp_mae_when_both_pv");
      const carries = ours != null && base != null && ours < base;
      const from = name(a), to = name(b);
      const sentence = carries
        ? `Learned only on ${from}, it still beats the band median for ${to}.`
        : `Learned only on ${from}, it is weaker than the band median for ${to}: each installer has its own habits.`;
      return { key, from, to, ours, base, carries, sentence };
    })
    .sort((x, y) => x.from.localeCompare(y.from));
}
