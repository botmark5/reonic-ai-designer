"""Build the expert-design table and the installer catalogue from the raw Reonic data.

    .venv/bin/python -m engine.labels

Writes engine/artifacts/expert_designs.parquet (one row per project × option, schema in
docs/data-notes.md) and engine/artifacts/catalogue.json (sizes each installer actually sells),
then prints cross-checks. Rules: docs/labels-rules.md.
"""
import json
from pathlib import Path

import pandas as pd

from engine.label_rules.components import (
    extract_battery,
    extract_brand,
    extract_heatpump,
    extract_inverter,
    extract_wallbox,
    has_backup,
)
from engine.label_rules.home import clean_status_quo
from engine.label_rules.items import load_raw
from engine.label_rules.offer import add_project_columns, classify_offer
from engine.label_rules.pv import PANEL_WP_ASSUMED, extract_pv, extract_roof_type, has_scaffolding

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
ARTIFACTS = ROOT / "engine" / "artifacts"

FRONT_COLUMNS = [
    "installer", "project_id", "customer_contact_id", "option_id", "option_number", "is_primary", "n_options",
    "is_duplicate_option", "offer_type", "is_full_design",
    "pv_kwp", "pv_panels", "pv_source", "pv_wp_assumed", "pv_sources_disagree",
    "battery", "battery_kwh", "battery_source", "wallbox", "wallbox_kw", "n_wallboxes", "heatpump", "heatpump_kw",
    "inverter_kw", "roof_type", "roof_mixed", "has_scaffolding", "has_backup", "brand", "n_line_items",
    "pv_kwp_min", "pv_kwp_max", "battery_kwh_min", "battery_kwh_max", "is_outlier",
]


def extract_option(items: pd.DataFrame, installer: str) -> dict:
    """All per-option labels for the line items of one offer option."""
    out = {}
    out.update(extract_pv(items, installer))
    out.update(extract_roof_type(items))
    out["has_scaffolding"] = has_scaffolding(items)
    out.update(extract_battery(items))
    out.update(extract_wallbox(items))
    out.update(extract_heatpump(items))
    out.update(extract_inverter(items))
    out["brand"] = extract_brand(items)
    out["has_backup"] = has_backup(items)
    out["n_line_items"] = len(items)
    out["items_signature"] = "||".join(sorted(f"{n}|{q:g}" for n, q in zip(items.component_name, items.quantity)))
    return out


def _counts(values: pd.Series) -> dict:
    vc = values.dropna().astype(float).round(2).value_counts().sort_index()
    return {f"{k:g}": int(v) for k, v in vc.items()}


def make_catalogue(designs: pd.DataFrame) -> dict:
    """Sizes each installer sells (non-outlier options), with how often each was offered."""
    catalogue = {}
    for installer, d in designs[~designs.is_outlier].groupby("installer"):
        catalogue[installer] = {
            "pv": {
                "wp_per_panel": PANEL_WP_ASSUMED,
                "panels": _counts(d.pv_panels[d.pv_kwp > 0]),
                "package_kwp": _counts(d.pv_kwp[d.pv_source == "package_name"]),
            },
            "battery_kwh": _counts(d.battery_kwh[d.battery]),
            "wallbox_kw": _counts(d.wallbox_kw),
            "heatpump_kw": _counts(d.heatpump_kw),
            "inverter_kw": _counts(d.inverter_kw),
            "brands": {k: int(v) for k, v in d.brand.value_counts().items()},
        }
    return catalogue


def build(raw_dir: Path = RAW_DIR) -> tuple[pd.DataFrame, dict]:
    parts, status_quo = load_raw(raw_dir)
    homes = clean_status_quo(status_quo)
    has_solar = dict(zip(homes.project_id, homes.has_solar.astype(bool)))

    rows = []
    keys = ["installer", "project_id", "option_number", "option_id"]
    for (installer, project_id, option_number, option_id), items in parts.groupby(keys, sort=True):
        rec = {"installer": installer, "project_id": project_id, "option_id": option_id, "option_number": int(option_number)}
        rec.update(extract_option(items, installer))
        rec["offer_type"] = classify_offer(rec, items, has_solar[project_id])
        rows.append(rec)

    designs = pd.DataFrame(rows).merge(homes.drop(columns=["installer"]), on="project_id", how="left", validate="many_to_one")
    designs = add_project_columns(designs)
    designs = designs[FRONT_COLUMNS + [c for c in designs.columns if c not in FRONT_COLUMNS]]
    return designs.reset_index(drop=True), make_catalogue(designs)


def cross_checks(designs: pd.DataFrame) -> str:
    def table(col: str, frame: pd.DataFrame = designs) -> str:
        return pd.crosstab(frame[col], frame.installer, margins=True).to_string()

    primary = designs[designs.is_primary]
    full = designs[designs.is_full_design & ~designs.is_outlier]
    lines = [
        "== pv_source (all options)", table("pv_source"),
        "== battery_source", table("battery_source"),
        "== offer_type", table("offer_type"),
        "== offer_type of primary rows", table("offer_type", primary),
        "== pv_sources_disagree", table("pv_sources_disagree"),
        "== roof_type (options with PV)", table("roof_type", designs[designs.pv_kwp > 0]),
        "== outliers", designs[designs.is_outlier][["installer", "project_id", "option_number", "pv_kwp", "battery_kwh"]].to_string(),
        "== primary full designs: pv_kwp / battery_kwh quantiles",
        full[full.is_primary].groupby("installer")[["pv_kwp", "battery_kwh"]].quantile([0.05, 0.5, 0.95]).to_string(),
        "== consumption_known share (projects)", designs.drop_duplicates("project_id").groupby("installer").consumption_known.mean().round(3).to_string(),
    ]
    return "\n".join(lines)


def main() -> None:
    designs, catalogue = build()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    designs.to_parquet(ARTIFACTS / "expert_designs.parquet", index=False)
    (ARTIFACTS / "catalogue.json").write_text(json.dumps(catalogue, indent=2))
    print(f"wrote {len(designs)} rows × {designs.shape[1]} columns → {ARTIFACTS / 'expert_designs.parquet'}")
    print(cross_checks(designs))


if __name__ == "__main__":
    main()
