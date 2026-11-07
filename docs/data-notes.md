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
