# Engine API contract (v0 — change only when Cala and Mark both agree)

## POST /design
Request:
{ "installer": "2a8ba8e2",
  "home": { "annual_kwh": 4500, "price_eur_kwh": 0.32, "load_profile": "H0", "has_ev": false, "ev_km_year": null,
            "existing_pv_kwp": null, "existing_battery_kwh": null, "heating": "Gas", "heating_demand_kwh": null,
            "roof_type": null, "house_sqm": null, "inhabitants": null },
  "locks": { "pv_kwp": null, "battery_kwh": null, "wallbox": null, "heatpump_kw": null } }
Response:
{ "design": {
    "pv":       { "include": true,  "kwp": 9.0,  "range": [8.1, 10.4], "confidence": 0.78, "reasons": ["..."] },
    "battery":  { "include": true,  "kwh": 10,   "range": [7, 10],     "confidence": 0.71, "reasons": ["..."] },
    "wallbox":  { "include": false, "kw": null,  "confidence": 0.90,   "reasons": ["..."] },
    "heatpump": { "include": false, "kw": null,  "confidence": 0.60,   "reasons": ["..."] } },
  "physics": { "yield_kwh": 8550, "self_consumption": 0.62, "autarky": 0.71, "warnings": [] },
  "similar_homes": [ { "project_id": "...", "annual_kwh": 4400, "pv_kwp": 9.0, "battery_kwh": 10, "similarity": 0.93 } ],
  "facts_for_explanation": { "...": "engine facts Claude turns into prose" },
  "model_version": "v0" }

## POST /validate
Request: { "installer": "...", "home": {...}, "design": { "pv_kwp": 14, "battery_kwh": 15, "wallbox": true, "heatpump_kw": null } }
Response: { "flags": [ { "component": "battery", "level": "warn", "percentile": 96, "message": "Larger than 96% of similar homes" } ] }

## POST /refine   (Claude Haiku: text → input changes; then calls /design)
Request: { "text": "family is buying an EV next year", "home": {...}, "locks": {...} }
Response: { "changes": { "has_ev": true, "ev_km_year": 15000 }, "design": { ...as /design... } }

## POST /explain  (Claude Sonnet, streamed): { "design_response": {...}, "audience": "planner" | "homeowner" } → text

## GET /eval → { "metrics": {...}, "by_installer": {...}, "baselines": {...} }
## GET /project/{id} → { "home": {...}, "expert": {...}, "variants": [...], "ours": {...} }

## Additions (engine, additive and optional; nothing renamed or removed)
- `home.has_existing_pv`: true / false / null ("Solar already on the roof?").
- `home.roof_max_kwp`, `home.roof_azimuth` (degrees clockwise from north, 180 = south), `home.roof_pitch` (degrees):
  from the Google Solar API. PV is capped at `roof_max_kwp` (whole 450 W panels; a planner lock above it is kept and
  flagged `ROOF_CAPACITY_EXCEEDED`); azimuth/pitch drive yield, self-consumption and economics (PVGIS factors).
- Response: `options.heatpump` (design with and without a heat pump), `economics`, `physics.flags`,
  `battery.alternatives`, `facts_for_explanation.offer_type`. Header `X-Engine-Key` on every endpoint except `/health`.
- `home.demand_is_default` (bool, optional): true only when `annual_kwh` was left at the tool's default 4,500 kWh. The model learned
  that this default often means "consumption unknown" (battery retrofits); a typed value is real (`false` / omitted). `/project/{id}`
  sends the flag as recorded in the data.
- `home.annual_kwh` below 1,500 kWh is rejected with HTTP 422 (placeholder entries; nothing can be sized from them).
- `battery.range` always contains `battery.kwh`; `battery.alternatives` are the classifier's own top catalogue sizes (shares > 0).
- Heat pump sizes (`options.heatpump.kw`, `heatpump.kw`) come from the installer's catalogue as sold (2a8ba8e2: 5.5 / 7.5 / 8 / 10.5 / 12.5 kW);
  the physics size check uses the same list.
