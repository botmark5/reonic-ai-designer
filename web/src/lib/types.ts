/**
 * Engine API types. Source of truth: docs/api.md (v0). Fields the engine returns on top of v0
 * (see engine/README.md "API additions") are optional here, so the mock and older engines still type-check.
 * Shared by sessions B (web), C (3D house) and D (voice): change only together with docs/api.md.
 */

export type InstallerId = string; // e.g. "2a8ba8e2", "23c108b7"

export type LoadProfile = "H0" | (string & {});
export type Heating = "Gas" | "Oil" | "Heat pump" | "Electric" | "District" | "Wood" | (string & {});

/** The home as the planner (or the voice agent) describes it. */
export interface Home {
  annual_kwh: number;
  price_eur_kwh: number | null;
  load_profile: LoadProfile | null;
  has_ev: boolean;
  ev_km_year: number | null;
  existing_pv_kwp: number | null;
  existing_battery_kwh: number | null;
  heating: Heating | null;
  heating_demand_kwh: number | null;
  roof_type: string | null;
  house_sqm: number | null;
  inhabitants: number | null;
  // optional extras accepted by the engine (not in api.md v0)
  existing_wallbox?: boolean;
  orientation_deg?: number | null; // 180 = south
  tilt_deg?: number | null;
  offer_date?: string | null; // ISO date; empty = today
}

/** Components the planner has fixed. null = engine decides. 0 = "none" (no PV / no battery / no heat pump). */
export interface Locks {
  pv_kwp: number | null;
  battery_kwh: number | null;
  wallbox: boolean | null;
  heatpump_kw: number | null;
}

export type ComponentKey = "pv" | "battery" | "wallbox" | "heatpump";

export interface DesignRequest {
  installer: InstallerId;
  home: Home;
  locks: Locks;
}

interface ComponentBase {
  include: boolean;
  confidence: number; // 0..1
  reasons: string[];
}

export interface PvDesign extends ComponentBase {
  kwp: number | null;
  range: [number, number];
}

export interface BatteryAlternative {
  kwh: number;
  share: number; // probability among catalogue sizes, 0..1
}

export interface BatteryDesign extends ComponentBase {
  kwh: number | null;
  range: [number, number];
  alternatives?: BatteryAlternative[];
}

export interface WallboxDesign extends ComponentBase {
  kw: number | null;
}

export interface HeatpumpOptionInfo {
  available: boolean;
  kw: number | null;
  reasons: string[];
}

export interface HeatpumpDesign extends ComponentBase {
  kw: number | null;
  option?: HeatpumpOptionInfo;
}

export interface Design {
  pv: PvDesign;
  battery: BatteryDesign;
  wallbox: WallboxDesign;
  heatpump: HeatpumpDesign;
}

export type FlagLevel = "ok" | "info" | "warn" | "error";

export interface PhysicsFlag {
  component: ComponentKey | "home";
  level: FlagLevel;
  code: string;
  message: string;
}

export interface Physics {
  yield_kwh: number;
  self_consumption: number; // 0..1
  autarky: number; // 0..1
  warnings: string[];
  // engine extras
  load_kwh?: number;
  grid_import_kwh?: number;
  feed_in_kwh?: number;
  battery_cycles?: number;
  flags?: PhysicsFlag[];
  assumptions?: string[];
}

export interface Economics {
  capex_total_eur: number;
  savings_first_year_eur: number;
  payback_years: number | null;
  savings_lifetime_eur: number;
  assumptions: string[];
}

export interface VariantSummary {
  pv_kwp: number | null;
  battery_kwh: number | null;
  heatpump_kw: number | null;
  capex_total_eur: number;
  savings_first_year_eur: number;
  heating_savings_eur: number;
  payback_years: number | null;
  net_benefit_lifetime_eur: number;
  autarky: number;
  load_kwh: number;
}

/** The heat pump as a customer choice: the full design with and without it. */
export type HeatpumpChoice =
  | { available: false; reasons: string[] }
  | {
      available: true;
      included: boolean;
      kw: number;
      reasons: string[];
      with_heatpump: VariantSummary;
      without_heatpump: VariantSummary;
      difference: {
        extra_investment_eur: number;
        extra_savings_per_year_eur: number;
        extra_net_benefit_lifetime_eur: number;
      };
      how_to_choose?: string;
    };

export interface SimilarHome {
  project_id: string;
  annual_kwh: number;
  pv_kwp: number;
  battery_kwh: number | null;
  similarity: number; // 0..1
}

export interface DesignResponse {
  design: Design;
  physics: Physics;
  similar_homes: SimilarHome[];
  facts_for_explanation: Record<string, unknown>;
  model_version: string;
  // engine extras
  economics?: Economics;
  options?: { heatpump?: HeatpumpChoice };
}

/** The planner's chosen design, as sent to /validate. */
export interface PlannerDesign {
  pv_kwp: number | null;
  battery_kwh: number | null;
  wallbox: boolean | null;
  heatpump_kw: number | null;
}

export interface ValidateRequest {
  installer: InstallerId;
  home: Home;
  design: PlannerDesign;
}

export interface ValidationFlag {
  component: ComponentKey | "home";
  level: FlagLevel;
  percentile: number | null;
  message: string;
  code?: string;
}

export interface ValidateResponse {
  flags: ValidationFlag[];
}

export interface RefineRequest {
  text: string;
  home: Home;
  locks: Locks;
  installer?: InstallerId;
}

export interface RefineResponse {
  changes: Partial<Home> & Partial<Locks>;
  design: DesignResponse;
  // engine extras
  summary?: string;
  parsed_by?: string;
  home?: Home;
  locks?: Locks;
}

export type Audience = "planner" | "homeowner";

export interface ExplainRequest {
  design_response: DesignResponse;
  audience: Audience;
  language?: "en" | "de";
}

/** Metric name -> value, e.g. { pv_mae_kwp: 2.7, pv_variant_hit: 0.4 }. Names are set by engine/evaluate.py. */
export type MetricSet = Record<string, number | null>;

export interface EvalResponse {
  /** predictor name (model + baselines) -> metrics */
  metrics: Record<string, MetricSet>;
  /** predictor name -> installer -> metrics */
  by_installer: Record<string, Record<InstallerId, MetricSet>>;
  /** names of the baseline predictors, e.g. ["band_median", "kwh_div_1000"] */
  baselines: string[] | Record<string, unknown>;
  // engine extras
  protocol?: Record<string, unknown>;
  transfer?: Record<string, Record<string, MetricSet>>;
  labels_source?: string;
}

/** One option of an expert offer (a project can have several variants). */
export interface ExpertVariant {
  option_number: number;
  is_primary: boolean;
  pv_kwp: number | null;
  battery_kwh: number | null;
  has_wallbox: boolean | null;
  heatpump_kw: number | null;
}

export interface ProjectResponse {
  home: Home;
  expert: ExpertVariant | null;
  variants: ExpertVariant[];
  ours: DesignResponse | null;
  // engine extras
  project_id?: string;
  installer?: InstallerId;
}

export const EMPTY_LOCKS: Locks = { pv_kwp: null, battery_kwh: null, wallbox: null, heatpump_kw: null };
