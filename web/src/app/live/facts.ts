import type { Home } from "@/lib/types";

/** Facts as the voice agent stores them (lib/voice.ts VoiceFacts), all optional. */
export interface Facts {
  customer_name?: string | null;
  address?: string | null;
  annual_kwh?: number | null;
  monthly_bill_eur?: number | null;
  household?: number | null;
  has_ev?: boolean | null;
  ev_km_year?: number | null;
  heating?: string | null;
  heating_age_years?: number | null;
  roof_type?: string | null;
  roof_direction?: string | null;
  has_existing_pv?: boolean | null;
  existing_pv_kwp?: number | null;
  existing_battery_kwh?: number | null;
}

export const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The call's facts as an engine Home (same rules the planner inbox uses). */
export function factsToHome(f: Facts): Home {
  return {
    annual_kwh: f.annual_kwh ?? (f.monthly_bill_eur ? Math.round((f.monthly_bill_eur * 12) / 0.35 / 100) * 100 : 4000),
    price_eur_kwh: 0.32, load_profile: "H0", has_ev: !!f.has_ev, ev_km_year: f.has_ev ? (f.ev_km_year ?? 15000) : null,
    existing_pv_kwp: f.existing_pv_kwp ?? null, existing_battery_kwh: f.existing_battery_kwh ?? null,
    heating: f.heating ? pretty(f.heating) : null, heating_demand_kwh: null,
    roof_type: f.roof_type ? pretty(f.roof_type) : null, house_sqm: null, inhabitants: f.household ?? null,
    has_existing_pv: f.has_existing_pv ?? (f.existing_pv_kwp != null ? f.existing_pv_kwp > 0 : null),
    demand_is_default: f.annual_kwh != null ? false : null,
  };
}
