# Expert-Design Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the raw Reonic CSVs into `engine/artifacts/expert_designs.parquet` (one row per project × option) and `engine/artifacts/catalogue.json`, with every extraction rule unit-tested on real tricky examples.

**Architecture:** Pure, per-option rule functions (one module per concern) take the line items of one option as a DataFrame and return plain dicts. `engine/labels.py` loads the raw files, applies the rules per option, adds project-level columns (primary, variant ranges, flags) and writes the artifacts. A spot-check script prints raw lines next to extracted designs for human review.

**Tech Stack:** Python 3.12 venv (`.venv`, built with uv), pandas 3.1, pyarrow, pytest.

**Spec:** `docs/labels-rules.md` (rules R1–R8 + edge-case table) and `docs/data-notes.md` → "expert_designs.parquet schema". Read both before any task.

## Global Constraints
- Raw data in `data/raw/` and every derived artifact (`engine/artifacts/*.parquet`, `engine/artifacts/spotcheck.md`) are never committed.
- Do not touch `engine/physics.py` or `engine/evaluate.py` (owned by Cala). Branch `engine/labels` only.
- Units in outputs: pv_kwp kWp, battery_kwh kWh, wallbox_kw/heatpump_kw/inverter_kw kW, annual_kwh kWh, price_eur_kwh €/kWh.
- Raw columns are shifted: `inverter_power_kw` = battery Wh (BatteryStorage rows), `battery_capacity_kwh` = inverter W (Inverter rows). Other numeric columns are W.
- Panel wattage assumption: `PANEL_WP_ASSUMED = 450.0`.
- Missing numbers are NaN, never 0 — except pv_kwp and battery_kwh, where 0 means "none in this option".
- Fixed random seed 42 wherever sampling happens.
- Run everything from the repo root with `.venv/bin/python` / `.venv/bin/pytest`.

## Review Focus
1. Decimal commas in names ("EcoFlow | 10,2 kWh | Power Ocean") → parsed as 10.2, not 10 or 2. Test in Task 3.
2. Names with kWp/kWh that are not sizes ("Substructure 8.8-15kWp", "Complete Package Price", "Extended Warranty Battery 9kWh") → never read as a package or battery. Tests in Tasks 2 and 3.
3. A project whose options are all non-full designs (e.g. two battery-only variants) → still exactly one `is_primary` row. Test in Task 4.
4. Empty strings in numeric raw columns → NaN, so sums never crash or count blanks as 0 W. Test in Task 1.
5. Every project in the parquet has exactly one primary row, and option counts match the raw files. Test in Task 5.

---

### Task 1: Foundation — raw loading and test fixtures (lead, sequential)

**Files:**
- Create: `engine/label_rules/__init__.py` (empty), `engine/label_rules/items.py`, `pytest.ini`
- Test: `engine/tests/test_items.py`

**Interfaces:**
- Produces:
  - `RAW_NUM_COLS: list[str]` = quantity, module_watt_peak, inverter_power_kw, battery_capacity_kwh, wb_charging_speed_kw, heatpump_nominal_power_kw
  - `make_items(rows: list[dict]) -> pd.DataFrame` — test helper. Row keys: `name` (→ component_name), `type` (→ component_type, default "Other"), `tech` (→ technology, default "solar"), `brand` (default ""), `qty` (→ quantity, default 1.0), plus any raw numeric column by its raw name. Returns all raw columns; strings filled with "", numerics float with NaN.
  - `load_raw(raw_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]` — (parts, status_quo), both with an `installer` column (folder name); parts normalised exactly like `make_items`.
- `pytest.ini`: `[pytest]` `pythonpath = .` `testpaths = engine/tests`

- [ ] **Step 1: Write the failing tests**
  - `test_make_items_defaults`: `make_items([{"name": "Battery 7kWh", "type": "BatteryStorage", "inverter_power_kw": 7000}])` → quantity 1.0, technology "solar", component_brand "", `module_watt_peak` is NaN, `inverter_power_kw == 7000.0`.
  - `test_load_raw_blank_numeric_is_nan` (skip if `data/raw` missing): no numeric column in parts has dtype object; `parts.quantity.isna().sum() == 0`.
  - `test_load_raw_counts` (skip if missing): parts rows 19,257 (2a8ba8e2) and 2,395 (23c108b7); status quo 1,277 and 342.
- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_items.py -v` → FAIL (module not found).
- [ ] **Step 3: Implement** `items.py` (read CSV with `dtype=str`, fill strings with "", `pd.to_numeric(errors="coerce")` on RAW_NUM_COLS).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(labels): raw loader and item fixtures`.

### Task 2: PV size, roof type, scaffolding (sub-agent a; parallel with 3 and 4)

**Files:** Create `engine/label_rules/pv.py`; Test `engine/tests/test_pv.py`

**Interfaces:**
- Consumes: `make_items` (tests only).
- Produces:
  - `PANEL_WP_ASSUMED = 450.0`
  - `extract_pv(items: pd.DataFrame, installer: str) -> dict` with keys `pv_kwp: float`, `pv_panels: float` (NaN if unknown), `pv_source: str` ∈ {module_lines, package_name, substructure, roof_mounting, size_band, none}, `pv_wp_assumed: float` (450 or NaN), `pv_sources_disagree: bool`.
  - `extract_roof_type(items: pd.DataFrame) -> dict` with `roof_type: str`, `roof_mixed: bool`.
  - `has_scaffolding(items: pd.DataFrame) -> bool`

- [ ] **Step 1: Write failing tests** — one test per row of the R1 table (18), R6 examples (10) and R7, using the exact line items and expected values from `docs/labels-rules.md`. Required assertions include:
  - R1#2 Substructure 1 + DC Install 13 (2a8) → pv_panels 13, pv_kwp 5.85, source substructure, disagree True.
  - R1#7 "PV Complete Package 8kW" + DC Install 20 (2a8) → 9.0, disagree True.
  - R1#11 Package 10.8 + Module ×27 (col 450) + "Additional Module incl. Substructure + Mounting" ×3 → 12.15, source module_lines.
  - R1#13 Package 13.5 + Module ×1 (col 475) → 13.975.
  - R1#14 Package 10.8 + Module ×24 (col 475) + "3x Extra PV Module 480W" → pv_panels 27, pv_kwp 12.825.
  - R1#15 Package 6.3 + "4 Additional Modules (14 in Package Price)" → 8.1.
  - R1#17 Roof Mounting 1 + "Substructure 6-8.8kWp" 1 → 7.4, source size_band.
  - Review Focus 2: "Substructure 8.8-15kWp" ×26 alone (23c) → 11.7 from count, never 8.8/15 as a package; "Complete Package Price" alone → source none.
  - R6: "Substructure Concrete Roof" → "Concrete Tile"; Clay Tile 2 + Flat 4 → roof_type "Flat", roof_mixed True; "Substructure 8.8-15kWp" → "Unknown".
  - R7: "Scaffolding Provided by Customer" → True; "Site Setup / Safety (up to 5m)" → True; no such line → False.
- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_pv.py -v` → FAIL.
- [ ] **Step 3: Implement** in `pv.py` following R1/R6/R7 order exactly; compile regexes at module level.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(labels): PV size, roof type and scaffolding rules`.

### Task 3: Battery, wallbox, heat pump, inverter, brand, backup (sub-agent b; parallel)

**Files:** Create `engine/label_rules/components.py`; Test `engine/tests/test_components.py`

**Interfaces:**
- Produces:
  - `extract_battery(items) -> dict`: `battery: bool`, `battery_kwh: float`, `battery_source: str` ∈ {numeric_column, name, package_name, none}
  - `extract_wallbox(items) -> dict`: `wallbox: bool`, `wallbox_kw: float`, `n_wallboxes: float`
  - `extract_heatpump(items) -> dict`: `heatpump: bool`, `heatpump_kw: float`
  - `extract_inverter(items) -> dict`: `inverter_kw: float`
  - `extract_brand(items) -> str`
  - `has_backup(items) -> bool`

- [ ] **Step 1: Write failing tests** — every row of the R2 (12), R3 (10), R4, R5 (7) examples plus R8. Required assertions include:
  - R2#2 LFP 15kWh ×2 (col 15000) + AC Coupling Module (col 1980) → 30.0.
  - R2#3 accessory "Battery 5kWh Extension", no column → 5.0, source name.
  - R2#7 package "+ 10kWh" + FoxESS 5kWh L3 (col 14760) → 14.76, source numeric_column.
  - R2#9 package "10.8kWp + 9kWh B", no battery row → 9.0, package_name.
  - R2#10/#11 "Extended Warranty Battery 9kWh", "Stack Battery 12kWh Main Tower" add nothing.
  - Inverter row "Hybrid Inverter 15kW" (battery_capacity_kwh 15000) → battery_kwh 0.
  - Review Focus 1: BatteryStorage "EcoFlow EcoFlow | 10,2 kWh | Power Ocean / 6kZ" with empty column → 10.2.
  - R3#2 "Smart EV Charger 22kW Certified" (col 11000) → 11.0; R3#4 "Install Wallbox" only → wallbox True, wallbox_kw NaN; R3#6 "Prep Wallbox" → False; R3#8 "Power Boost for Existing Wallbox" → False.
  - R4 Aira "Heat Pump 8kW" (col 10140) → 8.0; Vaillant "Heat Pump 10.5kW 400V" (col 10000) → 10.5.
  - R5 "Sigenergy Hybrid Inverter 25kW" (col 4049) → 25.0; "Micro Inverter 1600W" ×2 → 3.2; no inverter row → NaN.
  - R8 "GoodWe Battery 5kWh B" (brand "") → "GoodWe"; EcoFlow battery + Sigenergy wallbox → "EcoFlow"; only an "Optional PV Insurance" (brand Insurer) → "Unknown". has_backup on "Smart Guard 63A" → True.
- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_components.py -v` → FAIL.
- [ ] **Step 3: Implement** in `components.py` per R2–R5, R8. kWh/kW regex accepts "," as decimal separator.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(labels): battery, wallbox, heat pump, inverter, brand rules`.

### Task 4: Status-quo cleaning and offer/project columns (sub-agent c; parallel)

**Files:** Create `engine/label_rules/home.py`, `engine/label_rules/offer.py`; Test `engine/tests/test_home.py`, `engine/tests/test_offer.py`

**Interfaces:**
- Produces:
  - `clean_status_quo(sq: pd.DataFrame) -> pd.DataFrame` — one row per project; columns exactly the "Home features" table of the schema plus `installer`, `project_id`, `customer_contact_id`, `has_solar`. Planned battery here = storage_built_year ≥ offer year only.
  - `classify_offer(design: dict, items: pd.DataFrame, has_solar: bool) -> str` — design has pv_kwp, battery_kwh, wallbox, heatpump. new PV + (has_solar or "Stringing Existing Modules" or "(All-Inclusive Package|Travel & Logistics Flat Rate) - Extension" or "Removal of Old PV Module" without Substructure) → pv_extension; new PV → new_system; else battery_retrofit / wallbox_only / heatpump_only / no_components in that order.
  - `add_project_columns(df: pd.DataFrame) -> pd.DataFrame` — input needs installer, project_id, option_number, offer_type, pv_kwp, battery_kwh, items_signature, existing_battery_kwh, existing_battery_is_planned. Adds is_full_design, is_primary, n_options, is_duplicate_option, pv_kwp_min/max, battery_kwh_min/max, is_outlier (pv_kwp > 30 or battery_kwh > 40); sets existing_battery_is_planned True and existing_battery_kwh NaN when any option of the project sells exactly that kWh.

- [ ] **Step 1: Write failing tests**
  - home: demand 4,500,000 Wh → annual_kwh_raw 4500, annual_kwh NaN, demand_is_default True, consumption_known False; demand 1,000 Wh → demand_is_invalid True; demand 6,000,000 → annual_kwh 6000, consumption_known True; price 0.00032 → 0.32; price 0.32282 → 0.32282; price 0 → NaN; solar_size_kwp 9720 → existing_pv_kwp 9.72; storage 10000 with built year 2025, offer 2025 → existing_battery_is_planned True and existing_battery_kwh NaN; storage 5000 with no year → 5.0, planned False; empty heating type → "Unknown"; empty offer_created_at → first_signed_at.
  - offer: PV 9 kWp + battery, has_solar False → new_system; same with has_solar True → pv_extension; battery only → battery_retrofit; wallbox only → wallbox_only; nothing → no_components; PV Module 400W ×3 + "Removal of Old PV Module" ×3 → pv_extension.
  - project columns: options 2 and 3 of one project, both new_system → only option 2 is_primary; options 1 (battery_retrofit) and 2 (new_system) → option 2 is_primary; Review Focus 3: two battery_retrofit options → exactly one primary (the lower); identical items_signature on options 1 and 3 → option 3 is_duplicate_option; battery 7/10/14 across options → battery_kwh_min 7, max 14 on every row of that group; existing 7 kWh and an option selling 7 kWh → planned.
- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_home.py engine/tests/test_offer.py -v` → FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(labels): status-quo cleaning, offer type and project columns`.

### Task 5: Build the artifacts (lead, after 2–4 are merged)

**Files:** Create `engine/labels.py`; Test `engine/tests/test_labels_build.py`; Modify `.gitignore` (add `engine/artifacts/spotcheck.md`)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `extract_option(items: pd.DataFrame, installer: str) -> dict` — merges all rule outputs + `n_line_items`, `has_backup`, `items_signature` (sorted name|qty string).
  - `build(raw_dir: Path) -> tuple[pd.DataFrame, dict]` — (designs in schema column order, catalogue).
  - Catalogue per installer: `{"pv": {"wp_per_panel": 450.0, "panels": {n: count}, "package_kwp": {...}}, "battery_kwh": {v: count}, "wallbox_kw": {...}, "heatpump_kw": {...}, "inverter_kw": {...}, "brands": {...}}`, counted over all options except outliers.
  - CLI: `.venv/bin/python -m engine.labels` writes both artifacts and prints the cross-check table.

- [ ] **Step 1: Write failing tests** (skip if `data/raw` missing): row count 1,637 + 357; projects 1,257 + 336; exactly one is_primary per project; every schema column from data-notes present (parse the schema tables); no pv_kwp < 0; battery_kwh values ⊂ catalogue keys; option 23c·b7d6755c is_outlier.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; print cross-checks: sub vs DC agreement, package vs module kWp, package vs line kWh, substructure band vs kWp, count per pv_source and offer_type, primary distribution.
- [ ] **Step 4: Run** tests → PASS; run the CLI; compare the cross-check numbers with the profile in `docs/labels-rules.md`. Any mismatch → superpowers:systematic-debugging before changing code.
- [ ] **Step 5: Commit** `feat(labels): build expert_designs.parquet and catalogue.json`.

### Task 6: Spot-check (sub-agent d, after Task 5)

**Files:** Create `engine/spotcheck.py`; Test `engine/tests/test_spotcheck.py`

**Interfaces:**
- Produces: `render_spotcheck(designs: pd.DataFrame, parts: pd.DataFrame, n: int = 20, seed: int = 42) -> str` (markdown: per sampled project, each option's raw line items as a table — name, type, brand, qty, the numeric column that matters — next to the extracted design and flags); CLI `.venv/bin/python -m engine.spotcheck` writes `engine/artifacts/spotcheck.md`.

- [ ] **Step 1: Failing test** with a two-project synthetic frame: output contains both project ids, every option number, and the pv_kwp value; same seed → identical output.
- [ ] **Step 2–4:** run FAIL → implement → PASS; run the CLI.
- [ ] **Step 5: Commit** `feat(labels): spot-check report`.

### Task 7: Docs, review, PR (lead)
- [ ] Read all 20 spot-check projects; list any wrong label with root cause; fix via the owning task's test first.
- [ ] Rewrite `docs/data-notes.md` assumptions with the final rules and numbers (keep the schema section; update it if roof_mixed / n_wallboxes / size_band were approved). Tick Phase 1 in `docs/PLAN.md`; add decisions to its Decisions section.
- [ ] superpowers:verification-before-completion: full `.venv/bin/pytest` green, CLI output pasted into the PR.
- [ ] Commit, push, open PR `engine/labels → main`, tell Mark.
- [ ] Then propose (not build) Phase 2 in `docs/engine-spec.md`.
