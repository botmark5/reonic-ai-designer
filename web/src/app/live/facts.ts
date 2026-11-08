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
  /** /live only: yearly use the voice backend estimated (e.g. from household size); never sent as a caller fact. */
  annual_kwh_estimate?: number | null;
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

/** Keys of d-voice's calls.facts that are bookkeeping, not part of the engine Home. */
const NOT_HOME = new Set(["stated", "voice", "assumptions", "updated_fields", "facts_updated_at", "solar", "solar_for", "conversation_id"]);

export interface LiveCallState {
  /** What the caller said (chips). */
  facts: Facts;
  /** What goes to the engine. */
  home: Home;
  /** Enough to draft (a yearly use is known or derived). */
  ready: boolean;
  location?: { lat: number; lng: number; address?: string };
  updatedAt?: string;
}

/**
 * A calls row → the /live view. Rows written by update_facts carry the engine Home d-voice derived (the same home
 * create_design sends) plus the caller's raw answers under `voice`; older rows hold the answers directly.
 */
export function callToLive(row: { customer_name: string | null; address: string | null; facts: unknown }): LiveCallState {
  const raw = (row.facts && typeof row.facts === "object" ? row.facts : {}) as Record<string, unknown>;
  const voice = raw.voice && typeof raw.voice === "object" ? (raw.voice as Facts) : null;
  const solar = raw.solar as { lat?: unknown; lng?: unknown } | undefined;
  const address = row.address ?? voice?.address ?? (raw.address as string | undefined) ?? null;
  const location =
    solar && typeof solar.lat === "number" && typeof solar.lng === "number" && Number.isFinite(solar.lat) && Number.isFinite(solar.lng)
      ? { lat: solar.lat, lng: solar.lng, address: address ?? undefined }
      : undefined;
  const updatedAt = typeof raw.facts_updated_at === "string" ? raw.facts_updated_at : undefined;
  if (!voice) {
    const facts = { ...(raw as Facts), customer_name: (raw.customer_name as string) ?? row.customer_name, address };
    return { facts, home: factsToHome(facts), ready: facts.annual_kwh != null || facts.monthly_bill_eur != null, location, updatedAt };
  }
  const home = Object.fromEntries(Object.entries(raw).filter(([k]) => !NOT_HOME.has(k))) as unknown as Home;
  const estimate = voice.annual_kwh == null && typeof home.annual_kwh === "number" && home.annual_kwh > 0 ? home.annual_kwh : null;
  const facts: Facts = { ...voice, customer_name: row.customer_name ?? voice.customer_name ?? null, address, annual_kwh_estimate: estimate };
  return { facts, home, ready: typeof home.annual_kwh === "number" && home.annual_kwh > 0, location, updatedAt };
}
