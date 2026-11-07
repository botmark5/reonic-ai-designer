"""Tests for engine/evaluate.py: label contract, splits, baselines, metrics (hand-computed), runner."""
import json

import numpy as np
import pandas as pd
import pytest

from engine import evaluate as E

NAN = float("nan")


# ---------------------------------------------------------------- hand-computed 4-project example
@pytest.fixture
def tiny():
    truth = pd.DataFrame([
        # project, PV, PV range, battery, battery range, wallbox, options
        dict(project_id="p1", installer="X", has_pv=True, pv_kwp=10, pv_min=10, pv_max=10, has_battery=True,
             battery_kwh=10, battery_min=10, battery_max=10, has_wallbox=False, has_heatpump=False, n_options=1),
        dict(project_id="p2", installer="X", has_pv=True, pv_kwp=8, pv_min=8, pv_max=11, has_battery=True,
             battery_kwh=5, battery_min=5, battery_max=15, has_wallbox=True, has_heatpump=False, n_options=2),
        dict(project_id="p3", installer="X", has_pv=False, pv_kwp=0, pv_min=0, pv_max=0, has_battery=False,
             battery_kwh=0, battery_min=0, battery_max=0, has_wallbox=False, has_heatpump=False, n_options=1),
        dict(project_id="p4", installer="X", has_pv=True, pv_kwp=6, pv_min=6, pv_max=6, has_battery=True,
             battery_kwh=15, battery_min=15, battery_max=15, has_wallbox=False, has_heatpump=False, n_options=1),
    ])
    pred = pd.DataFrame([
        dict(has_pv=True, pv_kwp=10.5, has_battery=True, battery_kwh=10, has_wallbox=False, has_heatpump=False),
        dict(has_pv=True, pv_kwp=12.0, has_battery=True, battery_kwh=10, has_wallbox=False, has_heatpump=False),
        dict(has_pv=False, pv_kwp=0.0, has_battery=True, battery_kwh=5, has_wallbox=False, has_heatpump=False),
        dict(has_pv=True, pv_kwp=NAN, has_battery=False, battery_kwh=0, has_wallbox=False, has_heatpump=False),
    ])
    return truth, pred, {"X": [5.0, 10.0, 15.0]}


def test_metrics_hand_computed(tiny):
    m = E.compute_metrics(*tiny)
    assert m["has_pv_accuracy"] == 100
    assert m["has_battery_accuracy"] == 50
    assert m["has_wallbox_accuracy"] == 75
    assert m["has_heatpump_accuracy"] == 100
    assert m["pv_kwp_mae"] == pytest.approx(2.25)                # (0.5 + 4) / 2, NaN excluded ...
    assert m["pv_n"] == 3 and m["pv_n_missing_pred"] == 1        # ... and counted
    assert m["pv_kwp_within_1.5_pct"] == pytest.approx(100 / 3)  # NaN counts as a miss
    assert m["battery_kwh_mae"] == pytest.approx(20 / 3)         # (0 + 5 + 15) / 3
    assert m["battery_within_one_step_pct"] == pytest.approx(200 / 3)  # 10 vs 5 = 1 step; "none" vs 15 = miss
    assert m["pv_variant_hit_strict_pct"] == 25                  # only p3 (0 in [0, 0])
    assert m["pv_variant_hit_tolerant_pct"] == 75                # p1, p2 (+-1 kWp), p3; p4 NaN = miss
    assert m["battery_variant_hit_strict_pct"] == 50             # p1, p2
    assert m["battery_variant_hit_tolerant_pct"] == 75           # + p3 (5 kWh is one step above "none")
    assert m["n_multi_option_projects"] == 1


def test_metrics_empty_test_set(tiny):
    truth, pred, cat = tiny
    m = E.compute_metrics(truth.iloc[:0], pred.iloc[:0], cat)
    assert m["n_projects"] == 0 and m["pv_kwp_mae"] is None and m["has_pv_accuracy"] is None


def test_metrics_all_nan_predictions(tiny):
    truth, pred, cat = tiny
    nan_pred = pred.copy()
    for c in E.DESIGN_COLUMNS:
        nan_pred[c] = np.nan
    m = E.compute_metrics(truth, nan_pred, cat)
    assert m["has_pv_accuracy"] == 0 and m["pv_kwp_mae"] is None
    assert m["pv_variant_hit_tolerant_pct"] == 0 and m["battery_variant_hit_tolerant_pct"] == 0


def test_step_index():
    np.testing.assert_array_equal(E.step_index([0, 5, 7, 10, 14, 30], [5, 10, 15]), [0, 1, 1, 2, 3, 3])
    assert np.isnan(E.step_index([NAN], [5, 10])[0])


# ---------------------------------------------------------------- label contract
def test_validate_labels_ok(synthetic):
    E.validate_labels(synthetic[0])


def test_validate_labels_missing_columns(synthetic):
    with pytest.raises(ValueError, match="battery_kwh"):
        E.validate_labels(synthetic[0].drop(columns=["battery_kwh"]))


def test_validate_labels_two_primaries(synthetic):
    labels = synthetic[0].copy()
    labels["is_primary"] = True
    with pytest.raises(ValueError, match="exactly one is_primary"):
        E.validate_labels(labels)


def test_validate_labels_negative(synthetic):
    labels = synthetic[0].copy()
    labels.loc[0, "pv_kwp"] = -3
    with pytest.raises(ValueError, match="negative"):
        E.validate_labels(labels)


def test_eval_table_ranges(synthetic):
    labels, inputs = synthetic
    t = E.build_eval_table(labels, inputs)
    assert len(t) == labels.project_id.nunique()
    multi = t[t.n_options > 1].iloc[0]
    assert multi.pv_max - multi.pv_min == pytest.approx(1.5)      # option 2 has +1.5 kWp in the fixture
    assert (t.pv_min <= t.pv_kwp).all() and (t.pv_kwp <= t.pv_max).all()
    assert "annual_kwh" in t and t.annual_kwh.notna().all()


def test_load_labels_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="engine/labels.py"):
        E.load_labels(tmp_path / "nope.parquet")


def test_load_labels_parquet_roundtrip(synthetic, tmp_path):
    p = tmp_path / "labels.parquet"
    synthetic[0].to_parquet(p)
    assert len(E.load_labels(p)) == len(synthetic[0])


# ---------------------------------------------------------------- catalogue
def test_catalogue_from_labels(synthetic):
    cat = E.load_catalogue(synthetic[0], path=None)
    assert set(cat) == {"instA", "instB"}
    assert all(s > 0 for sizes in cat.values() for s in sizes)


@pytest.mark.parametrize("content", [{"instA": [5, 10]}, {"instA": {"battery_kwh": [5, 10], "pv_kwp": [6.3]}}])
def test_catalogue_from_json(synthetic, tmp_path, content):
    p = tmp_path / "catalogue.json"
    p.write_text(json.dumps(content))
    assert E.load_catalogue(synthetic[0], p) == {"instA": [5.0, 10.0]}


# ---------------------------------------------------------------- splits
def test_grouped_split_no_leak_and_stratified(synthetic):
    t = E.build_eval_table(*synthetic)
    train, test = E.grouped_split(t, test_size=0.2, seed=1)
    assert not set(train.project_id) & set(test.project_id)
    assert len(train) + len(test) == len(t)
    assert set(test.installer) == {"instA", "instB"}
    again, _ = E.grouped_split(t, test_size=0.2, seed=1)
    assert list(again.project_id) == list(train.project_id)          # fixed seed = same split


def test_installer_transfer(synthetic):
    t = E.build_eval_table(*synthetic)
    pairs = E.installer_transfer(t)
    assert [p[0] for p in pairs] == ["instA->instB", "instB->instA"]
    for _, tr, te in pairs:
        assert tr.installer.nunique() == 1 and te.installer.nunique() == 1
        assert tr.installer.iloc[0] != te.installer.iloc[0]


# ---------------------------------------------------------------- baselines
def test_kwh_per_1000_baseline(synthetic):
    t = E.build_eval_table(*synthetic)
    pred = E.KwhPer1000Baseline().fit(t).predict(t)
    assert set(E.DESIGN_COLUMNS) <= set(pred.columns)
    assert np.allclose(pred.pv_kwp, t.annual_kwh / 1000)


def test_band_median_baseline_learns_bands(synthetic):
    t = E.build_eval_table(*synthetic)
    pred = E.BandMedianBaseline().fit(t).predict(t)
    m = E.compute_metrics(t, pred, E.load_catalogue(synthetic[0], path=None))
    # the fixture's PV is a pure function of demand, so a band median is close
    assert m["pv_kwp_mae"] < 1.0


def test_baselines_handle_unseen_installer_and_missing_demand(synthetic):
    t = E.build_eval_table(*synthetic)
    new = t.head(3).assign(installer="never_seen", annual_kwh=[np.nan, 4000, 0])
    for cls in E.BASELINES.values():
        pred = cls().fit(t).predict(new)
        assert len(pred) == 3 and pred.has_pv.notna().all()


# ---------------------------------------------------------------- runner
class PerfectModel:
    """Cheats by reading the truth: every metric must be perfect."""
    name = "perfect"

    def fit(self, train):
        return self

    def predict(self, df):
        return df[E.DESIGN_COLUMNS].copy()


class BrokenModel:
    def fit(self, train):
        return self

    def predict(self, df):
        return pd.DataFrame({"pv_kwp": np.zeros(len(df))}, index=df.index)


def test_run_evaluation_end_to_end(synthetic, tmp_path):
    labels, inputs = synthetic
    out = tmp_path / "eval.json"
    tidy, res = E.run_evaluation(labels, {"perfect": PerfectModel}, inputs=inputs, out_path=out)
    assert out.exists() and json.loads(out.read_text())["protocol"]["n_test"] > 0
    assert set(res["metrics"]) == {"perfect", *E.BASELINES}
    p = res["metrics"]["perfect"]
    assert p["pv_kwp_mae"] == 0 and p["battery_kwh_mae"] == 0 and p["has_wallbox_accuracy"] == 100
    assert p["pv_variant_hit_strict_pct"] == 100 and p["battery_variant_hit_strict_pct"] == 100
    assert set(res["transfer"]) == {"instA->instB", "instB->instA"}
    assert set(res["by_installer"]["perfect"]) == {"instA", "instB"}
    table = E.summary_table(tidy)
    assert "pv_kwp_mae" in table.index and "perfect" in table.columns


def test_run_evaluation_rejects_incomplete_predictions(synthetic):
    with pytest.raises(ValueError, match="must return columns"):
        E.run_evaluation(synthetic[0], {"broken": BrokenModel}, inputs=synthetic[1], out_path=None)


def test_cli_missing_labels_file(tmp_path):
    with pytest.raises(SystemExit, match="not found"):
        E.main(["--labels", str(tmp_path / "missing.parquet")])


@pytest.mark.skipif(not E.RAW_DIR.exists(), reason="real data not present (data/raw is never committed)")
def test_load_inputs_real_data():
    inp = E.load_inputs()
    assert inp.project_id.is_unique
    assert set(inp.installer) == {"23c108b7", "2a8ba8e2"}
    assert len(inp) == 342 + 1277
    assert inp.annual_kwh.median() == pytest.approx(4500)


# ---------------------------------------------------------------- engine/labels schema v1.1 + customer split
def test_normalize_mark_schema(synthetic):
    labels = synthetic[0].rename(columns={"has_battery": "battery", "has_wallbox": "wallbox", "has_heatpump": "heatpump"})
    labels = labels.drop(columns=["has_pv"])
    labels["heatpump_kw"] = np.nan                               # v1.1: NaN = no heat pump
    labels["is_outlier"] = False
    labels.loc[labels.index[0], "is_outlier"] = True             # a primary option -> whole project dropped
    norm = E.normalize_labels(labels)
    E.validate_labels(norm)
    assert {"has_pv", "has_battery", "has_wallbox", "has_heatpump"} <= set(norm.columns)
    assert (norm.heatpump_kw == 0).all()
    assert labels.project_id.iloc[0] not in set(norm.project_id)
    assert E.normalize_labels(norm).equals(norm)                 # idempotent
    assert len(E.build_eval_table(labels, synthetic[1])) == labels.project_id.nunique() - 1


def test_split_groups_customers(synthetic):
    labels, inputs = synthetic
    inputs = inputs.assign(customer_contact_id=[f"c{i // 2}" for i in range(len(inputs))])   # 2 projects per customer
    t = E.build_eval_table(labels, inputs)
    train, test = E.grouped_split(t, seed=3)
    assert not set(train.customer_contact_id) & set(test.customer_contact_id)
    assert not set(train.project_id) & set(test.project_id)
