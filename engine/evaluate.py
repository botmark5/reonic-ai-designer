"""
engine/evaluate.py - evaluation harness: how close are designs to the experts', on projects never seen?

Independent of HOW the labels are built (engine/labels.py) and of WHICH model is used:
    * labels   = any table following the "Label table contract" in docs/data-notes.md
    * a model  = any object with .fit(train_df) and .predict(df) -> DataFrame of design columns

    python -m engine.evaluate --labels engine/artifacts/expert_designs.parquet

Protocol
    held-out : 80/20 split BY PROJECT (never by row), stratified by installer, seed 42
    transfer : train on installer A, test on installer B (and B -> A)
    truth    : the primary option of each project; the min/max over ALL its options = "variant range"
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ENGINE_DIR = Path(__file__).resolve().parent
REPO_DIR = ENGINE_DIR.parent
RAW_DIR = REPO_DIR / "data" / "raw"
ARTIFACTS = ENGINE_DIR / "artifacts"
SEED = 42

# ---------------------------------------------------------------------------
# Label table contract (mirrored in docs/data-notes.md) - one row per project x offer option
# ---------------------------------------------------------------------------
REQUIRED_LABEL_COLUMNS = {
    "project_id": "str", "installer": "str", "option_number": "int", "is_primary": "bool",
    "has_pv": "bool", "pv_kwp": "float (0 if no PV)",
    "has_battery": "bool", "battery_kwh": "float (0 if no battery)",
    "has_wallbox": "bool", "has_heatpump": "bool", "heatpump_kw": "float (0 if none)",
}
OPTIONAL_LABEL_COLUMNS = {"wallbox_kw": "float", "inverter_kw": "float", "option_id": "str"}
DESIGN_COLUMNS = ["has_pv", "pv_kwp", "has_battery", "battery_kwh", "has_wallbox", "has_heatpump"]
BOOL_COMPONENTS = ["has_pv", "has_battery", "has_wallbox", "has_heatpump"]

PV_TOLERANCE_KWP = 1.0          # variant hit: PV within [min - 1, max + 1] kWp
BATTERY_TOLERANCE_STEPS = 1     # variant hit: battery within one catalogue step of the range
CONSUMPTION_BANDS_KWH = [0, 2500, 3500, 4500, 5500, 7000, 9000, np.inf]
MIN_COUNT_FOR_CATALOGUE = 5


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def load_labels(path: Path | str) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Label table not found: {path}. It is produced by engine/labels.py (branch engine/labels).")
    df = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
    validate_labels(df)
    return df


def validate_labels(df: pd.DataFrame) -> None:
    """Raise a clear error if the table does not follow the label contract."""
    missing = [c for c in REQUIRED_LABEL_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Label table is missing required columns: {missing}. "
                         f"Contract: {REQUIRED_LABEL_COLUMNS} (see docs/data-notes.md).")
    primaries = df.groupby("project_id")["is_primary"].sum()
    bad = primaries[primaries != 1]
    if len(bad):
        raise ValueError(f"Every project needs exactly one is_primary row; {len(bad)} projects do not "
                         f"(e.g. {list(bad.index[:3])}).")
    for c in ("pv_kwp", "battery_kwh", "heatpump_kw"):
        if (df[c].fillna(0) < 0).any():
            raise ValueError(f"Column {c} has negative values.")


def load_inputs(raw_dir: Path | str = RAW_DIR) -> pd.DataFrame:
    """Project inputs (the home before) from data/raw/<installer>/projects_status_quo.csv, api.md names."""
    frames = []
    for d in sorted(Path(raw_dir).iterdir()):
        f = d / "projects_status_quo.csv"
        if not f.exists():
            continue
        sq = pd.read_csv(f)
        frames.append(pd.DataFrame({
            "project_id": sq.project_id, "installer": d.name,
            "annual_kwh": sq.energy_demand_wh / 1000,
            "price_eur_kwh": sq.energy_price_per_wh * 1000,
            "load_profile": sq.load_profile, "has_ev": sq.has_ev.astype(bool),
            "ev_km_year": sq.ev_annual_drive_distance_km,
            "heating": sq.heating_existing_type,
            "heating_demand_kwh": sq.heating_existing_heating_demand_wh / 1000,
            "existing_pv": sq.has_solar.astype(bool), "existing_battery": sq.has_storage.astype(bool),
            "existing_wallbox": sq.has_wallbox.astype(bool),
            "offer_date": pd.to_datetime(sq.offer_created_at, format="mixed", errors="coerce"),
        }))
    if not frames:
        raise FileNotFoundError(f"No projects_status_quo.csv found under {raw_dir}.")
    return pd.concat(frames, ignore_index=True)


def load_catalogue(labels: pd.DataFrame, path: Path | str | None = ARTIFACTS / "catalogue.json") -> dict:
    """
    Battery sizes each installer sells: {installer: [sizes...]}.
    Uses engine/artifacts/catalogue.json if present ({inst: [..]} or {inst: {"battery_kwh": [..]}}),
    otherwise sizes that appear at least MIN_COUNT_FOR_CATALOGUE times in the labels.
    """
    if path is not None and Path(path).exists():
        raw = json.loads(Path(path).read_text())
        cat = {}
        for inst, v in raw.items():
            sizes = v.get("battery_kwh", []) if isinstance(v, dict) else v
            cat[inst] = sorted(float(x) for x in sizes if x and float(x) > 0)
        if cat:
            return cat
    cat = {}
    for inst, g in labels[labels.battery_kwh > 0].groupby("installer"):
        counts = g.battery_kwh.round(1).value_counts()
        sizes = counts[counts >= MIN_COUNT_FOR_CATALOGUE].index
        cat[inst] = sorted(float(s) for s in (sizes if len(sizes) else counts.index))
    return cat


# ---------------------------------------------------------------------------
# Evaluation table: primary design + inputs + variant ranges
# ---------------------------------------------------------------------------
def build_eval_table(labels: pd.DataFrame, inputs: pd.DataFrame) -> pd.DataFrame:
    """One row per project: inputs, the primary (expert) design and the min/max over all options."""
    validate_labels(labels)
    ranges = labels.groupby("project_id").agg(
        pv_min=("pv_kwp", "min"), pv_max=("pv_kwp", "max"),
        battery_min=("battery_kwh", "min"), battery_max=("battery_kwh", "max"),
        n_options=("option_number", "nunique"))
    primary = labels[labels.is_primary.astype(bool)]
    keep = ["project_id", "installer"] + [c for c in REQUIRED_LABEL_COLUMNS if c not in ("project_id", "installer",
                                                                                           "option_number", "is_primary")]
    table = primary[keep].merge(ranges, on="project_id")
    # installer comes from the labels; the inputs only add the home's facts
    table = table.merge(inputs.drop(columns=["installer"], errors="ignore"), on="project_id", how="left")
    for c in BOOL_COMPONENTS:
        table[c] = table[c].astype(bool)
    return table.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Splits
# ---------------------------------------------------------------------------
def grouped_split(table: pd.DataFrame, test_size: float = 0.2, seed: int = SEED):
    """Split by project_id (a project is never in both parts), stratified by installer when possible."""
    ids = table[["project_id", "installer"]].drop_duplicates("project_id")
    strat = ids.installer if ids.installer.value_counts().min() >= 2 else None
    train_ids, test_ids = train_test_split(ids.project_id, test_size=test_size, random_state=seed, stratify=strat)
    return (table[table.project_id.isin(set(train_ids))].reset_index(drop=True),
            table[table.project_id.isin(set(test_ids))].reset_index(drop=True))


def installer_transfer(table: pd.DataFrame):
    """Train on one installer, test on another: [(name, train, test), ...] for every ordered pair."""
    insts = sorted(table.installer.unique())
    return [(f"{a}->{b}", table[table.installer == a].reset_index(drop=True),
             table[table.installer == b].reset_index(drop=True)) for a in insts for b in insts if a != b]


# ---------------------------------------------------------------------------
# Baselines (same interface as a real model)
# ---------------------------------------------------------------------------
def _band(kwh):
    return pd.cut(pd.Series(kwh).fillna(-1), CONSUMPTION_BANDS_KWH, right=False, labels=False)


def _mode(s, default):
    s = s.dropna()
    return s.mode().iloc[0] if len(s) else default


class KwhPer1000Baseline:
    """Rule of thumb: PV kWp = yearly kWh / 1000. Battery = installer's most common size. Yes/no = majority."""
    name = "baseline_kwh_per_1000"

    def fit(self, train: pd.DataFrame):
        self.global_ = self._stats(train)
        self.by_inst_ = {i: self._stats(g) for i, g in train.groupby("installer")}
        return self

    @staticmethod
    def _stats(g):
        return {**{c: bool(g[c].mean() >= 0.5) if len(g) else False for c in BOOL_COMPONENTS},
                "battery_kwh": float(_mode(g.loc[g.has_battery, "battery_kwh"], 0.0))}

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        rows = []
        for _, r in df.iterrows():
            st = self.by_inst_.get(r.installer, self.global_)       # unseen installer -> pooled statistics
            kwp = r.annual_kwh / 1000 if pd.notna(r.annual_kwh) else np.nan
            rows.append(dict(has_pv=st["has_pv"], pv_kwp=kwp if st["has_pv"] else 0.0,
                             has_battery=st["has_battery"], battery_kwh=st["battery_kwh"] if st["has_battery"] else 0.0,
                             has_wallbox=st["has_wallbox"], has_heatpump=st["has_heatpump"]))
        return pd.DataFrame(rows, index=df.index)


class BandMedianBaseline:
    """Median PV / most common battery / majority yes-no per installer x consumption band."""
    name = "baseline_band_median"

    def fit(self, train: pd.DataFrame):
        t = train.assign(band=_band(train.annual_kwh).values)
        self.cells_ = {k: self._stats(g) for k, g in t.groupby(["installer", "band"])}
        self.bands_ = {k: self._stats(g) for k, g in t.groupby("band")}
        self.inst_ = {k: self._stats(g) for k, g in t.groupby("installer")}
        self.global_ = self._stats(t)
        return self

    @staticmethod
    def _stats(g):
        return {**{c: bool(g[c].mean() >= 0.5) if len(g) else False for c in BOOL_COMPONENTS},
                "pv_kwp": float(g.loc[g.has_pv, "pv_kwp"].median()) if g.has_pv.any() else 0.0,
                "battery_kwh": float(_mode(g.loc[g.has_battery, "battery_kwh"], 0.0))}

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        bands = _band(df.annual_kwh).values
        rows = []
        for (_, r), b in zip(df.iterrows(), bands):
            # most specific statistics available: installer x band -> installer -> band -> everything
            st = (self.cells_.get((r.installer, b)) or self.inst_.get(r.installer)
                  or self.bands_.get(b) or self.global_)
            rows.append(dict(has_pv=st["has_pv"], pv_kwp=st["pv_kwp"] if st["has_pv"] else 0.0,
                             has_battery=st["has_battery"], battery_kwh=st["battery_kwh"] if st["has_battery"] else 0.0,
                             has_wallbox=st["has_wallbox"], has_heatpump=st["has_heatpump"]))
        return pd.DataFrame(rows, index=df.index)


BASELINES = {KwhPer1000Baseline.name: KwhPer1000Baseline, BandMedianBaseline.name: BandMedianBaseline}


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def step_index(kwh, sizes) -> np.ndarray:
    """Catalogue step of each value: 0 = no battery, 1 = smallest size, ... (nearest size). NaN stays NaN."""
    steps = np.concatenate([[0.0], np.asarray(sorted(sizes), dtype=float)])
    v = np.asarray(kwh, dtype=float)
    idx = np.abs(np.nan_to_num(v, nan=0.0)[:, None] - steps[None, :]).argmin(axis=1).astype(float)
    idx[np.isnan(v)] = np.nan
    return idx


def _rate(mask) -> float | None:
    mask = np.asarray(mask, dtype=bool)
    return float(mask.mean() * 100) if mask.size else None


def compute_metrics(truth: pd.DataFrame, pred: pd.DataFrame, catalogue: dict) -> dict:
    """
    truth: rows of the eval table; pred: predictions with DESIGN_COLUMNS, same index.
    NaN predictions count as misses for rates and are excluded (and counted) for MAE.
    """
    pred = pred.reindex(truth.index)
    m: dict = {"n_projects": int(len(truth))}

    # yes/no accuracy per component
    for c in BOOL_COMPONENTS:
        p = pred[c]
        ok = (p.notna() & (p.astype(object) == truth[c].astype(object))).to_numpy()
        m[f"{c}_accuracy"] = _rate(ok)

    # PV size (projects where the expert installed PV)
    pv = truth.has_pv.to_numpy()
    err = (pred.pv_kwp.astype(float) - truth.pv_kwp)[pv]
    m["pv_kwp_mae"] = float(err.abs().mean()) if err.notna().any() else None
    m["pv_kwp_within_1.5_pct"] = _rate((err.abs() <= 1.5).to_numpy())
    m["pv_n"], m["pv_n_missing_pred"] = int(pv.sum()), int(err.isna().sum())

    # battery size (projects where the expert installed a battery)
    bat = truth.has_battery.to_numpy()
    p_kwh = pred.battery_kwh.astype(float)
    err = (p_kwh - truth.battery_kwh)[bat]
    m["battery_kwh_mae"] = float(err.abs().mean()) if err.notna().any() else None
    within = []
    for (_, t), pk in zip(truth[bat].iterrows(), p_kwh[bat]):
        sizes = catalogue.get(t.installer) or sorted(set(sum(catalogue.values(), [])))
        if pd.isna(pk) or pk <= 0:                 # predicting "no battery" is a size miss
            within.append(False)
            continue
        d = abs(step_index([pk], sizes)[0] - step_index([t.battery_kwh], sizes)[0])
        within.append(d <= 1)
    m["battery_within_one_step_pct"] = _rate(within)
    m["battery_n"], m["battery_n_missing_pred"] = int(bat.sum()), int(err.isna().sum())

    # variant-range hit rate (all projects; a single-option project's range is one point)
    pk = pred.pv_kwp.astype(float)
    m["pv_variant_hit_strict_pct"] = _rate((pk >= truth.pv_min - 1e-9) & (pk <= truth.pv_max + 1e-9))
    m["pv_variant_hit_tolerant_pct"] = _rate((pk >= truth.pv_min - PV_TOLERANCE_KWP) & (pk <= truth.pv_max + PV_TOLERANCE_KWP))
    strict, tolerant = [], []
    for (_, t), b in zip(truth.iterrows(), p_kwh):
        if pd.isna(b):                      # no prediction = miss
            strict.append(False)
            tolerant.append(False)
            continue
        strict.append(t.battery_min - 1e-9 <= b <= t.battery_max + 1e-9)
        sizes = catalogue.get(t.installer) or sorted(set(sum(catalogue.values(), [])))
        lo, hi, s = step_index([t.battery_min, t.battery_max, b], sizes)
        tolerant.append(lo - BATTERY_TOLERANCE_STEPS <= s <= hi + BATTERY_TOLERANCE_STEPS)
    m["battery_variant_hit_strict_pct"] = _rate(strict)
    m["battery_variant_hit_tolerant_pct"] = _rate(tolerant)
    m["n_multi_option_projects"] = int((truth.n_options > 1).sum())
    return m


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def _evaluate_one(factory, train, test, catalogue):
    model = factory().fit(train)
    pred = model.predict(test) if len(test) else pd.DataFrame(columns=DESIGN_COLUMNS)
    missing = [c for c in DESIGN_COLUMNS if c not in pred.columns]
    if missing:
        raise ValueError(f"{getattr(model, 'name', model)} predict() must return columns {DESIGN_COLUMNS}; missing {missing}")
    overall = compute_metrics(test, pred, catalogue)
    by_inst = {i: compute_metrics(test[test.installer == i], pred[test.installer == i], catalogue)
               for i in sorted(test.installer.unique())}
    return overall, by_inst


def run_evaluation(labels: pd.DataFrame, predictors: dict, inputs: pd.DataFrame | None = None,
                   catalogue: dict | None = None, out_path: Path | str | None = ARTIFACTS / "eval_results.json",
                   test_size: float = 0.2, seed: int = SEED):
    """
    predictors: {name: factory} where factory() returns an object with fit/predict. Baselines are always added.
    Returns (tidy DataFrame, results dict shaped like GET /eval) and writes the dict to out_path.
    """
    inputs = load_inputs() if inputs is None else inputs
    catalogue = catalogue if catalogue is not None else load_catalogue(labels)
    table = build_eval_table(labels, inputs)
    train, test = grouped_split(table, test_size, seed)
    assert not set(train.project_id) & set(test.project_id), "project leak between train and test"
    all_preds = {**BASELINES, **predictors}

    results = {"protocol": dict(split="grouped by project_id, stratified by installer", test_size=test_size, seed=seed,
                                n_train=len(train), n_test=len(test), pv_tolerance_kwp=PV_TOLERANCE_KWP,
                                battery_tolerance_steps=BATTERY_TOLERANCE_STEPS, catalogue=catalogue),
               "metrics": {}, "by_installer": {}, "transfer": {}, "baselines": list(BASELINES)}
    rows = []
    for name, factory in all_preds.items():
        overall, by_inst = _evaluate_one(factory, train, test, catalogue)
        results["metrics"][name], results["by_installer"][name] = overall, by_inst
        rows += [dict(eval="held_out", predictor=name, installer="all", metric=k, value=v) for k, v in overall.items()]
        for inst, mm in by_inst.items():
            rows += [dict(eval="held_out", predictor=name, installer=inst, metric=k, value=v) for k, v in mm.items()]
        for tname, tr, te in installer_transfer(table):
            mm, _ = _evaluate_one(factory, tr, te, catalogue)
            results["transfer"].setdefault(tname, {})[name] = mm
            rows += [dict(eval=f"transfer {tname}", predictor=name, installer=te.installer.iloc[0] if len(te) else "",
                          metric=k, value=v) for k, v in mm.items()]
    if out_path is not None:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(json.dumps(results, indent=2, default=float))
    return pd.DataFrame(rows), results


def summary_table(tidy: pd.DataFrame, eval_name: str = "held_out", installer: str = "all") -> pd.DataFrame:
    """Metrics as rows, predictors as columns (for printing)."""
    t = tidy[(tidy["eval"] == eval_name) & (tidy.installer == installer)]
    return t.pivot(index="metric", columns="predictor", values="value")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Evaluate designs against expert labels.")
    ap.add_argument("--labels", default=str(ARTIFACTS / "expert_designs.parquet"))
    ap.add_argument("--raw-dir", default=str(RAW_DIR))
    ap.add_argument("--catalogue", default=str(ARTIFACTS / "catalogue.json"))
    ap.add_argument("--out", default=str(ARTIFACTS / "eval_results.json"))
    args = ap.parse_args(argv)
    try:
        labels = load_labels(args.labels)
    except FileNotFoundError as e:
        raise SystemExit(str(e))
    tidy, _ = run_evaluation(labels, {}, inputs=load_inputs(args.raw_dir),
                             catalogue=load_catalogue(labels, args.catalogue), out_path=args.out)
    pd.set_option("display.width", 200)
    print("== held-out (all installers) ==")
    print(summary_table(tidy).round(2).to_string())
    for e in sorted(x for x in tidy["eval"].unique() if x.startswith("transfer")):
        print(f"\n== {e} ==")
        sub = tidy[tidy["eval"] == e]
        print(sub.pivot(index="metric", columns="predictor", values="value").round(2).to_string())
    print(f"\n[saved] {args.out}")


if __name__ == "__main__":
    main()
