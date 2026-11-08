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

## HouseStage (mount this one)
`<HouseStage>` is the single 3D component pages mount. Today it renders the procedural house; real 3D tiles
outside (behind `?tiles=1` / `NEXT_PUBLIC_HOUSE_TILES=1`, needs `location`) and the inside diorama land behind the
same props. Props not yet supported by a renderer are accepted and ignored. Full prop list: `HouseStage.tsx`.
`/reality` never passes `location` (Reonic projects have no address; we never geocode Reonic data).

### Live today (procedural house)
- `reveal`: shell rises out of the board → roof settles → existing PV / new panels drop row by row → inverter (with
  the first panels) and battery modules stack in → car drives in with the wallbox → heat pump stands as a ghost for
  0.9 s, then solid. Energy only flows through parts already on stage. Omit `reveal` for the whole design at once.
- `highlight` / `onSelect`: emphasise a part from outside (tooltip + readout row); clicks in the scene or the
  readout report the picked part (null on empty space).
- `cameraKey`: stages with the same key share one orbit in house coordinates; whichever the viewer touched leads.
- `timeOfDay` / `onTimeOfDayChange`: controlled time; Play is hidden when controlled without a change handler.
- `labels`: always-on projector labels (Solar kWp, Battery kWh, Wallbox kW, Heat pump kW).
- `controls`: "full" (time bar + readout UNDER the model), "minimal" (camera presets), "none".

### Real outside (site3d, behind a flag)
- On with `?tiles=1` or `NEXT_PUBLIC_HOUSE_TILES=1`; needs `location` and `NEXT_PUBLIC_GOOGLE_MAPS_TILES_KEY`
  (referrer-locked: production, localhost:3123, localhost:3125). `?tiles=0` forces it off, `?static=1` forces the still.
- Google photorealistic 3D tiles re-centred on the address (+x east, −z north, like the model). Panels come from
  `/api/solar/panels` (d-voice): each roof segment sits at Google's plane height + one geoid offset calibrated by
  rays onto the photogrammetry (low quartile of 9 rays per segment, median over segments, rejected if implausible).
- Falls back to the procedural house (silently, once per address) on: no key, no location, placement not ok,
  tile error before the first tile, no tiles within ~6 s, a crash. "Model view" switches by hand.
- Google attribution is always visible bottom-left. `reveal.panels` drops the panels row by row; `labels` shows chips.
- f-hero extras: `reveal.warm` (windows glow), heat pump shown as a permanent ghost when only offered
  (`design.options.heatpump.available`) and `reveal.heatpump` is on.
- Sun map (`sunMap` prop, or the "Sun map" button when omitted): d-voice's `/api/solar/layers` image draped on every
  tile surface by a world-position shader patch (chained with the tiles fade shader), fetched for the panels' centre
  so both line up; legend top-left. Procedural house: no sun map (the flux is real data for the real roof).

### Inside (view="inside", or the Outside / Inside switch when `view` is omitted)
- A section model: basement (sunk), garage, outside wall. The planner drags battery, inverter, heat pump and wallbox
  along the wall; allowed zones tint in the part's colour while dragging; a drop snaps to the nearest free slot or
  springs back with the reason ("The heat pump needs outside air."). Rules: `insideRules.ts` (pure, tested).
- Accessible twin: a zone picker per part under the model (disabled options = not allowed), live status line.
- `onZonesChange(zones)` reports the planner's choice. Labels sit on the floor in front of each part (hidden < sm).
- kWp sizes keep two decimals (11.25, not 11.3). Offered-only heat pump gets an "option N kW" label.
- drei `Html` under React 19: the first instance in a canvas can lose its root; both scenes mount a hidden placeholder first.
