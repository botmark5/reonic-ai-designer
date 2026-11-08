"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { DesignResponse } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useReducedMotion } from "../house3d/hooks";
import type { StageLocation } from "../house3d/types";
import type { Placement } from "./geo";

const SiteScene = dynamic(() => import("./SiteScene"), { ssr: false });

/** No first tiles within this long: the procedural house takes over (the demo never waits on Google). */
export const FIRST_TILES_MS = 4000;

export interface SiteStageProps {
  apiKey: string;
  location: StageLocation;
  design: DesignResponse;
  /** New panels on stage (the /live reveal); default true. */
  panelsOn?: boolean;
  labels?: boolean;
  /** Called once when the real outside cannot be shown; the parent swaps in the procedural house. */
  onFallback: (reason: string) => void;
  /** The viewer asked for the model view instead. */
  onModelView?: () => void;
  className?: string;
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const fmt = (x: number | null | undefined, unit: string) => (x ? `${Number(x.toFixed(2))} ${unit}` : null);

/**
 * The real street: Google's photorealistic 3D tiles around the address with the engine's panels on the real roof.
 * Anything missing or slow calls `onFallback`. Google's attribution is always visible.
 */
export function SiteStage({ apiKey, location, design, panelsOn = true, labels = false, onFallback, onModelView, className }: SiteStageProps) {
  const reduced = useReducedMotion();
  const d = design.design;
  const kwp = d.pv.include && d.pv.kwp ? d.pv.kwp : 0;
  const [placement, setPlacement] = useState<{ key: string; p: Placement } | null>(null);
  const [first, setFirst] = useState(false);
  const [attribution, setAttribution] = useState("");
  const fellBack = useRef(false);
  const fallback = useRef(onFallback);
  useEffect(() => { fallback.current = onFallback; });
  const fail = (reason: string) => {
    if (fellBack.current) return;
    fellBack.current = true;
    fallback.current(reason);
  };

  const key = `${location.lat.toFixed(6)},${location.lng.toFixed(6)},${kwp}`;
  useEffect(() => {
    const ctl = new AbortController();
    const q = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng), kwp: String(kwp) });
    fetch(`/api/solar/panels?${q}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { status: "error", reason: `HTTP ${r.status}` }))
      .then((j: { status: string; reason?: string } & Partial<Placement>) => {
        if (j.status !== "ok" || !j.segments?.length) { if (!fellBack.current) { fellBack.current = true; fallback.current(`placement: ${j.reason ?? j.status}`); } return; }
        setPlacement({ key, p: j as Placement });
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError" && !fellBack.current) { fellBack.current = true; fallback.current("placement: network"); }
      });
    return () => ctl.abort();
  }, [key, location.lat, location.lng, kwp]);

  // the first tiles must arrive in time
  useEffect(() => {
    if (first) return;
    const t = window.setTimeout(() => {
      if (!fellBack.current) { fellBack.current = true; fallback.current("tiles: slow"); }
    }, FIRST_TILES_MS + 2000); // + the placement request
    return () => window.clearTimeout(t);
  }, [first]);

  const chips = [
    panelsOn && kwp ? { k: "pv", label: "Solar", v: fmt(kwp, "kWp"), dot: "bg-comp-pv" } : null,
    d.battery.include ? { k: "battery", label: "Battery", v: fmt(d.battery.kwh, "kWh"), dot: "bg-comp-battery" } : null,
    d.wallbox.include ? { k: "wallbox", label: "Wallbox", v: fmt(d.wallbox.kw, "kW"), dot: "bg-comp-wallbox" } : null,
    d.heatpump.include ? { k: "heatpump", label: "Heat pump", v: fmt(d.heatpump.kw, "kW"), dot: "bg-comp-heatpump" } : null,
  ].filter((c): c is { k: string; label: string; v: string | null; dot: string } => !!c);

  const p = placement?.key === key ? placement.p : null;
  return (
    <figure className={cn("relative isolate w-full overflow-hidden rounded-lg border border-border bg-surface-1", className)}>
      <div data-h3d-stage className="relative aspect-[4/3] w-full md:aspect-[16/10]">
        {p && (
          <div
            role="img"
            aria-label={`${location.address ?? "The house"} in 3D, with ${p.panel_count} solar panels on the roof.`}
            className={cn("absolute inset-0 transition-opacity duration-500", first ? "opacity-100" : "opacity-0")}
          >
            <Boundary onError={() => fail("tiles: crashed")}>
              <SiteScene
                apiKey={apiKey}
                placement={p}
                panelsOn={panelsOn}
                reduced={reduced}
                pvLabel={labels && kwp ? fmt(kwp, "kWp") : null}
                onFirstTiles={() => setFirst(true)}
                onError={fail}
                onAttribution={setAttribution}
              />
            </Boundary>
          </div>
        )}
        {!first && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="animate-pulse text-sm text-ink-muted">Loading the street…</span>
          </div>
        )}
        {/* Google's attribution: always visible while the tiles are on screen */}
        <p className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[70%] truncate rounded bg-surface-1/80 px-1.5 py-0.5 text-[11px] leading-4 text-ink-body backdrop-blur-sm">
          <span className="font-semibold text-ink">Google</span>
          {attribution.replace(/^Google( · )?/, "") && <span> · {attribution.replace(/^Google( · )?/, "")}</span>}
        </p>
        {onModelView && (
          <button
            type="button"
            data-h3d-ui
            onClick={onModelView}
            className="absolute right-3 top-3 inline-flex h-8 items-center rounded-full border border-border/80 bg-surface-1/85 px-3 text-[13px] font-medium text-ink outline-none backdrop-blur-md transition-transform duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-focus [@media(hover:hover)]:hover:bg-surface-2"
          >
            Model view
          </button>
        )}
        {labels && chips.length > 0 && (
          <ul data-h3d-ui className="absolute bottom-2 right-2 flex flex-wrap justify-end gap-1.5">
            {chips.map((c) => (
              <li key={c.k} className="flex items-center gap-2 rounded-full border border-border bg-surface-1/95 py-1.5 pl-2.5 pr-3.5 text-ink shadow-[0_8px_24px_rgba(16,17,20,0.12)]">
                <span aria-hidden className={cn("size-2.5 rounded-full", c.dot)} />
                <span className="text-base font-semibold">{c.label}</span>
                {c.v && <span className="font-mono text-base font-medium tabular-nums text-ink-body">{c.v}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </figure>
  );
}
