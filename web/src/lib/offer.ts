/**
 * Homeowner offer: which choices a share allows, and resolving a share token to a design. SERVER ONLY.
 */
import "server-only";
import { DEFAULT_INSTALLER, engine } from "./engine";
import { getStore } from "./store";
import type { DesignRow } from "./supabase";
import type { DesignResponse, Home, Locks } from "./types";
import { EMPTY_LOCKS } from "./types";

export interface AllowedVariant {
  component: "battery" | "wallbox";
  values: (number | boolean)[];
}

export interface Offer {
  token: string;
  designId: string | null; // null for the demo token (not stored)
  customer: string | null;
  home: Home;
  locks: Locks;
  design: DesignResponse;
  allowed: AllowedVariant[];
}

export const DEMO_HOME: Home = {
  annual_kwh: 4800, price_eur_kwh: 0.32, load_profile: "H0", has_ev: true, ev_km_year: 15000, existing_pv_kwp: null,
  existing_battery_kwh: null, heating: "Gas", heating_demand_kwh: null, roof_type: "Concrete tile", house_sqm: null,
  inhabitants: 4, has_existing_pv: false,
};

/** Battery sizes and wallbox yes/no the homeowner may pick between (from the share, else from the engine's alternatives). */
export function defaultAllowed(d: DesignResponse): AllowedVariant[] {
  const sizes = new Set<number>([0, ...(d.design.battery.alternatives ?? []).map((a) => a.kwh), ...(d.design.battery.kwh ? [d.design.battery.kwh] : [])]);
  return [
    { component: "battery", values: [...sizes].sort((a, b) => a - b) },
    { component: "wallbox", values: [true, false] },
  ];
}

export function parseAllowed(raw: unknown, d: DesignResponse): AllowedVariant[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultAllowed(d);
  return raw.filter(
    (v): v is AllowedVariant => !!v && typeof v === "object" && ["battery", "wallbox"].includes((v as AllowedVariant).component) && Array.isArray((v as AllowedVariant).values),
  );
}

export async function getOffer(token: string): Promise<Offer | null> {
  if (token === "demo") {
    const design = await engine.design({ installer: DEFAULT_INSTALLER, home: DEMO_HOME, locks: EMPTY_LOCKS });
    return { token, designId: null, customer: null, home: DEMO_HOME, locks: EMPTY_LOCKS, design, allowed: defaultAllowed(design) };
  }
  const found = await getStore().getShare(token);
  if (!found) return null;
  const row: DesignRow = found.design;
  const design = row.design ?? (await engine.design({ installer: DEFAULT_INSTALLER, home: row.home, locks: row.locks }));
  return {
    token, designId: row.id, customer: row.customer_name, home: row.home, locks: { ...EMPTY_LOCKS, ...row.locks }, design,
    allowed: parseAllowed(found.share.allowed_variants, design),
  };
}

/** True if every chosen value is one the installer allowed. */
export function choiceAllowed(allowed: AllowedVariant[], choice: { battery_kwh?: number; wallbox?: boolean }): boolean {
  const ok = (c: "battery" | "wallbox", v: number | boolean | undefined) => {
    if (v === undefined) return true;
    const a = allowed.find((x) => x.component === c);
    return !!a && a.values.some((x) => (typeof x === "number" && typeof v === "number" ? Math.abs(x - v) < 0.01 : x === v));
  };
  return ok("battery", choice.battery_kwh) && ok("wallbox", choice.wallbox);
}
