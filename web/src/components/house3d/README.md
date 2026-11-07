# House3D

The customer's house with the proposed system on it: PV panels on the south roof (overflow on the garage roof), battery
and inverter on the garage wall, wallbox and car by the driveway, heat pump beside the house, animated energy-flow
lines in the component colours. React Three Fiber, client-only, ~5k triangles.

## Usage

```tsx
import { House3D } from "@/components/house3d";

<House3D design={designResponse} home={home} mode="planner" />      // planner: exact sizes, "Save image"
<House3D design={designResponse} home={home} mode="homeowner" />    // /offer/[token]: plain words
```

| Prop | Type | Notes |
|---|---|---|
| `design` | `DesignResponse` (`@/lib/types`) | What the engine returned. Excluded/null components are hidden. |
| `home` | `Home` | `tilt_deg` / `orientation_deg` set the roof (default 35°, 180° = south). |
| `mode` | `"planner" \| "homeowner"` | Labels and tooltips. |
| `roof?` | `{ pitchDeg?, azimuthDeg?, maxPanels? }` | Overrides the home's roof, e.g. from Google Solar. `maxPanels` caps the panels drawn; the PV tooltip says how many don't fit. |
| `static?` | `boolean` | Always show the still image (slides, print). |
| `className?` | `string` | Width comes from the parent; height follows the aspect ratio (4:3, 16:10 from `md`). |

The component is a `"use client"` component and loads the canvas with `next/dynamic` (`ssr: false`), so it is safe to
render from a server page. Pass a new `design` object after a refine and only the parts that changed animate.

## Behaviour

- Panels: `round(pv.kwp / 0.45)` portrait 450 W modules, full rows from the gutter up, last row centred, margins kept.
- Camera: orbit with limits, slow idle turn after 4 s, presets Overview / Roof / Garage. Hover or tap a part, or use
  the legend buttons (keyboard too), to see its size and the engine's first reason.
- `prefers-reduced-motion`: no idle turn, solid flow lines, parts appear without animation.
- Still image (`/models/house-fallback.png`, `-dark.png`: house and panels only, no other equipment) when WebGL is missing, data saver is on, the device has ≤ 2 cores, or
  `static` is set. It is also shown until the first 3D frame is drawn. The legend still lists the real design.
- DPR capped at 2, drops to 1 when the frame rate falls.

## Files

`layout.ts` (panel placement), `sceneSpec.ts` (design → what is shown, labels, flows), `houseGeometry.ts` and
`equipmentGeometry.ts` (procedural three.js models; Blender was not available), `Scene.tsx`, `Equipment.tsx`,
`EnergyFlow.tsx`, `CameraRig.tsx`, `Tooltip.tsx`, `House3D.tsx`. Tests: `npm test`.

Regenerate the still images: render the component (light, then dark) with reduced motion and with equipment and
flow lines temporarily hidden, screenshot the canvas area at 1600×1000 and replace the two PNGs in `web/public/models/`.
