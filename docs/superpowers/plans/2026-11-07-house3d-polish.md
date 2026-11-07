# House3D polish: architectural model + story features

> Executed natively (Mark's standing rule), fresh reviewer at the end. Branch `web/house3d-polish`.

**Goal:** make `<House3D>` the most beautiful thing in the demo: an architectural model in Reonic's brand where colour
appears only on the energy system, a time-of-day story with real sun and energy flows, and subtle spring animations
when the design changes. Public props stay compatible (B already mounts it).

**Design read:** interactive 3D centrepiece inside an operate-mode app, for planners and homeowners; architectural-model
language; R3F + drei + postprocessing (N8AO); Geist / Geist Mono; dials variance 5, motion 6, density 3.

## Before (screenshot 19:40)
Coloured house (beige walls, green trees/ground, brown door, blue glass, grey car), dashed flows in four component
colours, flat light with hard shadows, no AO, generic "Overview" naming, static flows that ignore time.

## Art direction (from Mark's brief)
- Matte warm-white model: walls/roof/trees/car in `#fdfdfb` + zinc neutrals; the model sits on a rounded base board;
  quiet `surface-0` background, no green.
- Light: golden-hour key light whose colour and angle follow the sun; hemisphere fill; neutral tone mapping so whites
  don't blow out; custom Lightformer environment (no network) for soft reflections; PCF soft sun shadows +
  ContactShadows + N8AO ambient occlusion (dropped first when PerformanceMonitor declines).
- Colour only on the system: dark glass panels (clearcoat, catches the sun), battery `#2f9fd0`, heat pump `#d4604a`,
  wallbox `#52525b`, flows in the AI gradient amber `#e9a23b` → orange `#ef8a4c` → salmon `#ec8a7c`.
- Labels Geist, numbers Geist Mono tabular.

## Story features
1. **Time of day** 06:00-22:00 (native range input, keyboard friendly). Sun from a real solar-position model
   (lat from Google Solar, default Munich 48.14 N 11.58 E, sunny mid-May day, CEST). A pure 15-minute day simulation
   (PV from sun elevation and roof incidence, H0-like household load, EV surplus charging, heat pump load, battery
   SOC with limits, grid import/export) drives which flows run, their direction and thickness, plus live numbers
   (solar kW, home kW, battery %, car kW, grid kW), labelled "Sunny day in May, modelled".
2. **Design changes animate** with springs (critically damped, slight bounce only on panel landing): panels drop row
   by row from the eave up; battery is stacked modules (≈2.5 kWh each) that stack in, its fill springs to SOC; a car
   rolls in from the street when the wallbox is added and back out when removed; heat pump fan turns with its load.
3. **Roof** faces `roof.azimuthDeg` / pitch from Google Solar (helper `roofFromSolarResult(result)` exported for B;
   home.orientation_deg/tilt_deg still honoured); panels `round(kWp/0.45)` in real rows inside margins (existing layout).
4. **Camera**: fly-in on first render (1.6 s, skipped by any pointer/wheel/key input or reduced motion); presets
   Street / Roof / Garage.

## Files (all in web/src/components/house3d)
- new `sun.ts` (solar position, light colour), `energyDay.ts` (day simulation + flowsAt), `spring.ts` (integrator) + tests
- `palette.ts`, `houseGeometry.ts`, `equipmentGeometry.ts`: model materials, base board, grid post, battery modules
- `Scene.tsx` (lighting, env, AO, contact shadows), `Equipment.tsx` (springs: panels, battery, car), `EnergyFlow.tsx`
  (gradient flows by time), `CameraRig.tsx` (fly-in, presets), `House3D.tsx` (time slider, live numbers, layout)
- web/package.json: `@react-three/postprocessing`, `postprocessing`

## Done when
60 fps-class on a MacBook Air (DPR ≤ 2, AO half-res and first to go), still-image fallback (regenerated), reduced
motion (no fly-in, no idle turn, static flows, instant changes), tests/lint/build green, fresh review, PR merged,
b-web told.
