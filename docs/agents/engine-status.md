# Engine status (updated by the engine agent at the end of each session)

## Sun 00:00
**Deployed:** the engine runs on **Railway** with a fixed URL (sent to Mark by DM, never in the repo). Same
`X-Engine-Key`. Claude calls work from Railway. The Cloudflare tunnel is the backup (its URL changes on restart).
Web: set `ENGINE_URL` in Vercel to the Railway URL.

**Done since the last update (all on main or in the PR named below):**
- #27 roof inputs: `home.roof_max_kwp` caps PV (whole 450 W panels, reason shown, lock above it flagged
  `ROOF_CAPACITY_EXCEEDED`); `home.roof_azimuth` (180 = south) and `home.roof_pitch` drive yield/autarky via PVGIS.
- #29 P10–P90 calibrated (conformal): contains the expert PV size in 79–80 % of locked-test projects (was 74–75 %).
- Mark's demo bugs: a typed 4,500 kWh is a real value at /design; an EV adds a wallbox and +1.3 to +1.8 kWp PV.
- Model-or-rule per yes/no decision, picked on training CV: wallbox = "EV -> wallbox" rule; battery in new systems =
  "always". The engine is never worse than the simple rule on CV.
- Battery size = mean of the classifier and the installer's kWh-per-kWp rule (full designs: within one catalogue step
  49 -> 54 %, MAE 2.69 -> 2.64 kWh on the locked test set).
- Physics uses PVGIS (EU JRC) yield per tilt x orientation and the real monthly split.
- Tested and NOT shipped: PV linear blend (CV +2 %, neutral on test, fewer exact package matches), roof type as an input
  (no gain), random forest / kNN / HistGB (not better than LightGBM).
- Before/after per improvement + error analysis: `engine/RESULTS.md`. Headline = new full systems; add-on sales separate.

**Next:** keep the Railway deploy in sync after each merge; answer `for:engine` issues.

**API changes (all additive, see the end of docs/api.md):** `home.has_existing_pv`, `home.roof_max_kwp`,
`home.roof_azimuth`, `home.roof_pitch`; response `options.heatpump`, `economics`, `physics.flags`, `battery.alternatives`.

**Blocking:** nothing. Human item: #35 (Vercel check fails on commits authored by Cala-rgb).
