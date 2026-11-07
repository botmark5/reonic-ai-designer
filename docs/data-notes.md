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

## expert_designs.parquet schema
File: `engine/artifacts/expert_designs.parquet` (built by `engine/labels.py`, never committed: derived from Reonic data).
One row per project × offer option. Projects without any parts (20 + 6) are not in the file.
Units are fixed: power kW, PV kWp, energy kWh, price €/kWh. Missing numbers are NaN, never 0, unless stated.
Status: v1 schema, agreed before implementation. Columns may be added; existing ones will not change meaning.

### Identity and variants
| column | type | unit | meaning |
|---|---|---|---|
| installer | str | | data folder id: `2a8ba8e2` or `23c108b7` |
| project_id | str | | project (= one home); group train/test splits by this |
| customer_contact_id | str | | customer; 41 customers have 2 projects, so also group splits by this |
| option_id | str | | offer option id (1:1 with option_number) |
| option_number | int | | variant number as entered by the planner (1–19, gaps common) |
| is_primary | bool | | the training label row: lowest option_number present in the project (option 1 is missing in ~1/3 of projects) |
| n_options | int | | number of options in the project |
| is_duplicate_option | bool | | same line items and quantities as a lower-numbered option of the same project |
| offer_type | str | | `new_system` (new PV modules, with or without battery/wallbox/heat pump), `pv_extension` (PV added to an existing PV), `battery_retrofit` (battery without new PV, may include wallbox), `wallbox_only`, `heatpump_only`, `no_components` |
| is_full_design | bool | | `offer_type == "new_system"`; main model and evaluation use only these rows |
| pv_kwp_min, pv_kwp_max | float | kWp | range of pv_kwp over the project's options with the same is_full_design value |
| battery_kwh_min, battery_kwh_max | float | kWh | same range for battery_kwh (0 counts: "no battery" is a valid variant) |

### Expert design (the labels)
| column | type | unit | meaning |
|---|---|---|---|
| pv_kwp | float | kWp | new PV size; 0 when the option has no new PV |
| pv_panels | float | panels | number of new modules; NaN when only a package name gives the size |
| pv_source | str | | `module_lines`, `package_name`, `substructure`, `roof_mounting`, `none` |
| pv_wp_assumed | float | W | assumed W per panel when the data has no module wattage (450); NaN when wattage came from the data or a package name |
| battery | bool | | battery_kwh > 0 |
| battery_kwh | float | kWh | total new storage (main unit + extensions); 0 = no battery |
| battery_source | str | | `numeric_column`, `name`, `package_name`, `none` |
| wallbox | bool | | option contains a wallbox |
| wallbox_kw | float | kW | charging power (11 or 22); NaN when no wallbox |
| heatpump | bool | | option contains a heat pump |
| heatpump_kw | float | kW | nominal heat pump power from the product name; NaN when none |
| inverter_kw | float | kW | sum of inverter power when inverter lines exist; NaN otherwise (2a8ba8e2 almost never lists inverters) |
| roof_type | str | | from substructure/DC-install names (`Concrete Tile`, `Clay Tile`, `Concrete`, `Clay`, `Flat`, `Metal`, `Bitumen`, `Slate`, `Standing Seam`, `Beaver Tail`, `Trapezoidal`, …); `Mixed` when several; `Unknown` when none |
| has_scaffolding | bool | | scaffolding / site-safety line present |
| has_backup | bool | | emergency-power / backup box line present |
| brand | str | | main system brand (battery/inverter/wallbox brand, e.g. Huawei, EcoFlow, Sigenergy); `Unknown` when none |
| n_line_items | int | | number of line items in the option |

### Home features (cleaned status quo, same for every option of a project)
| column | type | unit | meaning |
|---|---|---|---|
| offer_created_at | datetime | | offer date; falls back to first_signed_at when empty |
| annual_kwh_raw | float | kWh | yearly consumption as entered |
| annual_kwh | float | kWh | cleaned consumption: NaN when the entry is the 4,500 kWh default or invalid (< 1,500 kWh) |
| demand_is_default | bool | | entered value is exactly 4,500 kWh, the Reonic default (32% / 20% of projects) |
| demand_is_invalid | bool | | entered value < 1,500 kWh (21 projects at 0–1 kWh) |
| consumption_known | bool | | not default and not invalid; use this to report evaluation separately for homes with real consumption |
| price_eur_kwh | float | €/kWh | electricity price; one value entered in €/kWh is fixed, 0 → NaN |
| price_increase | float | fraction/yr | expected price growth (0.03 = 3%) |
| flex_tariff_eur_kwh | float | €/kWh | dynamic-tariff price; mostly NaN |
| load_profile | str | | H0 (default, = household type unknown), FamilyOfFour, HomeOfficeOnePerson, … |
| has_ev | bool | | home has or plans an EV |
| ev_km_year | float | km | yearly EV distance; NaN when unknown |
| existing_pv_kwp | float | kWp | PV already on the roof; NaN when none |
| existing_battery_kwh | float | kWh | battery already installed; NaN when none or when the entry is the planned battery (see flag) |
| existing_battery_is_planned | bool | | has_storage was set but built year ≥ offer year, i.e. the planner entered the battery being sold |
| has_existing_wallbox | bool | | wallbox already installed |
| heating_type | str | | existing heating: Heatpump, Gas, Oil, OtherNonRenewable, OtherRenewable, `Unknown` (88% empty) |
| heating_demand_kwh | float | kWh | yearly heating demand; mostly NaN |
| heating_electricity_kwh | float | kWh | electricity used by an existing heat pump; mostly NaN |
| house_sqm, house_built_year, inhabitants | float | m², year, persons | < 1% filled; planner-entered optional inputs only |

### Flags
| column | type | meaning |
|---|---|---|
| is_outlier | bool | pv_kwp > 30 or battery_kwh > 40 (commercial-size); exclude from training and evaluation |
| pv_sources_disagree | bool | two PV sources in the option give different sizes; the value kept follows the source order in the rules |
