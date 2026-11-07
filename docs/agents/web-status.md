# Web status (updated by the web agent at the end of each session)

_Web agent: replace this with what changed, what is next, what is blocking, and any change to how you call the engine._

## c-3d (3D house, web/src/components/house3d)
- Changed: `<House3D>` is now an architectural model (matte white, AO, contact shadows, golden-hour sun) with a
  time-of-day slider driving a modelled sunny May day (flows, live kW, battery %), spring animations for design changes,
  camera fly-in and Street / Roof / Garage presets. New optional props: `flyIn`, `roof.latitude` / `roof.longitude`;
  new helper `roofFromSolarResult()` turns a `/api/solar` result into the `roof` prop (undefined → defaults).
- Engine: no change. House3D only reads `design.*.include / kwp / kwh / kw / reasons` and `home.annual_kwh`,
  `ev_km_year`, `tilt_deg`, `orientation_deg`. The modelled day is illustrative and labelled so in the UI.
- Next: none planned; mount details in `web/src/components/house3d/README.md`.
- Blocking: nothing.
