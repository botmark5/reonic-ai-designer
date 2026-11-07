# Web status (updated by the web agent at the end of each session)

_Web agent: replace this with what changed, what is next, what is blocking, and any change to how you call the engine._

## b-web (planner, live call, reality check, homeowner offer; web/src outside house3d and voice)
- Changed: roof inputs (engine #27): when a design has an address, the planner asks GET /api/solar and sends
  `home.roof_max_kwp` (Google max panels × panel watts), `home.roof_azimuth`, `home.roof_pitch` to /design once;
  the planner sees, edits or removes them ("Roof size and direction"); omitted when Google has nothing. The same
  roof drives `<House3D roof>`. The offline estimate also respects the roof cap.
- Changed: /reality reads both /eval shapes: headline tiles from `segments.full_designs` when present (else all
  projects), `segments.add_ons` as a separate small block, P10–P90 coverage tile once the engine reports
  `pv_interval_coverage_pct`. Offline still shows no numbers.
- Engine calls: unchanged (server routes only, X-Engine-Key, 4 s fallback). New optional request fields: the three roof fields.
- Next: deploy smoke test after each merge; passcode gate re-check once PLANNER_PASSCODE is set.
- Blocking: production engine unreachable (fetch failed at 23:40), so prod serves offline estimates until #28 / the tunnel is back.

## c-3d (3D house, web/src/components/house3d)
- Changed: `<House3D>` is now an architectural model (matte white, AO, contact shadows, golden-hour sun) with a
  time-of-day slider driving a modelled sunny May day (flows, live kW, battery %), spring animations for design changes,
  camera fly-in and Street / Roof / Garage presets. New optional props: `flyIn`, `roof.latitude` / `roof.longitude`;
  new helper `roofFromSolarResult()` turns a `/api/solar` result into the `roof` prop (undefined → defaults).
- Engine: no change. House3D only reads `design.*.include / kwp / kwh / kw / reasons` and `home.annual_kwh`,
  `ev_km_year`, `tilt_deg`, `orientation_deg`. The modelled day is illustrative and labelled so in the UI.
- Next: none planned; mount details in `web/src/components/house3d/README.md`.
- Blocking: nothing.
