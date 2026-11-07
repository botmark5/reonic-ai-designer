"use client";
import type { RootState } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DesignResponse, Home } from "../../lib/types";
import { cn } from "../../lib/utils";
import { PRESETS, type Preset } from "./CameraRig";
import type { Pointer } from "./Equipment";
import { useReducedMotion, useThemeName } from "./hooks";
import { roofPlanes } from "./houseGeometry";
import { getPalette } from "./palette";
import { chooseRenderMode, detectEnv, type RenderMode } from "./renderMode";
import { COMP_KEYS, buildSceneSpec, type CompKey } from "./sceneSpec";
import type { House3DMode, RoofInput } from "./types";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

export const FALLBACK_IMAGE = "/models/house-fallback.png";

export interface House3DProps {
  design: DesignResponse;
  home: Home;
  mode: House3DMode;
  /** Roof facts that override home.tilt_deg / orientation_deg, e.g. from Google Solar. */
  roof?: RoofInput;
  /** Always show the static image (slides, print). */
  static?: boolean;
  className?: string;
}

const PRESET_LABEL: Record<Preset, string> = { overview: "Overview", roof: "Roof", garage: "Garage" };
const DOT: Record<CompKey, string> = {
  pv: "bg-comp-pv", inverter: "bg-comp-pv", battery: "bg-comp-battery", wallbox: "bg-comp-wallbox", heatpump: "bg-comp-heatpump",
};

const noop = () => () => {};

function useRenderMode(forceStatic: boolean): RenderMode {
  const auto = useSyncExternalStore(noop, () => chooseRenderMode(detectEnv()), () => "static" as const);
  return forceStatic ? "static" : auto;
}

const pill =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors outline-none " +
  "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0";

/**
 * The customer's house with the proposed system on it.
 * Planner mode shows exact sizes and a "Save image" action; homeowner mode uses plain words.
 */
export function House3D({ design, home, mode, roof, static: forceStatic = false, className }: House3DProps) {
  const theme = useThemeName();
  const reduced = useReducedMotion();
  const renderMode = useRenderMode(forceStatic);
  const palette = useMemo(() => getPalette(theme), [theme]);
  const spec = useMemo(() => buildSceneSpec(design, home, mode, roofPlanes, roof), [design, home, mode, roof]);

  const [preset, setPreset] = useState<Preset>("overview");
  const [hovered, setHovered] = useState<CompKey | null>(null);
  const [selected, setSelected] = useState<CompKey | null>(null);
  const [ready, setReady] = useState(false);
  const gl = useRef<RootState["gl"] | null>(null);
  const active = hovered ?? selected;

  const pointer = useMemo<Pointer>(() => ({
    onOver: (k) => { setHovered(k); document.body.style.cursor = "pointer"; },
    onOut: (k) => { setHovered((h) => (h === k ? null : h)); document.body.style.cursor = ""; },
    onTap: (k) => setSelected((s) => (s === k ? null : k)),
  }), []);

  const onReady = useCallback((state: RootState) => {
    gl.current = state.gl;
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  }, []);

  const saveImage = useCallback(() => {
    const canvas = gl.current?.domElement;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "house-design.png";
    a.click();
  }, []);

  const legend = COMP_KEYS.filter((k) => spec.components[k].visible && !(mode === "homeowner" && k === "inverter"));
  const show3d = renderMode === "3d";
  const activeSpec = active && spec.components[active].visible ? spec.components[active] : null;

  return (
    <figure
      className={cn(
        "relative isolate w-full overflow-hidden rounded-lg border border-border bg-surface-0",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full md:aspect-[16/10]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static fallback must work without the image optimiser */}
      <img
        src={FALLBACK_IMAGE}
        alt={show3d ? "" : spec.summary}
        aria-hidden={show3d}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-200",
          show3d && ready ? "opacity-0" : "opacity-100",
        )}
      />
      {show3d && (
        <div
          role="img"
          aria-label={spec.summary}
          className={cn("absolute inset-0 transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")}
        >
          <Scene
            spec={spec}
            palette={palette}
            reduced={reduced}
            preset={preset}
            active={active}
            pointer={pointer}
            onMiss={() => setSelected(null)}
            onReady={onReady}
          />
        </div>
      )}
      </div>

      {/* Phones: controls sit under the image. Larger screens: they float over its bottom edge. */}
      <figcaption className="flex flex-col gap-2 border-t border-border p-3 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:bottom-0 sm:flex-row sm:items-end sm:justify-between sm:border-0">
        <ul className="pointer-events-auto flex flex-wrap gap-1.5" aria-label="Components">
          {legend.map((k) => {
            const c = spec.components[k];
            const on = active === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={selected === k}
                  onClick={() => setSelected((s) => (s === k ? null : k))}
                  onMouseEnter={() => setHovered(k)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(k)}
                  onBlur={() => setHovered(null)}
                  className={cn(pill, "border border-border bg-surface-1/90 text-ink backdrop-blur-sm", on && "border-border-strong")}
                >
                  <span aria-hidden className={cn("size-2 rounded-full", DOT[k])} />
                  {c.title}
                  {c.size && <span className="font-mono tabular-nums text-ink-muted">{c.size}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {activeSpec && (
          <p role="status" className="text-[13px] leading-[18px] text-ink-body sm:hidden">
            <span className="font-semibold text-ink">{activeSpec.title}</span>
            {activeSpec.size && <span className="font-mono tabular-nums"> · {activeSpec.size}</span>}
            {activeSpec.reason && <> · {activeSpec.reason}</>}
            {activeSpec.note && <span className="text-warning-text"> · {activeSpec.note}</span>}
          </p>
        )}
        {show3d && (
          <div className="pointer-events-auto flex shrink-0 gap-1.5">
            <div role="group" aria-label="Camera view" className="flex gap-1 rounded-full bg-surface-1/90 p-1 backdrop-blur-sm">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  onClick={() => setPreset(p)}
                  className={cn(pill, "h-7", preset === p ? "bg-primary text-primary-ink" : "text-ink-body hover:bg-surface-2")}
                >
                  {PRESET_LABEL[p]}
                </button>
              ))}
            </div>
            {mode === "planner" && (
              <button type="button" onClick={saveImage} className={cn(pill, "bg-surface-2 text-ink hover:bg-border")}>
                Save image
              </button>
            )}
          </div>
        )}
      </figcaption>
    </figure>
  );
}
