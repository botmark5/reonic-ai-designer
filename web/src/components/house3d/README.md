# House3D

The customer's house as an architectural model (matte white, soft shadows, ambient occlusion) with the proposed system
on it. Colour appears only on the energy system: dark-glass panels, battery, heat pump, wallbox, and energy flows in
the AI gradient. A time-of-day slider runs a modelled sunny May day: the sun moves on its real arc, flows follow it
(noon: panels → house, battery, car; evening: battery → house; early morning: grid → house) with live kW and battery %.

## Usage

```tsx
import { House3D, roofFromSolarResult } from "@/components/house3d";

<House3D design={designResponse} home={home} mode="planner" />      // planner: exact sizes, "Save image"
<House3D design={designResponse} home={home} mode="homeowner" />    // /offer/[token]: plain words

// with Google Solar (GET /api/solar?address=…): real roof direction, pitch, panel cap and sun path for the location
<House3D design={r} home={home} mode="planner" roof={roofFromSolarResult(solar)} />
```

| Prop | Type | Notes |
|---|---|---|
| `design` | `DesignResponse` (`@/lib/types`) | What the engine returned. Excluded/null components are hidden. |
| `home` | `Home` | Roof: `roof_azimuth` / `roof_pitch` (the planner's fields) win, then the `roof` prop, then `orientation_deg` / `tilt_deg`, then 35° south; `roof_max_kwp` caps the panels drawn. `existing_pv_kwp` (unless `has_existing_pv` is false) puts the panels already there on the roof, so a battery retrofit shows its solar. `annual_kwh`, `ev_km_year` drive the modelled day. |
| `mode` | `"planner" \| "homeowner"` | Labels and tooltips. |
| `roof?` | `{ pitchDeg?, azimuthDeg?, maxPanels?, latitude?, longitude? }` | Overrides the home's roof. `roofFromSolarResult(result)` builds it from `/api/solar` (undefined when Google has nothing). |
| `static?` | `boolean` | Always show the still image (slides, print). |
| `flyIn?` | `boolean` | Short camera fly-in on first render (default `true`). |
| `className?` | `string` | Width comes from the parent; height follows the aspect ratio (4:3, 16:10 from `md`). |

It is a `"use client"` component and loads the canvas with `next/dynamic` (`ssr: false`), so it is safe in server
pages. Pass a new `design` object after a refine and only what changed animates.

## Behaviour

- **Design changes** (springs, interruptible): panels drop in row by row from the gutter and land with a slight bounce;
  battery modules (≈ 2.5 kWh each) stack in and the gauge springs to the state of charge; adding a wallbox drives the
  car in from the street, removing it drives the car out; the heat pump fan turns with its load.
- **Modelled day** (`energyDay.ts`): clear-sky PV on the real roof plane (NOAA sun position; Munich unless the roof
  gives a location), H0-like household load scaled to `annual_kwh`, PV-surplus car charging (1.4–3.7 kW), small
  heat-pump load, forecast-based battery charging, then the grid. Labelled "Sunny day in May, modelled" in the UI.
- **Camera**: fly-in (≈ 1.6 s; any drag, pinch or key skips it), presets Street / Roof / Garage (re-click resets).
  Vertical swipes scroll the page; the wheel zooms only with Ctrl/⌘.
- **Accessibility**: live panel rows are buttons (keyboard, hover, tap) that show size + the engine's first reason; a
  live region carries it for screen readers; the slider has a text value.
- **Reduced motion**: no fly-in, no dash motion, design changes and the sun apply instantly.
- **Still image** (`/models/house-fallback.png`, `-dark.png`: house and panels only) when WebGL is missing, data saver is
  on, the device has ≤ 2 cores, WebGL fails or `static` is set; also shown until the first 3D frame.
- **Performance**: ~6k triangles, one 2048² shadow map, contact shadows, GTAO ambient occlusion at half resolution.
  Measured on an Apple M5 (MacBook Air class) in Chrome at DPR 2 while the day plays: 60 fps, p95 frame 18 ms, no long
  tasks. Slower GPUs drop AO first, then DPR (2 → 1.5 → 1); monitoring starts after load.

## Files

`layout.ts` (panel placement), `sceneSpec.ts` (design → what is shown, labels), `energyDay.ts` + `sun.ts` (the day),
`spring.ts`, `solarRoof.ts`, `houseGeometry.ts` / `equipmentGeometry.ts` (procedural models; Blender was not
available), `Scene.tsx`, `AmbientOcclusion.tsx`, `Equipment.tsx`, `EnergyFlow.tsx`, `CameraRig.tsx`, `Tooltip.tsx`,
`House3D.tsx`. Tests: `npm test`.

Deck stills and the day recording (live engine designs, no mock): `node scripts/house/export-stills.mjs` from `web/`
(header of that file lists the options; output goes to the git-ignored `docs/deck/out/3d/`, `--upload` puts it on the
`data-v1` release). Portrait frames (narrower than 5:4) widen the field of view so the model keeps its width.

Regenerate the still images: render the component (light, then dark) with reduced motion and with equipment and flow
lines temporarily hidden, screenshot the model area at 1600×1000 and replace the two PNGs in `web/public/models/`.
