"""Regression tests for the 8 Nov night fixes (issues #66 and #47). Synthetic data; the /project test needs the data."""
import json

import pytest
from fastapi.testclient import TestClient

from engine import api, physics
from engine.evaluate import ARTIFACTS, build_eval_table
from engine.model import DesignModel
from engine.tests.conftest import make_synthetic

HAS_DATA = (ARTIFACTS / "expert_designs.parquet").exists() and (ARTIFACTS / "test_ids.json").exists() \
    and (api.MODEL_PATH).exists()


# --- #66: physics flags calibrated on expert practice -------------------------------------------------------------
def test_flag_thresholds_follow_expert_percentiles():
    """The constants encode the expert percentiles (engine/physics.py comment); a change here is a deliberate recalibration."""
    assert physics.PV_RATIO_INFO < physics.PV_RATIO_WARN < physics.PV_RATIO_ERROR
    assert 3.7 <= physics.PV_RATIO_WARN <= 4.4          # between p95 and p97.5 of expert new systems
    assert 5.0 <= physics.PV_RATIO_ERROR <= 6.0         # about p99
    assert 1.7 <= physics.BATTERY_KWH_PER_KWP_WARN <= 2.2


def test_small_home_expert_style_design_is_not_implausible():
    """1,600 kWh home: experts gave such homes 6-7 kWp and a battery; the engine's own proposal must not be flagged 'error'."""
    flags = physics.sanity_flags(physics.Home(1600), physics.System(7.2, 9.2))
    assert not [f for f in flags if f["level"] == "error"], flags
    assert any(f["code"] in ("PV_OVERSIZED", "PV_MOSTLY_FED_IN") for f in flags)        # the feed-in share is still explained
    assert any(f["code"] == "BATTERY_EXCEEDS_DAILY_USE" and f["level"] == "info" for f in flags)


def test_design_api_small_home_has_no_error_flag_on_its_own_proposal():
    labels, inputs = make_synthetic(n_per_installer=120, seed=3)
    model = DesignModel().fit(build_eval_table(labels, inputs))
    r = model.propose({"annual_kwh": 1600, "has_existing_pv": False}, "instA")["design"]
    system = physics.System(pv_kwp=r["pv"]["kwp"] or 0, battery_kwh=r["battery"]["kwh"] or 0)
    flags = physics.sanity_flags(physics.Home(1600, existing_pv_kwp=None), system)
    # synthetic experts size PV ~ kWh/450 (3.6 kWp here): never "implausible" for what the model learned from them
    assert not [f for f in flags if f["level"] == "error"], (r["pv"], flags)


# --- #47: /project with the planner's answer ------------------------------------------------------------------------
@pytest.mark.skipif(not HAS_DATA, reason="needs the Reonic-derived artifacts (expert_designs.parquet, test_ids.json, model)")
def test_project_answered_mode_turns_retrofit_into_retrofit():
    """A held-out battery-only project: unanswered = whatever the model guesses; answered = a battery retrofit, no new PV."""
    client = TestClient(api.app)
    inputs, labels = api.get_projects()
    test_ids = set(json.loads((ARTIFACTS / "test_ids.json").read_text())["test_project_ids"])
    retro = labels[(labels.offer_type == "battery_retrofit") & labels.is_primary.astype(bool) & labels.project_id.isin(test_ids)]
    assert len(retro) > 0
    pid = retro.project_id.iloc[0]
    base = client.get(f"/project/{pid}").json()
    assert base["answered"] is False and base["planner_answer"] is None
    ans = client.get(f"/project/{pid}", params={"answered": "true"}).json()
    assert ans["answered"] is True and ans["planner_answer"] is True
    assert ans["home"]["has_existing_pv"] is True
    if ans["ours"] is not None:
        assert ans["ours"]["design"]["pv"]["include"] is False
        assert ans["ours"]["facts_for_explanation"]["offer_type"] == "battery_retrofit"
    # a new system answers "no": the response shape is unchanged
    new = labels[(labels.offer_type == "new_system") & labels.is_primary.astype(bool) & labels.project_id.isin(test_ids)]
    r = client.get(f"/project/{new.project_id.iloc[0]}", params={"answered": "true"}).json()
    assert r["planner_answer"] is False and r["home"]["has_existing_pv"] is False
    assert set(r) >= {"project_id", "installer", "home", "expert", "variants", "ours"}


# --- alternatives: one smaller and one larger size around the proposal -----------------------------------------
def test_alternatives_bracket_the_proposal():
    labels, inputs = make_synthetic(n_per_installer=120, seed=3)
    model = DesignModel().fit(build_eval_table(labels, inputs))
    seen_bracket = False
    for kwh in (2500, 3500, 4500, 6000, 8000):
        d = model.propose({"annual_kwh": kwh, "has_existing_pv": False}, "instA")["design"]
        for comp, key in (("pv", "kwp"), ("battery", "kwh")):
            alts = d[comp].get("alternatives") or []
            size = d[comp][key]
            assert len(alts) <= 2 and alts == sorted(alts, key=lambda a: a[key])
            assert all(abs(a[key] - size) > 0.05 and 0 < a["share"] <= 1 for a in alts), (comp, size, alts)
            if len(alts) == 2 and alts[0][key] < size < alts[1][key]:
                seen_bracket = True
    assert seen_bracket
