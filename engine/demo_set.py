"""
Demo set: 5 real HELD-OUT projects that tell the 5-minute demo story.

    python -m engine.demo_set   -> engine/artifacts/demo_projects.json (derived from Reonic data: never committed)

Projects come only from the locked test set (engine/artifacts/test_ids.json, the same file engine/train.py uses;
created with Cala's locked_split if missing), so the model has never trained on them. Each role is picked by a fixed
rule (no randomness), so every machine with the same labels + test_ids.json gets the same five projects.

Per project: project_id (hash), installer id, home inputs in api.md names, the expert primary design, the expert
variant range and every expert option. No names, contacts, addresses or customer ids; offer date as month only.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from engine.evaluate import ARTIFACTS, build_eval_table, inputs_from_labels, locked_split

LABELS = ARTIFACTS / "expert_designs.parquet"
TEST_IDS = ARTIFACTS / "test_ids.json"
OUT = ARTIFACTS / "demo_projects.json"

INPUT_COLS = ["annual_kwh", "demand_is_default", "consumption_known", "price_eur_kwh", "load_profile", "has_ev",
              "ev_km_year", "heating", "heating_demand_kwh", "existing_pv", "existing_battery", "existing_wallbox"]
PRIMARY_COLS = ["pv_kwp", "pv_panels", "pv_source", "battery_kwh", "wallbox", "n_wallboxes", "wallbox_kw",
                "heatpump", "heatpump_kw", "inverter_kw", "brand", "roof_type", "offer_type"]
OPTION_COLS = ["option_number", "is_primary", "pv_kwp", "battery_kwh", "wallbox", "heatpump_kw", "is_full_design"]


def _closest_to_median(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    """Row nearest the median on the given columns (each scaled by its spread); ties broken by project_id."""
    z = sum(((df[c] - df[c].median()) / (df[c].std() or 1.0)).abs() for c in cols)
    return df.assign(_z=z).sort_values(["_z", "project_id"]).iloc[0]


def pick_roles(test: pd.DataFrame, labels: pd.DataFrame) -> list[tuple[str, str, str]]:
    """[(role, project_id, why)] — one project per demo role, by fixed rules on the held-out table."""
    real_demand = test.consumption_known.fillna(False).astype(bool) & ~test.demand_is_default.fillna(False).astype(bool)
    new = test[(test.offer_type == "new_system") & real_demand]
    hp_option = labels.groupby("project_id").heatpump_kw.max().fillna(0) > 0
    picks = []

    typical = new[new.has_pv & new.has_battery & ~new.has_wallbox & ~new.has_heatpump & (new.has_ev != True)]
    r = _closest_to_median(typical, ["annual_kwh", "pv_kwp", "battery_kwh"])
    picks.append(("typical_pv_battery", r.project_id,
                  f"Typical new PV + battery home: closest to the median of {len(typical)} held-out PV+battery homes"))

    ev = new[(new.has_ev == True) & new.has_wallbox]
    r = _closest_to_median(ev, ["annual_kwh", "pv_kwp"])
    picks.append(("ev_wallbox", r.project_id, f"EV owner, expert added a wallbox ({len(ev)} such held-out homes)"))

    gas = test[test.project_id.map(hp_option).fillna(False).astype(bool) & test.heating.isin(["Gas", "Oil"])]
    r = gas.sort_values(["heating", "project_id"]).iloc[0]  # "Gas" sorts before "Oil"
    hp_kw = labels.loc[labels.project_id == r.project_id, "heatpump_kw"].max()
    picks.append(("heatpump_option", r.project_id,
                  f"{r.heating} heating, {r.heating_demand_kwh:,.0f} kWh/yr heat demand; the expert offered a "
                  f"{hp_kw:g} kW heat pump ({len(gas)} such held-out home(s))"))

    retro = test[(test.offer_type == "battery_retrofit") & test.consumption_known.fillna(False).astype(bool)]
    r = _closest_to_median(retro, ["battery_kwh"])
    picks.append(("battery_retrofit", r.project_id,
                  f"Existing PV, expert sold a battery only ({len(retro)} held-out retrofits with known consumption)"))

    # spread over FULL-design options only: a wallbox-only side option is not a PV disagreement
    full = labels[labels.is_full_design.astype(bool) & ~labels.is_outlier.astype(bool)]
    spread = full.groupby("project_id").agg(n_full=("pv_kwp", "size"), pv_lo=("pv_kwp", "min"), pv_hi=("pv_kwp", "max"),
                                            bat_lo=("battery_kwh", "min"), bat_hi=("battery_kwh", "max"))
    multi = new.join(spread, on="project_id", how="inner")
    multi = multi[multi.n_full >= 2].assign(pv_spread=lambda d: d.pv_hi - d.pv_lo, bat_spread=lambda d: d.bat_hi - d.bat_lo)
    r = multi.sort_values(["pv_spread", "bat_spread", "project_id"], ascending=[False, False, True]).iloc[0]
    picks.append(("experts_disagree", r.project_id,
                  f"{r.n_full:g} full-design variants from the expert: PV {r.pv_lo:g}–{r.pv_hi:g} kWp, "
                  f"battery {r.bat_lo:g}–{r.bat_hi:g} kWh (widest PV range of {len(multi)} multi-variant homes)"))
    return picks


def _clean(value):
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if np.isnan(value) else round(float(value), 3)
    return None if value is pd.NA or value is pd.NaT else value


def build_demo_set(labels: pd.DataFrame, test_ids_path: Path = TEST_IDS) -> dict:
    table = build_eval_table(labels, inputs_from_labels(labels))
    _, test = locked_split(table, test_ids_path)
    test = test.set_index("project_id", drop=False)
    by_project = labels.set_index("project_id")
    projects = []
    for role, pid, why in pick_roles(test.reset_index(drop=True), labels):
        row, opts = test.loc[pid], by_project.loc[[pid]].sort_values("option_number")
        primary = opts[opts.is_primary.astype(bool)].iloc[0]
        projects.append({
            "role": role,
            "why": why,
            "project_id": pid,
            "installer": row.installer,
            "offer_month": pd.Timestamp(row.offer_date).strftime("%Y-%m") if pd.notna(row.offer_date) else None,
            "home": {c: _clean(row[c]) for c in INPUT_COLS},
            "expert_primary": {c: _clean(primary[c]) for c in PRIMARY_COLS if c in primary},
            "expert_range": {c: _clean(row[c]) for c in ["pv_min", "pv_max", "battery_min", "battery_max", "n_options"]},
            "expert_options": [{c: _clean(o[c]) for c in OPTION_COLS if c in o} for _, o in opts.iterrows()],
        })
    return {"source": {"labels": LABELS.name, "test_ids": Path(test_ids_path).name,
                       "rule": "held-out projects only; fixed selection rules in engine/demo_set.py"},
            "projects": projects}


def main() -> None:
    demo = build_demo_set(pd.read_parquet(LABELS))
    OUT.write_text(json.dumps(demo, indent=2, ensure_ascii=False))
    for p in demo["projects"]:
        e = p["expert_primary"]
        print(f"{p['role']:<20} {p['project_id']}  PV {e.get('pv_kwp')} kWp · battery {e.get('battery_kwh')} kWh · "
              f"wallbox {e.get('wallbox')} · HP {e.get('heatpump_kw')} kW  — {p['why']}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
