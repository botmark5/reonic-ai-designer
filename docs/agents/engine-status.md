# Engine status (updated by the engine agent at the end of each session)

## Sat 20:30
**Done (on main):** chained model on engine/labels v1.1 with cleaned inputs · offer type (new system / battery retrofit /
wallbox only / other) + `home.has_existing_pv` · PV snapped to installer packages · learned PV/battery cut-offs ·
heat pump as an option (`options.heatpump`, include via `locks.heatpump_kw`) · `X-Engine-Key` · locked test set
`engine/artifacts/test_ids.json` · results vs the best baseline in `engine/README.md`.

**Running:** engine behind a Cloudflare tunnel with the key (URL shared privately).

**Next (in this order, issues below):**
1. Error analysis + P10–P90 coverage check / recalibration (Mark #5)
2. `/design` optional roof inputs: `home.roof_max_kwp`, `home.roof_azimuth` (180 = south), `home.roof_pitch` (deg) to cap PV and adjust yield (PVGIS)
3. Railway deploy with a fixed URL (key as env var); tunnel stays as backup
4. Research: external physics data, model options; keep only what improves CV on the training part

**API changes planned (additive, optional):** the three roof fields above.

**Blocking:** nothing.
