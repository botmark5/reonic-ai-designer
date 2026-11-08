"use client";
import type { DesignResponse, Home } from "../../lib/types";
import { House3D } from "./House3D";
import { stageRoof } from "./stage";
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
  /** Outside (default) or the abstract inside diorama. */
  view?: StageView;
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
  onPanelsChange?: (panels: StagePanel[]) => void;
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

/**
 * The one 3D component pages mount. It picks the renderer (procedural house today; real 3D tiles outside and the
 * inside diorama as they land) and always falls back to the procedural house, so a page never depends on Google.
 * Props that a renderer does not support yet are accepted and ignored, so pages can wire them now.
 */
export function HouseStage({
  design, home, mode = "homeowner", roof, location, static: forceStatic, flyIn, className,
}: HouseStageProps) {
  return (
    <House3D
      design={design}
      home={home}
      mode={mode}
      roof={stageRoof(roof, location)}
      static={forceStatic}
      flyIn={flyIn}
      className={className}
    />
  );
}
