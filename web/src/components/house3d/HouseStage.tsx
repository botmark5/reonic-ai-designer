"use client";
import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import type { DesignResponse, Home } from "../../lib/types";
import { House3D } from "./House3D";
import { InsideStage } from "./InsideStage";
import type { Zone } from "./insideRules";
import { revealedFromKey, revealKey, stageRoof, staticWanted, tilesWanted } from "./stage";
import type {
  ComponentKey, House3DMode, RoofInput, StageControls, StageLocation, StagePanel, StageReveal, StageView,
} from "./types";

export interface HouseStageProps {
  design: DesignResponse;
  home: Home;
  /** Planner: exact sizes, Save image, editing. Homeowner: plain words. Default "homeowner". */
  mode?: House3DMode;
  /** Roof facts (e.g. `roofFromSolarResult(...)`); win over home.tilt_deg / orientation_deg. */
  roof?: RoofInput;
  /**
   * The real address. With it (and the tiles flag on) the outside is Google's photorealistic 3D city; without it,
   * or on any tile problem, the procedural house. /reality never passes one.
   */
  location?: StageLocation;
  /** Outside or the inside diorama. Omit and the stage shows its own Outside / Inside switch. */
  view?: StageView;
  /** Inside: where the parts start (default battery, inverter, wallbox in the garage; heat pump outside). */
  zones?: Partial<Record<ComponentKey, Zone>>;
  /** Inside: the planner moved a part to another zone. */
  onZonesChange?: (zones: Partial<Record<ComponentKey, Zone>>) => void;
  /** Drape the annual sunshine map on the roof. */
  sunMap?: boolean;
  /** Build-up for /live. Omit to show the whole design at once. */
  reveal?: StageReveal;
  /** Emphasise one part (e.g. the card the planner hovers). */
  highlight?: ComponentKey | null;
  /** The viewer clicked a part in the scene (null: clicked empty space). */
  onSelect?: (key: ComponentKey | null) => void;
  /** Stages with the same key share one orbit (e.g. two houses side by side on /reality). */
  cameraKey?: string;
  /** Controlled time of day in hours (6–22). Omit for the built-in slider; with it, the slider follows. */
  timeOfDay?: number;
  /** The viewer moved the time slider (only matters when timeOfDay is controlled). */
  onTimeOfDayChange?: (hours: number) => void;
  /** Planner may drag, add and remove panels (only places them; never changes the engine's kWp). */
  editable?: boolean;
  /** The planner moved, added or removed panels; null = back to the engine's layout (Reset). */
  onPanelsChange?: (panels: StagePanel[] | null) => void;
  /** Floating labels on the model (PV kWp, battery kWh), sized for a projector. */
  labels?: boolean;
  /** Which overlays to show. Default "full". */
  controls?: StageControls;
  /** Always the still image (slides, print). */
  static?: boolean;
  /** Camera fly-in on first render (default true; skipped with reduced motion or any input). */
  flyIn?: boolean;
  className?: string;
}

// the real outside only loads (with its tiles library) when it is actually used
const SiteStage = dynamic(() => import("../site3d/SiteStage").then((m) => m.SiteStage), { ssr: false });

const noop = () => () => {};
const TILES_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILES_KEY;
const TILES_FLAG = process.env.NEXT_PUBLIC_HOUSE_TILES;

/**
 * The one 3D component pages mount. It picks the renderer (procedural house today; real 3D tiles outside and the
 * inside diorama as they land) and always falls back to the procedural house, so a page never depends on Google.
 * Props that a renderer does not support yet are accepted and ignored, so pages can wire them now.
 */
export function HouseStage({
  design, home, mode = "homeowner", roof, location, view, zones, onZonesChange, sunMap, reveal, highlight, onSelect, cameraKey, timeOfDay,
  onTimeOfDayChange, labels, controls, editable, onPanelsChange, static: forceStatic, flyIn, className,
}: HouseStageProps) {
  const wanted = useSyncExternalStore(noop, () => tilesWanted(window.location.search, TILES_FLAG), () => false);
  const forcedStill = useSyncExternalStore(noop, () => staticWanted(window.location.search), () => false);
  const still = !!forceStatic || forcedStill;
  const at = location && Number.isFinite(location.lat) && Number.isFinite(location.lng) ? `${location.lat},${location.lng}` : null;
  // the address the real outside failed for (or the viewer switched away from): procedural until the address changes
  const [off, setOff] = useState<string | null>(null);
  const [ownView, setOwnView] = useState<StageView>("outside");
  const shownView = view ?? ownView;
  const tiles = wanted && !!TILES_KEY && !!at && shownView === "outside" && !still && off !== at;
  const overlays = controls !== "none" && controls !== "time";
  const switcher = view === undefined && overlays && !still && !reveal;

  return (
    <div className="relative">
      {renderStage()}
      {switcher && (
        <div role="group" aria-label="View" data-h3d-ui className="absolute left-3 top-3 z-10 flex gap-1 rounded-full border border-border/80 bg-surface-1/85 p-1 shadow-[0_1px_2px_rgba(16,17,20,0.05)] backdrop-blur-md">
          {(["outside", "inside"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={shownView === v}
              onClick={() => setOwnView(v)}
              className={
                "inline-flex h-7 items-center rounded-full px-3 text-[13px] font-medium outline-none transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-focus " +
                (shownView === v ? "bg-primary text-primary-ink" : "text-ink-body [@media(hover:hover)]:hover:bg-surface-2")
              }
            >
              {v === "outside" ? "Outside" : "Inside"}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  function renderStage() {
  const inside = shownView === "inside" ? (
    <InsideStage
      design={design}
      home={home}
      mode={mode}
      controls={controls === undefined || controls === "full"}
      zones={zones as Partial<Record<"battery" | "inverter" | "heatpump" | "wallbox", Zone>> | undefined}
      onZonesChange={onZonesChange}
      className={className}
    />
  ) : null;
  if (tiles && location) {
    return (
      <SiteStage
        apiKey={TILES_KEY!}
        location={location}
        design={design}
        panelsOn={revealedFromKey(revealKey(reveal)).panels}
        labels={labels}
        sunMap={sunMap}
        buttons={overlays}
        onFallback={(reason) => {
          if (process.env.NODE_ENV !== "production") console.info("[HouseStage] real outside unavailable:", reason);
          setOff(at);
        }}
        onModelView={() => setOff(at)}
        className={className}
      />
    );
  }
  // the model stays mounted (hidden, paused) while Inside shows: edits, time and camera survive the switch
  return (
    <>
      {inside}
      <div hidden={!!inside}>
    <House3D
      design={design}
      home={home}
      mode={mode}
      roof={stageRoof(roof, location)}
      reveal={reveal}
      highlight={highlight}
      onSelect={onSelect}
      cameraKey={cameraKey}
      editable={editable}
      onPanelsChange={onPanelsChange}
      timeOfDay={timeOfDay}
      onTimeOfDayChange={onTimeOfDayChange}
      labels={labels}
      controls={controls}
      static={still}
      flyIn={flyIn}
      className={className}
    />
      </div>
    </>
  );
  }
}
