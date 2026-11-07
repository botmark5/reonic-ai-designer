"use client";
import type { RootState } from "@react-three/fiber";
import { ArrowDown, ArrowUp, Pause, Play } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DesignResponse, Home } from "../../lib/types";
import { cn } from "../../lib/utils";
import { PRESETS, type Preset, type PresetRequest } from "./CameraRig";
import { activeFlows, dayInputFrom, sampleDay, simulateDay, type Day } from "./energyDay";
import type { Pointer } from "./Equipment";
import { useReducedMotion, useThemeName } from "./hooks";
import { roofPlanes } from "./houseGeometry";
import { getPalette } from "./palette";
import { chooseRenderMode, detectEnv, type RenderMode } from "./renderMode";
import { buildSceneSpec, type CompKey } from "./sceneSpec";
import { MAY_DAY, type Place } from "./sun";
import type { House3DMode, RoofInput } from "./types";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

/** Still images of the house with panels only (no other equipment), so they never show something the offer lacks. */
export const FALLBACK_IMAGE = { light: "/models/house-fallback.png", dark: "/models/house-fallback-dark.png" } as const;

export interface House3DProps {
  design: DesignResponse;
  home: Home;
  mode: House3DMode;
  /** Roof facts that override home.tilt_deg / orientation_deg, e.g. `roofFromSolarResult(await /api/solar)`. */
  roof?: RoofInput;
  /** Always show the still image (slides, print). */
  static?: boolean;
  /** Short camera fly-in on first render (default true; skipped with reduced motion or any input). */
  flyIn?: boolean;
  className?: string;
}

/** If WebGL fails after all (context limit, blocked GPU), show the still image instead of breaking the page. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const PRESET_LABEL: Record<Preset, string> = { street: "Street", roof: "Roof", garage: "Garage" };
const DOT: Record<CompKey, string> = {
  pv: "bg-comp-pv", inverter: "bg-comp-pv", battery: "bg-comp-battery", wallbox: "bg-comp-wallbox", heatpump: "bg-comp-heatpump",
};

const noop = () => () => {};
function useRenderMode(forceStatic: boolean): RenderMode {
  const auto = useSyncExternalStore(noop, () => chooseRenderMode(detectEnv()), () => "static" as const);
  return forceStatic ? "static" : auto;
}

const DAY_START = 6;
const DAY_END = 22;
const START_HOUR = 12.5;
const PLAY_SECONDS = 14; // a whole day
const UI_EVERY = 1 / 15; // s between React updates while playing

const pill =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none transition-[background-color,color,transform] duration-150 " +
  "active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0";
const glassPanel = "rounded-lg border border-border/80 bg-surface-1/85 backdrop-blur-md shadow-[0_1px_2px_rgba(16,17,20,0.05)]";
/** The same material, only from sm (on phones these blocks sit in the flow under the model). */
const glassPanelSm = "sm:rounded-lg sm:border sm:border-border/80 sm:bg-surface-1/85 sm:backdrop-blur-md sm:shadow-[0_1px_2px_rgba(16,17,20,0.05)]";

const clock = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const kw = (x: number) => `${(Math.abs(x) < 0.05 ? 0 : x).toFixed(1)} kW`;

/**
 * The customer's house as an architectural model with the proposed system on it, a modelled sunny day and the
 * energy flowing through it. Planner mode shows exact sizes and "Save image"; homeowner mode uses plain words.
 */
export function House3D({ design, home, mode, roof, static: forceStatic = false, flyIn = true, className }: House3DProps) {
  const theme = useThemeName();
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const renderMode = useRenderMode(forceStatic || failed);
  const palette = useMemo(() => getPalette(theme), [theme]);
  const spec = useMemo(() => buildSceneSpec(design, home, mode, roofPlanes, roof), [design, home, mode, roof]);
  const place: Place = useMemo(
    () => ({ ...MAY_DAY, lat: roof?.latitude ?? MAY_DAY.lat, lon: roof?.longitude ?? MAY_DAY.lon }),
    [roof?.latitude, roof?.longitude],
  );
  const day: Day = useMemo(() => simulateDay(dayInputFrom(spec, design.design, home, place)), [spec, design, home, place]);

  const [hour, setHour] = useState(START_HOUR);
  const [playing, setPlaying] = useState(false);
  const moment = useMemo(() => sampleDay(day, hour), [day, hour]);
  const flows = useMemo(() => activeFlows(moment), [moment]);

  const [preset, setPreset] = useState<PresetRequest>({ preset: "street", n: 0 });
  const [hovered, setHovered] = useState<CompKey | null>(null);
  const [selected, setSelected] = useState<CompKey | null>(null);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(true);
  const figure = useRef<HTMLElement>(null);
  // pause rendering while scrolled out of view
  useEffect(() => {
    const el = figure.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const three = useRef<RootState | null>(null);
  const shown = (k: CompKey | null) => (k && spec.components[k].visible ? k : null);
  const active = shown(hovered) ?? shown(selected);

  // never leave the page with a pointer cursor
  useEffect(() => () => { document.body.style.cursor = ""; }, []);

  // play the day: time runs from now to 22:00 in ≤ 14 s; React only updates ~15×/s
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let h = hour >= DAY_END - 0.01 ? DAY_START : hour;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      h = Math.min(DAY_END, h + (dt * (DAY_END - DAY_START)) / PLAY_SECONDS);
      acc += dt;
      if (acc >= UI_EVERY || h >= DAY_END) { acc = 0; setHour(h); }
      if (h >= DAY_END) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start from the hour at the moment play was pressed
  }, [playing]);

  const pointer = useMemo<Pointer>(() => ({
    onOver: (k) => { setHovered(k); document.body.style.cursor = "pointer"; },
    onOut: (k) => { setHovered((h) => (h === k ? null : h)); document.body.style.cursor = ""; },
    onTap: (k) => setSelected((s) => (s === k ? null : k)),
  }), []);

  const onReady = useCallback((state: RootState) => {
    three.current = state;
    state.gl.domElement.addEventListener("webglcontextlost", () => setFailed(true), { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  }, []);

  const saveImage = useCallback(() => {
    const s = three.current;
    if (!s) return;
    s.gl.render(s.scene, s.camera); // draw now, so the buffer is current without preserveDrawingBuffer
    const a = document.createElement("a");
    a.href = s.gl.domElement.toDataURL("image/png");
    a.download = "house-design.png";
    a.click();
  }, []);

  const show3d = renderMode === "3d";
  const c = spec.components;
  const activeSpec = active ? c[active] : null;
  const homeowner = mode === "homeowner";

  const rows: { key: string; comp?: CompKey; label: string; size?: string | null; value: ReactNode }[] = [];
  if (c.pv.visible) rows.push({ key: "pv", comp: "pv", label: "Solar", size: c.pv.size?.split(" (")[0], value: kw(moment.pv) });
  if (c.battery.visible) {
    const dir = moment.batteryIn > 0.05 ? "in" : moment.batteryOut > 0.05 ? "out" : null;
    rows.push({
      key: "battery", comp: "battery", label: "Battery", size: c.battery.size,
      value: (
        <span className="inline-flex items-center gap-1">
          {dir === "in" && <ArrowUp aria-label="charging" className="size-3 text-comp-battery" strokeWidth={2} />}
          {dir === "out" && <ArrowDown aria-label="discharging" className="size-3 text-comp-battery" strokeWidth={2} />}
          {Math.round(moment.soc * 100)} %
        </span>
      ),
    });
  }
  if (c.wallbox.visible) rows.push({ key: "car", comp: "wallbox", label: homeowner ? "Car" : "Car (wallbox)", size: c.wallbox.size, value: kw(moment.car) });
  if (c.heatpump.visible) rows.push({ key: "hp", comp: "heatpump", label: "Heat pump", size: c.heatpump.size, value: kw(moment.heatpump) });
  rows.push({ key: "home", label: homeowner ? "Your home" : "Home", value: kw(moment.home - moment.heatpump) });
  const exporting = moment.gridExport > moment.gridImport;
  rows.push({ key: "grid", label: exporting ? "To grid" : "From grid", value: kw(exporting ? moment.gridExport : moment.gridImport) });

  const valueText = `${clock(hour)}. Solar ${kw(moment.pv)}${c.battery.visible ? `, battery ${Math.round(moment.soc * 100)} %` : ""}.`;

  return (
    <figure
      ref={figure}
      className={cn("relative isolate w-full overflow-hidden rounded-lg border border-border bg-surface-0", className)}
    >
      <div className="relative aspect-[4/3] w-full md:aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static fallback must work without the image optimiser */}
        <img
          src={FALLBACK_IMAGE[theme]}
          alt={show3d ? "" : spec.summary}
          aria-hidden={show3d}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", show3d && ready ? "opacity-0" : "opacity-100")}
        />
        {show3d && (
          <div
            role="img"
            aria-label={spec.summary}
            className={cn("absolute inset-0 transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")}
          >
            <SceneBoundary onError={() => setFailed(true)}>
              <Scene
                spec={spec}
                palette={palette}
                dark={theme === "dark"}
                reduced={reduced}
                preset={preset}
                active={active}
                pointer={pointer}
                moment={moment}
                flows={flows}
                batteryKwh={design.design.battery.kwh}
                flyIn={flyIn}
                inView={inView}
                onMiss={() => setSelected(null)}
                onReady={onReady}
              />
            </SceneBoundary>
          </div>
        )}
      </div>

      {/* Phones: controls stack under the model. From sm: they float over it (wrapper becomes display: contents). */}
      <div className="flex flex-col gap-3 border-t border-border p-3 sm:contents">
        {/* live numbers + legend */}
        <section
          aria-label={show3d ? "The system right now" : "The system"}
          className={cn("sm:absolute sm:left-3 sm:top-3 sm:w-[17.5rem] sm:p-3", glassPanelSm)}
        >
          {show3d && (
            <header className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-mono text-xl font-medium tabular-nums tracking-tight text-ink">{clock(hour)}</span>
              <span className="text-xs text-ink-muted">Sunny day in May, modelled</span>
            </header>
          )}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-1">
            {rows.map((r) => {
              const body = (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    {r.comp ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[r.comp])} /> : <span aria-hidden className="size-2 shrink-0" />}
                    <span className="truncate text-ink">{r.label}</span>
                    {r.size && <span className="hidden truncate font-mono text-[12px] text-ink-muted tabular-nums sm:inline">{r.size}</span>}
                  </span>
                  {show3d && <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-ink">{r.value}</span>}
                </>
              );
              const rowCls = "flex h-8 w-full items-center justify-between gap-2 rounded-md px-1.5 text-left text-[13px]";
              return (
                <li key={r.key}>
                  {r.comp ? (
                    <button
                      type="button"
                      aria-pressed={selected === r.comp}
                      onClick={() => setSelected((s) => (s === r.comp ? null : r.comp!))}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(r.comp!); }}
                      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered(null); }}
                      className={cn(
                        rowCls,
                        "outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-focus",
                        "[@media(hover:hover)]:hover:bg-surface-2",
                        active === r.comp && "bg-surface-2",
                      )}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={cn(rowCls, "text-ink-body")}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {/* Details of the selected part. Always mounted (live region); in 3D on larger screens the floating
              tooltip shows it and this stays for screen readers. */}
          <p
            role="status"
            className={cn("mt-2 text-[13px] leading-[18px] text-ink-body empty:hidden", show3d && "sm:sr-only")}
          >
            {activeSpec && (
              <>
                <span className="font-semibold text-ink">{activeSpec.title}</span>
                {activeSpec.size && <span className="font-mono tabular-nums"> · {activeSpec.size}</span>}
                {activeSpec.reason && <> · {activeSpec.reason}</>}
                {activeSpec.note && <span className="text-warning-text"> · {activeSpec.note}</span>}
              </>
            )}
          </p>
        </section>

        {show3d && (
          <TimeBar
            day={day}
            hour={hour}
            playing={playing}
            valueText={valueText}
            onHour={(h) => { setPlaying(false); setHour(h); }}
            onTogglePlay={() => setPlaying((p) => !p)}
            className={cn("sm:absolute sm:inset-x-3 sm:bottom-3 sm:px-3 sm:py-2", glassPanelSm)}
          />
        )}

        {show3d && (
          <div className="flex shrink-0 items-center gap-1.5 sm:absolute sm:right-3 sm:top-3">
            <div role="group" aria-label="Camera view" className={cn("flex gap-1 p-1", glassPanel, "rounded-full")}>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset.preset === p}
                  onClick={() => setPreset((r) => ({ preset: p, n: r.n + 1 }))}
                  className={cn(pill, "h-7", preset.preset === p ? "bg-primary text-primary-ink" : "text-ink-body [@media(hover:hover)]:hover:bg-surface-2")}
                >
                  {PRESET_LABEL[p]}
                </button>
              ))}
            </div>
            {mode === "planner" && (
              <button type="button" onClick={saveImage} className={cn(pill, glassPanel, "rounded-full text-ink [@media(hover:hover)]:hover:bg-surface-2")}>
                Save image
              </button>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Time-of-day slider drawn over the day's solar curve (the only colour in the chrome is the energy itself). */
function TimeBar({ day, hour, playing, valueText, onHour, onTogglePlay, className }: {
  day: Day; hour: number; playing: boolean; valueText: string;
  onHour: (h: number) => void; onTogglePlay: () => void; className?: string;
}) {
  const curve = useMemo(() => {
    const steps = day.steps.filter((s) => s.t >= DAY_START && s.t <= DAY_END);
    const peak = Math.max(0.5, ...steps.map((s) => s.pv));
    const x = (t: number) => ((t - DAY_START) / (DAY_END - DAY_START)) * 100;
    const y = (p: number) => 20 - (p / peak) * 17;
    const line = steps.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(2)},${y(s.pv).toFixed(2)}`).join(" ");
    return { line, area: `${line} L100,20 L0,20 Z` };
  }, [day]);
  const pct = ((hour - DAY_START) / (DAY_END - DAY_START)) * 100;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause the day" : "Play the day"}
        className={cn(pill, "size-8 shrink-0 justify-center bg-surface-2 px-0 text-ink [@media(hover:hover)]:hover:bg-border")}
      >
        {playing ? <Pause className="size-3.5" strokeWidth={2} /> : <Play className="size-3.5 translate-x-px" strokeWidth={2} />}
      </button>
      <div className="relative min-w-0 flex-1">
        <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 -top-1 h-6 w-full">
          <defs>
            <linearGradient id="house3d-sun" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--color-ai-amber)" />
              <stop offset="55%" stopColor="var(--color-ai-orange)" />
              <stop offset="100%" stopColor="var(--color-ai-salmon)" />
            </linearGradient>
          </defs>
          <path d={curve.area} fill="url(#house3d-sun)" opacity={0.22} />
          <path d={curve.line} fill="none" stroke="url(#house3d-sun)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={pct} x2={pct} y1={0} y2={20} stroke="var(--color-ink)" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <input
          type="range"
          min={DAY_START}
          max={DAY_END}
          step={playing ? "any" : 0.25}
          value={hour}
          onChange={(e) => onHour(Number(e.target.value))}
          aria-label="Time of day"
          aria-valuetext={valueText}
          className={cn(
            "relative mt-3 block h-6 w-full cursor-pointer appearance-none bg-transparent outline-none",
            "[&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border-strong/40",
            "[&::-webkit-slider-thumb]:-mt-[8.5px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border-strong [&::-webkit-slider-thumb]:bg-surface-1",
            "[&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(16,17,20,0.18)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150",
            "active:[&::-webkit-slider-thumb]:scale-110",
            "[&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border-strong/40",
            "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border-strong [&::-moz-range-thumb]:bg-surface-1",
            "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-focus",
            "focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-focus",
          )}
        />
        <div aria-hidden className="mt-0.5 flex justify-between font-mono text-[11px] tabular-nums text-ink-muted">
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>22:00</span>
        </div>
      </div>
    </div>
  );
}
