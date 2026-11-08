"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { DesignResponse, Home } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useReducedMotion, useThemeName } from "./hooks";
import { roofPlanes } from "./houseGeometry";
import { ALLOWED, INSIDE_KEYS, ZONE_ORDER, ZONES, defaultPlacement, drop, moveTo, type InsideKey, type Placement, type Zone } from "./insideRules";
import { getPalette } from "./palette";
import { buildSceneSpec } from "./sceneSpec";
import type { House3DMode } from "./types";

const Inside = dynamic(() => import("./Inside"), { ssr: false });

const NAME: Record<InsideKey, string> = { battery: "Battery", inverter: "Inverter", heatpump: "Heat pump", wallbox: "Wallbox" };
const DOT: Record<InsideKey, string> = { battery: "bg-comp-battery", inverter: "bg-comp-pv", heatpump: "bg-comp-heatpump", wallbox: "bg-comp-wallbox" };

export interface InsideStageProps {
  design: DesignResponse;
  home: Home;
  mode: House3DMode;
  /** Show the zone pickers under the model. */
  controls: boolean;
  /** Where the parts start (e.g. a battery the planner already put in the basement). Default: garage/outside. */
  zones?: Partial<Record<InsideKey, Zone>>;
  onZonesChange?: (p: Partial<Record<InsideKey, Zone>>) => void;
  className?: string;
}

/**
 * Inside the house as a simple section: basement, garage, outside wall. The planner drags each part of the system
 * into a zone (or picks it from the list); parts snap into place and only go where they belong.
 */
export function InsideStage({ design, home, mode, controls, zones, onZonesChange, className }: InsideStageProps) {
  const theme = useThemeName();
  const reduced = useReducedMotion();
  const palette = useMemo(() => getPalette(theme), [theme]);
  const spec = useMemo(() => buildSceneSpec(design, home, mode, roofPlanes), [design, home, mode]);
  const keys = INSIDE_KEYS.filter((k) => spec.components[k].visible);
  const keysKey = keys.join(",");
  const start = () => {
    let p = defaultPlacement(keys);
    for (const k of keys) {
      const z = zones?.[k];
      const r = z ? moveTo(p, k, z) : null;
      if (r?.ok) p = r.placement;
    }
    return p;
  };
  const [state, setState] = useState<{ for: string; p: Placement }>(() => ({ for: keysKey, p: start() }));
  // a new design with other parts starts from the defaults again
  const placement = state.for === keysKey ? state.p : start();
  const [message, setMessage] = useState("");
  const sizes = Object.fromEntries(keys.map((k) => [k, spec.components[k].size?.split(" (")[0] ?? null]));

  const apply = (k: InsideKey, r: ReturnType<typeof drop>) => {
    if (!r.ok) { setMessage(`${NAME[k]}: ${r.reason}`); setState({ for: keysKey, p: { ...placement } }); return; }
    setState({ for: keysKey, p: r.placement });
    const zone = r.placement[k]!.zone;
    setMessage(`${NAME[k]} in the ${ZONES[zone].label.toLowerCase()}.`);
    onZonesChange?.(Object.fromEntries(Object.entries(r.placement).map(([key, v]) => [key, v!.zone])));
  };

  return (
    <figure className={cn("relative isolate w-full overflow-hidden rounded-lg border border-border bg-surface-0", className)}>
      <div data-h3d-stage className="relative aspect-[4/3] w-full md:aspect-[16/10]">
        <div role="img" aria-label={`Inside the house: ${keys.map((k) => `${NAME[k]} in the ${ZONES[placement[k]?.zone ?? "garage"].label.toLowerCase()}`).join(", ")}.`} className="absolute inset-0">
          <Inside
            palette={palette}
            reduced={reduced}
            keys={keys}
            placement={placement}
            sizes={sizes}
            batteryKwh={design.design.battery.kwh}
            onDrop={(k, x) => apply(k, drop(placement, k, x))}
          />
        </div>
        {keys.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 text-center text-sm text-ink-muted">Nothing goes inside for this design.</p>
        )}
      </div>
      {controls && keys.length > 0 && (
        <div data-h3d-ui className="flex flex-col gap-2 border-t border-border px-3 pb-2.5 pt-3 sm:px-4">
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {keys.map((k) => (
              <li key={k} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[k])} />
                  <span className="truncate text-ink">{NAME[k]}</span>
                  {sizes[k] && <span className="font-mono text-[12px] tabular-nums text-ink-muted">{sizes[k]}</span>}
                </span>
                <select
                  aria-label={`Where the ${NAME[k].toLowerCase()} goes`}
                  value={placement[k]?.zone ?? ""}
                  onChange={(e) => apply(k, moveTo(placement, k, e.target.value as Zone))}
                  className="h-8 rounded-md border border-border bg-surface-1 px-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {ZONE_ORDER.map((z) => (
                    <option key={z} value={z} disabled={!ALLOWED[k].includes(z)}>{ZONES[z].label}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <p role="status" className="min-h-[18px] px-0.5 text-[13px] leading-[18px] text-ink-body">
            {message || "Drag a part into the basement, the garage or onto the outside wall."}
          </p>
        </div>
      )}
    </figure>
  );
}
