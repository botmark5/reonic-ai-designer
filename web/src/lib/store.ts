/**
 * Persistence for designs, overrides and shares. SERVER ONLY.
 * Uses Supabase (service role) when configured; otherwise an in-memory store seeded with example rows,
 * so the planner, share links and the demo work without a database (single server process only).
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getServerSupabase, type DesignRow, type Insert, type OverrideRow, type ShareRow } from "./supabase";
import type { Home, Locks } from "./types";
import { EMPTY_LOCKS } from "./types";

export type DesignPatch = Partial<Pick<DesignRow, "home" | "locks" | "design" | "status" | "explanation" | "customer_name" | "address">>;

export interface Store {
  kind: "supabase" | "memory";
  listDesigns(limit?: number): Promise<DesignRow[]>;
  getDesign(id: string): Promise<DesignRow | null>;
  createDesign(row: Insert<DesignRow>): Promise<DesignRow>;
  updateDesign(id: string, patch: DesignPatch): Promise<DesignRow | null>;
  addOverride(row: Insert<OverrideRow>): Promise<OverrideRow>;
  createShare(designId: string, allowedVariants: unknown[]): Promise<ShareRow>;
  getShare(token: string): Promise<{ share: ShareRow; design: DesignRow } | null>;
}

export const shareToken = () => randomBytes(9).toString("base64url"); // 12 url-safe chars

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
function supabaseStore(): Store | null {
  const db = getServerSupabase();
  if (!db) return null;
  const one = <T>(r: { data: T | null; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    kind: "supabase",
    listDesigns: async (limit = 50) =>
      one(await db.from("designs").select("*").order("created_at", { ascending: false }).limit(limit)) ?? [],
    getDesign: async (id) => one(await db.from("designs").select("*").eq("id", id).maybeSingle()),
    createDesign: async (row) => one(await db.from("designs").insert(row).select().single())!,
    updateDesign: async (id, patch) => one(await db.from("designs").update(patch).eq("id", id).select().maybeSingle()),
    addOverride: async (row) => one(await db.from("overrides").insert(row).select().single())!,
    createShare: async (design_id, allowed_variants) =>
      one(await db.from("shares").insert({ token: shareToken(), design_id, allowed_variants }).select().single())!,
    getShare: async (token) => {
      const share = one(await db.from("shares").select("*").eq("token", token).maybeSingle()) as ShareRow | null;
      if (!share) return null;
      const design = one(await db.from("designs").select("*").eq("id", share.design_id).maybeSingle()) as DesignRow | null;
      return design ? { share, design } : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Memory (dev / no database)
// ---------------------------------------------------------------------------
const home = (h: Partial<Home>): Home => ({
  annual_kwh: 4500, price_eur_kwh: 0.32, load_profile: "H0", has_ev: false, ev_km_year: null, existing_pv_kwp: null,
  existing_battery_kwh: null, heating: "Gas", heating_demand_kwh: null, roof_type: null, house_sqm: null, inhabitants: null, ...h,
});
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** Example homes for an empty inbox (memory store, or a fresh Supabase table). */
export function exampleDesigns(): DesignRow[] {
  const row = (r: Partial<DesignRow> & Pick<DesignRow, "customer_name" | "home">): DesignRow => ({
    id: randomUUID(), created_at: ago(0), call_id: null, source: "planner", status: "draft", address: null,
    locks: { ...EMPTY_LOCKS }, design: null, explanation: null, ...r,
  });
  return [
    row({ customer_name: "Weber, Augsburg", source: "voice", created_at: ago(4),
      home: home({ annual_kwh: 4800, has_ev: true, ev_km_year: 15000, inhabitants: 4, roof_type: "Concrete tile" }),
      locks: { ...EMPTY_LOCKS, wallbox: true } }),
    row({ customer_name: "Huber, Landsberg", status: "review", created_at: ago(62),
      home: home({ annual_kwh: 6200, heating: "Oil", inhabitants: 5 }) }),
    row({ customer_name: "Schmidt, Friedberg", status: "sent", created_at: ago(60 * 26),
      home: home({ annual_kwh: 3400, inhabitants: 2, heating: "Heat pump" }) }),
  ];
}

type Mem = { designs: DesignRow[]; overrides: OverrideRow[]; shares: ShareRow[] };
const g = globalThis as unknown as { __reonicStore?: Mem };

function memoryStore(): Store {
  const m = (g.__reonicStore ??= { designs: exampleDesigns(), overrides: [], shares: [] });
  const find = (id: string) => m.designs.find((d) => d.id === id) ?? null;
  return {
    kind: "memory",
    listDesigns: async (limit = 50) => [...m.designs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit),
    getDesign: async (id) => find(id),
    createDesign: async (row) => {
      const d: DesignRow = { id: randomUUID(), created_at: new Date().toISOString(), ...row } as DesignRow;
      m.designs.push(d);
      return d;
    },
    updateDesign: async (id, patch) => {
      const d = find(id);
      if (!d) return null;
      Object.assign(d, patch);
      return d;
    },
    addOverride: async (row) => {
      const o: OverrideRow = { id: randomUUID(), created_at: new Date().toISOString(), ...row } as OverrideRow;
      m.overrides.push(o);
      return o;
    },
    createShare: async (design_id, allowed_variants) => {
      const s: ShareRow = { token: shareToken(), design_id, allowed_variants, created_at: new Date().toISOString() };
      m.shares.push(s);
      return s;
    },
    getShare: async (token) => {
      const share = m.shares.find((s) => s.token === token);
      const design = share ? find(share.design_id) : null;
      return share && design ? { share, design } : null;
    },
  };
}

export function getStore(): Store {
  return supabaseStore() ?? memoryStore();
}

/** Starting values for a new home. Not 4,500 kWh: that is Reonic's placeholder default and reads as a retrofit to the engine. */
export const NEW_HOME: Home = home({ annual_kwh: 4000, heating: null });
export const NEW_LOCKS: Locks = { ...EMPTY_LOCKS };
