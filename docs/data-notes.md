# Data notes and working assumptions

Data: `data/raw/<installer>/projects_status_quo.csv` (one row per project = the home before) and
`project_options_parts.csv` (offer line items per project and offer option = what the installer proposed).

| Folder | Projects | Projects with parts | Notes |
|---|---|---|---|
| 2a8ba8e2 | 1,277 | 1,257 | Huawei / EcoFlow / SAJ; PV modules not listed as items; per-panel items only |
| 23c108b7 | 342 | 336 | Sigenergy / GoodWe / FoxESS "Complete Package N … X kWp + Y kWh" bundles; modules 450–480 W listed |

## Assumptions (ours, not confirmed by Reonic — revisit if they answer)
- Each folder = one installer company. Model installer-aware.
- `energy_demand_wh` = yearly household consumption in Wh (4,500,000 = 4,500 kWh/yr).
- `energy_price_per_wh` = €/Wh (0.00032 = 0.32 €/kWh). `energy_price_increase` = yearly price growth (0.03 = 3%).
- `load_profile`: H0 = German BDEW standard household profile (the default); FamilyOfFour, HomeOfficeOnePerson,
  FullTimeOnePerson, SeniorOnePerson, … = Reonic presets describing household type / daytime presence. Useful as a feature
  (daytime presence raises self-consumption → favours more PV, less battery). Treat H0 as "unknown household type".
- `technology`: solar = PV, ses = storage (battery system), wallbox, heatpump.
- `has_solar`, `has_storage`, `has_wallbox`, `heating_existing_type` = what the home ALREADY has before the project.
  `heating_existing_type = Heatpump` = existing heat pump, not one being sold. Projects with existing PV are retrofits / extensions.
- Offer options (`option_number` / `option_id`) = variants of one offer (e.g. same 20 panels, battery 7 / 10 / 14 kWh).
  ~22% of projects in 2a8ba8e2 have 2+ variants. Which one was signed is NOT recorded.
  → Primary label = option 1 (decide after profiling); keep ALL variants as the "acceptable range" for evaluation
  (hit = prediction inside the variant range) and as the options a homeowner may choose between.
- 2a8ba8e2 panel count = quantity of per-panel items (substructure, DC install, optimizer). Module wattage unknown →
  assume 450 W (the other installer lists 450–480 W); report sensitivity for 430 / 450 / 475 W.
- Battery kWh from names ("Battery LFP 10kWh", "Sigenergy AIOS Battery 9kWh", "+ 9kWh"), summing extensions; the numeric
  `battery_capacity_kwh` column is almost always empty (and in Wh when present).
- New heat pumps appear in < 10 projects → heat pump = rules + physics (heating demand ÷ full-load hours), stated openly.
- House size and inhabitants are almost always empty → planner-entered optional inputs, not model features.
- No prices in the data → savings/payback use stated market assumptions (see PLAN business case).

## Physics assumptions (engine/physics.py, branch engine/physics)
Hourly synthetic year (8,760 h), deterministic with a fixed seed. Synthetic shapes, NOT the official BDEW / weather tables.
- PV: 950 kWh/kWp/yr for south ~30–35°; orientation/tilt factor grid (E/W 30° ≈ 0.85, flat ≈ 0.88, north 30° ≈ 0.62,
  vertical south ≈ 0.70). Missing orientation/tilt → south, 30° (reported in `assumptions`). Monthly split of the yearly
  yield (Jan 2.7 % … Jul 13.6 %), daylight bell at 48° N, east roofs peak earlier, west later.
- Weather: seeded sunny/cloudy factor per day (Beta 0.7/0.9, darkest day 2 % of clear) + hour-to-hour PV spread
  (lognormal σ 0.4); each month keeps its share of the yearly yield.
- Household load: H0-like 24 h shape; Reonic presets as multipliers on day/morning/evening presence
  (HomeOffice/Senior ↑ day, FullTime ↓ day, Family ↑ morning+evening); weekend daytime ×1.2; seasonal ±17 %;
  hour-to-hour appliance spread (lognormal σ 0.9). `CustomFromEditor`/unknown → H0.
- EV: km/100 × 18 kWh, charged 18–23 h (option "solar": 10–15 h). Unknown distance → 12,000 km.
- Heat pump: size = heat demand / 2,450 full-load hours (median of the 13 heat-pump projects of 2a8ba8e2), snapped to
  5/7/10/12 kW; electricity = heat demand / SCOP 3.5, by heating-degree-day month share + 15 % flat hot water.
  Only for gas/oil/other non-renewable heating; never if a heat pump exists or the installer sells none.
- Battery: 90 % usable, 0.5 C, 95 % one-way efficiency, self-consumption-first dispatch.
- Self-consumption = PV used in the home / PV produced; autarky = PV used in the home / consumption.
- Calibration (tests enforce it): 4,500 kWh + 5 kWp → SC 30 % / autarky 32 %; + 5 kWh battery → 54 %;
  10 kWp + 10 kWh → 76 % (HTW-Berlin rule-of-thumb ranges). Known optimism: very small homes with large systems
  (3,000 kWh, 10 kWp + 10 kWh → 88 %, real ~80–85 %).
- Economics: every price is a placeholder in `engine/config/economics.toml` (data has no prices).

## Label table contract (proposed by engine/physics — engine/labels please confirm or tell Cala)
`engine/evaluate.py` reads `engine/artifacts/expert_designs.parquet` (or .csv). **One row per project × offer option.**

| column | type | required | meaning |
|---|---|---|---|
| project_id | str | yes | joins to projects_status_quo.csv |
| installer | str | yes | folder name, e.g. 2a8ba8e2 |
| option_number | int | yes | offer option number |
| is_primary | bool | yes | exactly one True per project (the expert design we score against) |
| has_pv / pv_kwp | bool / float | yes | pv_kwp = 0 when no PV |
| has_battery / battery_kwh | bool / float | yes | battery_kwh = 0 when no battery; extensions summed |
| has_wallbox | bool | yes | |
| has_heatpump / heatpump_kw | bool / float | yes | heatpump_kw = 0 when none |
| option_id, wallbox_kw, inverter_kw | str / float | optional | |

Home inputs are NOT needed in the label table: evaluate.py joins them from data/raw (`load_inputs()`, api.md names).
Variant range per project = min/max of pv_kwp and battery_kwh over all its options (computed by evaluate.py).
`engine/artifacts/catalogue.json` is read as `{installer: [battery sizes]}` or `{installer: {"battery_kwh": [...]}}`;
if absent, sizes seen ≥ 5× per installer in the labels are used.

## Evaluation protocol (engine/evaluate.py)
- Held-out: 80/20 split by project_id, stratified by installer, seed 42. Transfer: train on one installer, test on the other.
- Truth = primary option. PV MAE on projects with expert PV; battery MAE + "within one catalogue step" on projects with
  an expert battery (predicting no battery = size miss). Yes/no accuracy per component. NaN predictions = misses
  (excluded from MAE but counted).
- Variant-range hit rate on all projects: strict = inside [min, max]; tolerant = PV ± 1.0 kWp, battery ± 1 catalogue step
  (step 0 = no battery).
- Baselines: kWp = annual kWh / 1000 (battery = installer's most common size, yes/no = majority), and median/mode per
  installer × consumption band (0–2.5–3.5–4.5–5.5–7–9–∞ MWh).

## Offer type and the existing-PV question (engine/model.py)
- Offer type per option (engine/labels v1.1 names): new_system, pv_extension, battery_retrofit, wallbox_only, heatpump_only,
  no_components. Interim labels derive it from the parsed design + recorded existing PV.
- ASSUMPTION: a battery-only offer means PV is already on the roof (a battery without PV makes no sense). The planner's
  answer to "Is there already PV on the roof?" is therefore taken as yes for battery_retrofit / pv_extension, no for
  new_system, unknown for wallbox_only / other. `has_solar = False` in the data means "not answered", not "no".
- Training uses every project twice (answered + unanswered) so the model works with and without the answer.
