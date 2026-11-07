"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { diffDesigns, sizeOf, type DesignDiff } from "@/lib/diff";
import type { DesignRow } from "@/lib/supabase";
import type {
  ComponentKey,
  Design,
  DesignResponse,
  Home,
  Locks,
  RefineResponse,
  ValidateResponse,
  ValidationFlag,
} from "@/lib/types";

export const INSTALLER = "2a8ba8e2";

export interface Change {
  id: number; // increments per change, keys the highlight animation
  diff: DesignDiff;
  note: string | null; // e.g. the refine summary or "You locked the battery at 10 kWh"
}

export interface PlannerState {
  row: DesignRow;
  home: Home;
  locks: Locks;
  response: DesignResponse | null;
  flags: ValidationFlag[];
  change: Change | null;
  busy: boolean;
  error: string | null;
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const LOCK_KEY: Record<ComponentKey, keyof Locks> = {
  pv: "pv_kwp",
  battery: "battery_kwh",
  wallbox: "wallbox",
  heatpump: "heatpump_kw",
};

/** Value to store in a lock for a component's current size. */
export function lockValue(d: Design, c: ComponentKey): number | boolean {
  if (c === "wallbox") return d.wallbox.include;
  return sizeOf(d, c) ?? 0;
}

function plannerDesign(d: Design) {
  return {
    pv_kwp: sizeOf(d, "pv") ?? 0,
    battery_kwh: sizeOf(d, "battery") ?? 0,
    wallbox: d.wallbox.include,
    heatpump_kw: sizeOf(d, "heatpump") ?? 0,
  };
}

export function usePlanner(initial: DesignRow) {
  const [s, setS] = useState<PlannerState>(() => ({
    row: initial,
    home: initial.home,
    locks: initial.locks,
    response: initial.design,
    flags: [],
    change: null,
    busy: !initial.design,
    error: null,
  }));
  const stateRef = useRef(s);
  stateRef.current = s;
  const abortRef = useRef<AbortController | null>(null);
  const changeId = useRef(0);

  const save = useCallback((patch: Partial<DesignRow>) => {
    const id = stateRef.current.row.id;
    fetch(`/api/designs/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(
      () => {},
    );
  }, []);

  const logOverride = useCallback((component: string, from: unknown, to: unknown, reason?: string | null) => {
    post("/api/overrides", { design_id: stateRef.current.row.id, component, from_value: from, to_value: to, reason: reason || null, by: "planner" }).catch(
      () => {},
    );
  }, []);

  const validate = useCallback(async (home: Home, d: Design, signal: AbortSignal) => {
    try {
      const v = await post<ValidateResponse>("/api/engine/validate", { installer: INSTALLER, home, design: plannerDesign(d) }, signal);
      if (!signal.aborted) setS((p) => ({ ...p, flags: v.flags }));
    } catch {}
  }, []);

  /** Re-run the engine for new inputs. The engine decides every size. */
  const run = useCallback(
    async (home: Home, locks: Locks, note: string | null = null) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const prev = stateRef.current.response?.design ?? null;
      setS((p) => ({ ...p, home, locks, busy: true, error: null }));
      try {
        const response = await post<DesignResponse>("/api/engine/design", { installer: INSTALLER, home, locks }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const diff = diffDesigns(prev, response.design);
        setS((p) => ({
          ...p,
          response,
          busy: false,
          change: diff.changed.length || note ? { id: ++changeId.current, diff, note } : p.change,
        }));
        save({ home, locks, design: response });
        validate(home, response.design, ctrl.signal);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setS((p) => ({ ...p, busy: false, error: (e as Error).message }));
      }
    },
    [save, validate],
  );

  // First load: a row without a design (e.g. fresh from a call) gets one; otherwise validate what is there.
  useEffect(() => {
    const st = stateRef.current;
    if (!st.response) run(st.home, st.locks);
    else {
      const ctrl = new AbortController();
      validate(st.home, st.response.design, ctrl.signal);
      return () => ctrl.abort();
    }
  }, [run, validate]);

  const setHomeField = useCallback(
    <K extends keyof Home>(key: K, value: Home[K]) => {
      const st = stateRef.current;
      if (st.home[key] === value) return;
      logOverride(`home.${String(key)}`, st.home[key], value);
      run({ ...st.home, [key]: value }, st.locks);
    },
    [logOverride, run],
  );

  const setHome = useCallback(
    (patch: Partial<Home>) => {
      const st = stateRef.current;
      for (const [k, v] of Object.entries(patch)) logOverride(`home.${k}`, st.home[k as keyof Home], v);
      run({ ...st.home, ...patch }, st.locks);
    },
    [logOverride, run],
  );

  /** Fix a component at a value (planner's choice); later steps of the chain adapt. */
  const setLock = useCallback(
    (c: ComponentKey, value: number | boolean | null, reason?: string | null) => {
      const st = stateRef.current;
      const key = LOCK_KEY[c];
      const from = st.response ? lockValue(st.response.design, c) : null;
      logOverride(c, from, value, reason ?? (value === null ? "unlocked" : null));
      run(st.home, { ...st.locks, [key]: value } as Locks);
    },
    [logOverride, run],
  );

  /** Apply a refine result (from the agent or engine /refine). */
  const applyRefine = useCallback(
    (r: Pick<RefineResponse, "home" | "locks" | "design" | "summary">) => {
      const st = stateRef.current;
      const diff = diffDesigns(st.response?.design, r.design.design);
      logOverride("refine", { home: st.home, locks: st.locks }, { home: r.home, locks: r.locks }, r.summary);
      setS((p) => ({
        ...p,
        home: r.home,
        locks: r.locks,
        response: r.design,
        busy: false,
        change: { id: ++changeId.current, diff, note: r.summary },
      }));
      save({ home: r.home, locks: r.locks, design: r.design });
      const ctrl = new AbortController();
      validate(r.home, r.design.design, ctrl.signal);
    },
    [logOverride, save, validate],
  );

  const setStatus = useCallback(
    (status: DesignRow["status"]) => {
      setS((p) => ({ ...p, row: { ...p.row, status } }));
      save({ status });
    },
    [save],
  );

  const share = useCallback(async () => {
    const st = stateRef.current;
    if (!st.response) return null;
    const d = st.response.design;
    const sizes = new Set<number>([0, ...(d.battery.alternatives ?? []).map((a) => a.kwh), ...(d.battery.kwh ? [d.battery.kwh] : [])]);
    const allowed = [
      { component: "battery", values: [...sizes].sort((a, b) => a - b) },
      { component: "wallbox", values: [true, false] },
    ];
    try {
      const r = await post<{ token: string; path: string }>("/api/shares", { design_id: st.row.id, allowed_variants: allowed });
      setS((p) => ({ ...p, row: { ...p.row, status: "sent" } }));
      return r;
    } catch (e) {
      toast.error("Could not create the link", { description: (e as Error).message });
      return null;
    }
  }, []);

  return { s, run, setHomeField, setHome, setLock, applyRefine, setStatus, share, logOverride };
}

export type Planner = ReturnType<typeof usePlanner>;
