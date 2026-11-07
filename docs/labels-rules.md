# Expert-design extraction rules (Phase 1, steps 2 + 3)

Status: APPROVED by Mark 2026-11-07 (roof: option a; primary prefers full designs; install-only wallbox = yes, kW unknown). Implements the schema in `docs/data-notes.md` → "expert_designs.parquet schema".
Every rule works on the line items of ONE option (project × option_number). Examples are real options
(installer prefix · project id prefix · option number). Raw column names are used as they are in the CSV;
remember they are shifted: `inverter_power_kw` holds battery Wh, `battery_capacity_kwh` holds inverter W.

Approved decisions this builds on: primary = lowest option_number present · 2a8ba8e2 panels = 450 W ·
battery from numeric column, name fallback · keep every row with offer_type + is_full_design ·
flags for bad status-quo values; default 4,500 kWh = consumption unknown.

---

## Step 2 — extraction rules

### R1 PV size (pv_kwp, pv_panels, pv_source, pv_wp_assumed, pv_sources_disagree)
Per-panel count sources: `Substructure *` qty, `DC Install *` qty (2a8ba8e2), `Roof Mounting *` qty without
"Surcharge" (23c108b7), `Module` rows (qty × `module_watt_peak`). Packages: `PV Complete Package N kW` (2a8),
`Complete Package … X kWp + Y kWh` (23c).

Order (first that applies wins; any other source that gives a different size sets `pv_sources_disagree`):
1. **Module lines** with wattage → Σ qty × `module_watt_peak`. If a 23c package is also present:
   module lines are the total count (planner up- or downsized the package), EXCEPT
   (a) module qty < half the package's panel count → package + module lines (an extra panel), and
   (b) module qty == package panel count and an "N x Extra PV Module" / "N Additional Modules" line exists → add N × that wattage.
2. **23c package name** X kWp (+ named extras "N Additional Modules" × 450 W).
3. **2a8 per-panel count** × 450 W: Substructure qty summed over roof types; if Substructure ≤ 1 and DC Install > 1, use DC Install.
   A per-panel count beats a 2a8 "PV Complete Package N kW" name.
4. **2a8 package name** N kW → N kWp (panels NaN).
5. **23c Roof Mounting** qty × 450 W, only if qty ≥ 2; else Substructure qty ≥ 2 × 450 W.
6. **23c size band** only ("Substructure 6-8.8kWp" with qty 1) → band midpoint, source `size_band`.
7. Nothing → pv_kwp 0, source `none`.

pv_wp_assumed = 450 when rule 3 or 5 used, else NaN.

| # | option | line items (short) | result | why |
|---|---|---|---|---|
| 1 | 2a8·eddf2e3e·1 | Substructure Concrete Roof 19, DC Install 19, Optimizer 19, Scaffolding 19 m² | 19 panels, 8.55 kWp, substructure | standard case; scaffolding qty is m², ignored |
| 2 | 2a8·863de616·5 | Substructure 1, DC Install 13, Optimizer 13 | 13 panels, 5.85, disagree | Substructure ≤ 1 → DC Install |
| 3 | 2a8·9b596ef2·2 | Substructure 30, DC Install 1 | 30 panels, 13.5, disagree | substructure wins |
| 4 | 2a8·ec1d4552·1 | Substructure 18, DC Slate 9 + DC Concrete Tile 12 | 18 panels, 8.1, disagree | substructure wins (scaffold 18 m² agrees) |
| 5 | 2a8·1f4d7dc1·1 | Substructure Clay 2 + Flat East/West 4 | 6 panels, 2.7 | sum over roof types |
| 6 | 2a8·e02367b6·1 | PV Complete Package 5kW, no per-panel lines | 5.0 kWp, panels NaN, package_name | package fallback |
| 7 | 2a8·77df6fee·1 | PV Complete Package 8kW + DC Install 20 | 20 panels, 9.0, disagree | per-panel count beats 2a8 package (optimizer counts vs package kW are inconsistent: 300–1,500 W/panel in 26 options) |
| 8 | 2a8·896f0b7f·3 | PV Module 475W ×5, Substructure 5 | 5 panels, 2.375, wp_assumed NaN | module wattage known |
| 9 | 2a8·3e24b41b·1 | solar-tagged: Meter Consolidation B, Travel – Extension | 0, none | fees only |
| 10 | 23c·874b9d41·1 | Package 10.8kWp + 9kWh, Roof Mounting 26, Substructure 26 | 10.8, disagree | package beats roof mounting (4 such conflicts) |
| 11 | 23c·821f5b66·3 | Package 10.8, Module 463W(col 450) ×27, "Additional Module" ×3 | 27 panels, 12.15 | module lines are the total |
| 12 | 23c·55b3d6c7·7 | Package 18kWp, Module ×16 @450 | 16 panels, 7.2, disagree | planner downsized |
| 13 | 23c·ff5cc577·6 | Package 13.5, Module 480W(col 475) ×1 | 13.975 | module qty < half of 30 → package + 1 |
| 14 | 23c·59cf2825·2 | Package 10.8, Module ×24 @475, "3x Extra PV Module 480W", Roof Mounting 3 | 27 panels @475 = 12.825 | module qty == package count + named extras |
| 15 | 23c·45e5cce2·1 | Package 6.3, "4 Additional Modules (14 in Package Price)" | 6.3 + 1.8 = 8.1 | named extras, no module lines |
| 16 | 23c·d34e6d77·1 | Substructure 1, Roof Mounting 35, Micro Inverter 2000W | 35 panels, 15.75 | roof mounting count; substructure 1 is a kit |
| 17 | 23c·5f600dc6·2 | Roof Mounting 1, Substructure 6-8.8kWp 1 | 7.4, size_band | only the band is known |
| 18 | 23c·b7d6755c·1 | Module ×222 | 99.9 kWp → is_outlier | commercial |

Module wattage in 23c: the column is the installer's planning value (name "463W" → 450, "480W" → 475); the package math uses
the same 450 W (24 × 450 = 10.8). We use the column.

### R2 Battery (battery_kwh, battery_source)
1. Σ over `BatteryStorage` rows of qty × `inverter_power_kw` / 1000, excluding "AC Coupling Module" (EcoFlow coupler, 1,980 W, not storage).
2. Rows with no column value: parse "N kWh" from the name (also `AccessoryToBatteryStorage` rows named "Battery N kWh Extension");
   never "Extended Warranty …", "… Tower", "Power Module".
3. No battery rows → 23c package "+ Y kWh".  4. Else 0, `none`.
Inverter rows are never battery, even though their shifted column says 6000–20000.

| # | option | line items | result | why |
|---|---|---|---|---|
| 1 | 2a8·eddf2e3e·1 | Battery 7kWh (col 7000) | 7.0, numeric_column | |
| 2 | 2a8·1de42bd9·5 | Battery LFP 15kWh ×2, AC Coupling Module (Free) | 30.0 | qty counts; coupler excluded |
| 3 | 2a8·7472c340·1 | accessory "Battery 5kWh Extension", no column | 5.0, name | retrofit extension |
| 4 | 23c·07bbb2af·2 | Package 18kWp + 9kWh, AIOS 9kWh ×2 | 18.0 | lines beat package (planner added a module) |
| 5 | 23c·148900c6·1 | Package 13.5kWp + 9kWh, AIOS 6kWh ×1 | 6.0 | planner swapped battery |
| 6 | 23c·25c063b5·2 | Package 10.8 + 9kWh, AIOS 9kWh + AIOS 6kWh | 15.0 | sum of rows |
| 7 | 23c·15cfb5f6·5 | Package 10.8 + 10kWh, FoxESS Battery 5kWh L3 (col 14760) | 14.76 | column: L3 = 3 modules × 4.92 |
| 8 | 23c·3c67718c·2 | Package 6.3 + 6.6kWh, FoxESS 3.3kWh L3 (col 9600) | 9.6 | same |
| 9 | 23c·161078ae·1 | Package 10.8kWp + 9kWh B, no battery row | 9.0, package_name | fallback (72 options) |
| 10 | 23c·9a560829·1 | AIOS 9kWh, "Extended Warranty Battery 9kWh" | 9.0 | warranty ignored |
| 11 | 23c·b7d6755c·1 | Stack Battery 12kWh ×9, Main Tower, Next Tower | 108 → is_outlier | towers ignored |
| 12 | 23c (EcoFlow) | EcoFlow Battery 5.1kWh (col 4800) | 4.8 | column = installer's planned usable kWh |
All 28 package-vs-lines conflicts in 23c are explained by rows 4–8 (added module, swap, multi-level FoxESS).

### R3 Wallbox (wallbox, wallbox_kw, n_wallboxes)
wallbox = a `Wallbox` row, OR a wallbox installation fee ("Install Wallbox", "Wallbox Installation") or "All-Inclusive Package - Wallbox".
"Prep …" lines and "Power Boost for Existing Wallbox" alone → False. wallbox_kw = `wb_charging_speed_kw`/1000 of the Wallbox row
(NaN when installed without a Wallbox row); n_wallboxes = Σ qty of Wallbox rows (≥ 1 when wallbox).

| # | option | line items | result |
|---|---|---|---|
| 1 | 2a8 Huawei | "Wallbox" (col 22000) | True, 22 kW (name has no kW; 180 rows) |
| 2 | 2a8 SolarEdge | "Smart EV Charger 22kW Certified" (col 11000) | True, 11 kW (column, like battery) |
| 3 | 2a8·1bf16187·1 | Wallbox qty 2 | True, 22, n=2 |
| 4 | 2a8·001f8d72·1 | Install Wallbox only | True, NaN kW (23 such options: customer's own / bundled) |
| 5 | 2a8·2dd07ff1·1 | Wallbox Component On-Site + Install Wallbox | True, NaN |
| 6 | 2a8·022f6a90·1 | Prep Wallbox | False (3 options) |
| 7 | 2a8·688ce9ed·1 | All-Inclusive Package - Wallbox + Travel – Wallbox | True, NaN |
| 8 | 2a8 (1 option) | Power Boost for Existing Wallbox | False |
| 9 | 23c·18e2495a·1 | "December Promo Free Wallbox with PV" + Sigenergy AC Wallbox | True, kW from row |
| 10 | 2a8 EcoFlow | Wallbox 11kW v2 (Free) | True, 11 |

### R4 Heat pump (heatpump, heatpump_kw)
heatpump = a `Heatpump` row (no option has storage/buffer without one). kW from the name ("Heat Pump 10.5kW 400V" → 10.5),
column only if the name has no number: the column is rounded (10.5 → 10000) or wrong (Aira "Heat Pump 8kW" → 10140).
Only 31 options / 17 projects, all 2a8ba8e2: 5.5 (6), 7.5 (5), 8 (2), 10.5 (14), 12.5 (4). Heat pump = rules + physics in Phase 2.

### R5 Inverter (inverter_kw)
Rows whose name contains "Inverter" and type is `Inverter` or `Other` (not fees/accessories). kW from the name
("Sigenergy Hybrid Inverter 25kW", column 4049 → 25); micro inverters "Micro Inverter 2000W" ×qty → kW. Sum over rows. None → NaN.
Examples: Sigenergy 10kW (col 10000) → 10 · Sigenergy 25kW (col 4049) → 25 · Micro Inverter 1000W ×3 → 3.0 ·
Micro Inverter 1600W ×2 → 3.2 · GoodWe String Inverter 8kW (type Other) → 8 · 2a8 "Hybrid Inverter 15kW" (technology empty) → 15 ·
2a8 typical option (no inverter row, Huawei inverter inside "Install Inverter" fee) → NaN. Filled for ~6 2a8 options and ~60 23c options.

### R6 Roof type (roof_type)
From `Substructure …` / `DC Install …` / 23c surcharge names. Normalise: strip pitch (">30°", "<30°", "<15°"), "Rack System",
"Mounting", "East/West", "South", trailing " B"/" C"; **merge "Concrete Roof" → Concrete Tile and "Clay Roof" → Clay Tile**
(catalogue rename: the old names stop in Jan 2025, the new ones start then — crosstab by month).
Map: Flat Roof*, Green Roof, Flat Roof Ballast → Flat · Metal Roof, Standing Seam*, Trapezoidal Sheet → Metal · Bitumen ·
Slate · Beaver Tail Tile (+ 23c "Beaver Tail Tile (Surcharge)") · 23c "Mortared Tiles (Surcharge)" → Clay Tile · Facade.
23c kWp-band and Cross-Lay names carry no roof cover → Unknown.
Several types in one option → **judgement call**:
 (a) roof_type = type with the most panels + `roof_mixed` bool [recommended: usable as a feature, keeps the information];
 (b) roof_type = "Mixed" (as the schema says now). → choose a, and I update the schema line.
Examples: 1 "Substructure Concrete Roof" (2024) → Concrete Tile · 2 "Clay Tile Roof" + "Flat Roof" 4 → Clay/Flat by panel count, mixed ·
3 "DC Install Concrete Roof >30°" → Concrete Tile · 4 "Substructure Flat Roof East/West" → Flat · 5 "Substructure Green Roof PV East/West" → Flat ·
6 "Substructure Standing Seam B" → Metal · 7 "Substructure Bitumen Roof Mounting" → Bitumen · 8 23c "Substructure 8.8-15kWp" → Unknown ·
9 23c "Substructure Flat Roof Ballast" → Flat · 10 23c "Roof Mounting Beaver Tail Tile (Surcharge)" → Beaver Tail Tile.
Unknown for ~410 2a8 options (mostly no PV) and most 23c options.

### R7 Scaffolding (has_scaffolding)
True if any line name contains "Scaffold" (all 2a8 variants, incl. "- Quote", "Provided by Customer" = scaffold needed) or is
23c "Site Setup / Safety (…)". 2a8: 1,031 of 1,220 PV options; 23c: 205. Absence is not explained by roof type
(56 Concrete Tile and 55 Clay Tile options without it), so it is a label, not a roof proxy.

### R8 Brand (brand) and backup (has_backup)
brand = brand of the battery row, else inverter row, else wallbox row; if `component_brand` is empty, the first word of the
product name when it is a known brand (23c "GoodWe Battery 5kWh B" → GoodWe; "FoxESS Wallbox 11kW" → FoxESS); else the brand of
an energy manager / optimizer / smart meter row (Huawei, SAJ, SolarEdge, Enphase); else Unknown. Module, cable, insurer,
substructure and heat pump brands (Sunpro, Mennekes, Insurer, Novotegra, Vaillant …) never count.
Example 23c·01bbbfc8·1 EcoFlow + Sigenergy rows → brand of the battery row.
has_backup = "Smart Guard", "Backup Box", "Emergency Power", "Backup Solution", "Home Backup Interface", "Transfer Switch" in any name.

---

## Step 3 — edge cases, proposed decisions

| case | evidence | proposed decision |
|---|---|---|
| Retrofit onto existing PV | has_solar True in 18 projects (2a8 only); 130 battery-only options have has_solar False, so the flag under-reports | offer with new PV + (has_solar or "Stringing Existing Modules" or "– Extension" fee) → `pv_extension`; module replacement (2a8·77ad01c0: PV Module 400W ×3 + "Removal of Old PV Module" ×3) → `pv_extension`. Not full designs. |
| Battery-only offers | 199 (2a8) + 11 (23c) options; 187 with "Extension" wording | `battery_retrofit` (also with a wallbox). Kept for the battery-size catalogue, not for the main chain. |
| Wallbox-only / heat-pump-only | 70 / 21 options | `wallbox_only` / `heatpump_only`. Heat-pump-only rows still feed the heat-pump rules. |
| EV without wallbox | 24 (2a8) + 7 (23c) options with has_ev and no wallbox | keep as is: a real expert decision (existing charger, socket). |
| Wallbox without EV | 406 + 64 options | keep: installers upsell; has_ev is a weak signal. Reported in data notes. |
| Very large systems | 1 option > 30 kWp (99.9), batteries > 40 kWh: 45 (2a8), 108 (23c) | `is_outlier`, kept in file, excluded from training and evaluation. |
| Projects with no parts | 20 + 6, all at the 4,500 kWh default | not in the parquet; counted in data notes. |
| Exact duplicate options | 64 projects (2a8), 4 (23c) | `is_duplicate_option` on the higher number; kept; ranges unchanged. |
| Variants differing only in battery | 75 projects (2a8) | keep all; battery range = min/max. Lowest option is the smallest battery in 77 projects and the largest in 48, so evaluation must also report range-hit, not only error vs the primary. |
| Options with no sizeable component | 33 (2a8) + 1 (23c) | `no_components`, excluded. |
| has_storage = planned battery | 11 has_storage homes. 23c: all 5 have built year = offer year and the package sells the same kWh (e.g. 0b8fae71: "existing" 10 kWh, package "+ 10kWh"). 2a8: f5a3211e (no year) sells Battery 7kWh = "existing" 7; 380933f7, 95686ba1, 8b7a00f8 built 2026 ≥ offer year. Only b48e921f (5 kWh) and 643256ef (10 kWh) look real: no year, nothing battery sold. | `existing_battery_is_planned` when storage_built_year ≥ offer year OR an option of the project sells exactly that kWh; then existing_battery_kwh NaN. 9 of 11 are planned; 2 real existing batteries remain. |
| Consumption default / invalid | 410 + 69 at exactly 4,500; 21 at 0–1 kWh | annual_kwh NaN, consumption_known False; evaluation reportable on consumption_known only. |
| Price typed in €/kWh or 0 | 2a8 one 0.32282, two 0.0 | 0.32282 kept as €/kWh; 0 → NaN. |
| Signed before offer created | 2 (23c) | keep; no effect on labels. |
| Same customer, two projects | 41 (2a8), 1 (23c) | keep both; splits grouped by customer_contact_id. |
| 2a8 "PV Complete Package N kW" | 73 options; optimizer counts imply 300–1,500 W/panel | treat N as kWp, source `package_name`; flagged as the least certain PV source. |

Primary label: `is_primary` = lowest option_number among the project's options **with is_full_design** when the project has one
(otherwise lowest overall), so the training row of a project is never a retrofit add-on when a full design exists.
