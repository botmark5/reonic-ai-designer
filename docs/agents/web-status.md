# Web status (updated by the web agent at the end of each session)

_Web agent: replace this with what changed, what is next, what is blocking, and any change to how you call the engine._

## b-web (planner, reality check, ui, theme; web/src/components/{planner except live-call.tsx, reality, ui}, app/{page, reality, login}, globals.css, layout.tsx)
Updated Sun 04:05.
- **Theme (#63):** light only (forced, no system follow); muted/AI/warning text darkened for AA on tints, page surface separates white cards on a projector.
- **Planner A (#68):**
  - Centre column = header → HouseStage (16:9) → refine box → 2×2 cards.
  - Card hover highlights its part on the house; clicking a part points at its card.
  - The changed card keeps the highlight fill and shows old → new.
  - `location` (from /api/solar's geocode of the planner's address only) adds Outside/Inside + Sun map toggles and `editable`.
  - Cross-cutting: the header uses the name or address; reasons de-duplicated, 2 shown; heat pump "Option · 10.5 kW" chip; "96 % similar" (id in a tooltip); short nav labels at 390 px.
- **Reality A (#72):**
  - Two procedural HouseStages ("Our design" | "What the expert sold", `cameraKey="reality"`, `controls="minimal"`) with the table of sizes and verdicts under them.
  - One headline tile (new-systems solar error, "Level with rule"), then the add-on block (no new solar 77 vs 6 %).
  - "Level with rule" = within 2 points, or 5 % of the rule's kWp error.
  - Battery retrofit chip hidden until engine #47 (`HIDDEN_ROLES`); project ids only in tooltips; installers shown as A/B.
- **Save/share (this PR):** planner saves run in order through a queue; "Send to homeowner" waits for pending saves, so the link carries the latest refine (race seen by e-spare).
- **Engine calls:** unchanged. **Next:** polish loop at 1440/390; a-labels' curated case ids when they arrive.

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
- Changed: household answers in words are now parsed (EN + DE: "family of four", "zu zweit", "couple with two kids",
  "5+"), in create-design and post-call. `daytime_presence` sets the engine's own one-person presets
  (`HomeOfficeOnePerson` / `FullTimeOnePerson`); larger households keep `H0`. Earlier: EV without km → 15,000 km/year,
  `demand_is_default: false` for a stated use or bill, existing-solar question asked early.
- Engine: no new fields; only existing `load_profile` preset names are sent.
- Next: signed post-call test once the webhook secret is available locally; one paid explain + TTS check after Mark's OK.
- Blocking (needs-human, Mark): GOOGLE_MAPS_API_KEY (Solar answers `no_key`), OK for a paid TTS test.
