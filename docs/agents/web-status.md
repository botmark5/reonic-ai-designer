# Web status (updated by the web agent at the end of each session)

_Web agent: replace this with what changed, what is next, what is blocking, and any change to how you call the engine._

## b-web (planner, live call, reality check, homeowner offer; web/src outside house3d and voice)
- Changed: roof inputs (engine #27): when a design has an address, the planner asks GET /api/solar and sends
  `home.roof_max_kwp` (Google max panels × panel watts), `home.roof_azimuth`, `home.roof_pitch` to /design once;
  the planner sees, edits or removes them ("Roof size and direction"); omitted when Google has nothing. The same
  roof drives `<House3D roof>`. The offline estimate also respects the roof cap.
- Changed: /reality reads both /eval shapes: headline from `segments.full_designs` when present (else all projects),
  `segments.add_ons` as a separate block; P10–P90 coverage tile (new full systems) + add-on row from
  `pv_interval_coverage_pct` (#43/#46). All headline tiles, the add-on block and coverage read the ANSWERED mode
  (`with_existing_pv_answer.segments`) when present; coverage rows need pv_n >= 20. Ties read "Same as rule".
- Changed: /reality "Battery retrofit" example is labelled "Unanswered mode" while /project designs without the
  existing-PV answer (#47); the label disappears by itself once the engine returns a battery retrofit for it.
- Changed: with no new PV (pv.include=false) the PV range is hidden from the planner card and from the refine agent
  (no lock to a range end of a retrofit design).
- Smoke (Sun 00:20, live engine): EV refine on 4,500 kWh / no existing PV: PV 9.45 → 10.8 kWp, battery 9.2 → 10,
  wallbox on. Roof cap 6 → PV 5.85 kWp, battery 5 kWh. No GOOGLE_MAPS_API_KEY locally or on prod → /api/solar
  says no_key and the planner silently keeps the default roof. Gate on prod: / 307, APIs 401, /offer + health public.
- Engine calls: unchanged (server routes only, X-Engine-Key, 4 s fallback). Optional request fields: the three roof fields.
- Next: Google key (Mark) to see a real roof end to end; drop the #47 label check once the engine fix lands.
- Blocking: nothing.

## c-3d (3D house, web/src/components/house3d)
- Changed: `<House3D>` is now an architectural model (matte white, AO, contact shadows, golden-hour sun) with a
  time-of-day slider driving a modelled sunny May day (flows, live kW, battery %), spring animations for design changes,
  camera fly-in and Street / Roof / Garage presets. New optional props: `flyIn`, `roof.latitude` / `roof.longitude`;
  new helper `roofFromSolarResult()` turns a `/api/solar` result into the `roof` prop (undefined → defaults).
- Changed (#54): the 3D roof follows the planner's `roof_azimuth` / `roof_pitch` (over the `roof` prop); `roof_max_kwp`
  caps the new panels drawn; `existing_pv_kwp` panels are drawn (8 kWp assumed when `has_existing_pv` has no size, as in
  the engine), so battery retrofits show their solar. Deck stills + day video: `web/scripts/house/export-stills.mjs`
  (outputs on the data-v1 release as `deck_3d_*`).
- Engine: no change. House3D reads `design.*.include / kwp / kwh / kw / reasons` and `home.annual_kwh`, `ev_km_year`,
  `roof_*`, `existing_pv_kwp`, `has_existing_pv`, `tilt_deg`, `orientation_deg`. The modelled day is labelled in the UI.
- Next: none planned; mount details in `web/src/components/house3d/README.md`.
- Blocking: nothing.

## d-voice (voice agent backend + Google Solar, web/src/app/api/{voice,solar}, web/src/lib/{voice,solar}.ts)
- Changed: voice drafts now send `ev_km_year: 15000` when the caller has an EV but gave no distance (same as the planner
  form; otherwise the engine gives no wallbox), and `demand_is_default: false` when the caller stated use or a bill.
  docs/voice-agent.md asks the existing-solar question early and uses `<APP_URL>` instead of a host.
- Engine: no new fields; `demand_is_default` is an optional extra the engine ignores until it supports it.
- Next: signed production smoke (create-design + post-call with a good and a bad HMAC), then delete the test rows.
- Blocking (needs-human, Mark): ELEVENLABS_WEBHOOK_SECRET, GOOGLE_MAPS_API_KEY, voice choice before audio is enabled.
