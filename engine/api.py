"""
engine/api.py - the HTTP API the website talks to (contract: docs/api.md).

    .venv\\Scripts\\uvicorn engine.api:app --reload --port 8000      ->  http://localhost:8000/docs

Endpoints
    POST /design    complete design + physics + economics + similar homes + facts for the explanation
    POST /validate  where a planner's design sits among similar homes + physics sanity flags
    POST /refine    planner text -> input changes (Claude Haiku or keyword fallback) -> new /design
    POST /explain   streamed plain-language explanation (Claude Sonnet or template fallback)
    GET  /eval      metrics on held-out projects (written by `python -m engine.train`)
    GET  /project/{id}   a real project: home, expert design, all variants, and our proposal
    GET  /installers     known installers and what they sell;  GET /health
The engine decides every size; Claude only parses text and writes explanations.
"""
from __future__ import annotations

import json
import logging
import os
import warnings
from functools import lru_cache
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from engine import llm, physics
from engine.evaluate import ARTIFACTS, build_eval_table, load_inputs
from engine.interim_labels import get_labels
from engine.model import MODEL_PATH, DesignModel, home_to_physics

warnings.filterwarnings("ignore", message="X does not have valid feature names")
log = logging.getLogger("engine.api")
MODEL_VERSION = "v1"


# ---------------------------------------------------------------------------
# Request models (field names = docs/api.md; extra optional fields are marked)
# ---------------------------------------------------------------------------
class Home(BaseModel):
    annual_kwh: float = Field(ge=0, description="yearly household electricity demand (without EV / new heat pump)")
    price_eur_kwh: Optional[float] = Field(None, gt=0, le=2)
    load_profile: Optional[str] = "H0"
    has_ev: bool = False
    ev_km_year: Optional[float] = Field(None, ge=0)
    existing_pv_kwp: Optional[float] = Field(None, ge=0)
    existing_battery_kwh: Optional[float] = Field(None, ge=0)
    heating: Optional[str] = None
    heating_demand_kwh: Optional[float] = Field(None, ge=0)
    roof_type: Optional[str] = None
    house_sqm: Optional[float] = None
    inhabitants: Optional[int] = None
    # optional extras (not in api.md v0, safe to omit)
    existing_wallbox: bool = False
    orientation_deg: Optional[float] = Field(None, ge=0, le=360, description="180 = south")
    tilt_deg: Optional[float] = Field(None, ge=0, le=90)
    offer_date: Optional[str] = Field(None, description="ISO date; empty = today")


class Locks(BaseModel):
    pv_kwp: Optional[float] = Field(None, ge=0, description="0 = no PV")
    battery_kwh: Optional[float] = Field(None, ge=0, description="0 = no battery")
    wallbox: Optional[bool] = None
    heatpump_kw: Optional[float] = Field(None, ge=0, description="0 = no heat pump")


class DesignRequest(BaseModel):
    installer: str
    home: Home
    locks: Locks = Locks()


class PlannerDesign(BaseModel):
    pv_kwp: Optional[float] = Field(None, ge=0)
    battery_kwh: Optional[float] = Field(None, ge=0)
    wallbox: Optional[bool] = None
    heatpump_kw: Optional[float] = Field(None, ge=0)


class ValidateRequest(BaseModel):
    installer: str
    home: Home
    design: PlannerDesign


class RefineRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    home: Home
    locks: Locks = Locks()
    installer: Optional[str] = Field(None, description="extra vs api.md v0; default = the larger installer")


class ExplainRequest(BaseModel):
    design_response: dict
    audience: Literal["planner", "homeowner"] = "planner"
    language: Literal["en", "de"] = "en"


# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def get_model() -> DesignModel:
    if MODEL_PATH.exists():
        return DesignModel.load(MODEL_PATH)
    log.warning("no trained model at %s: training now (run `python -m engine.train` for metrics)", MODEL_PATH)
    labels, source = get_labels()
    model = DesignModel().fit(build_eval_table(labels, load_inputs()))
    model.labels_source_ = source
    model.save(MODEL_PATH)
    return model


@lru_cache(maxsize=1)
def get_projects() -> tuple[pd.DataFrame, pd.DataFrame]:
    """(inputs per project, all label rows) for /project/{id}; needs data/raw."""
    labels, _ = get_labels()
    return load_inputs(), labels


def _py(obj):
    """numpy / pandas values -> plain JSON types; NaN / infinity -> null (not valid JSON)."""
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if hasattr(o, "item") and not isinstance(o, (str, bytes)):
            o = o.item()
        if isinstance(o, float) and not np.isfinite(o):
            return None
        if o is pd.NaT:
            return None
        return o if isinstance(o, (str, int, float, bool, type(None))) else str(o)
    return clean(obj)


def _check_installer(model: DesignModel, installer: str):
    if installer not in model.installers_:
        raise HTTPException(422, f"Unknown installer {installer!r}. Known: {model.installers_}")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Reonic AI Designer engine", version=MODEL_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ENGINE_CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    model = get_model()
    return dict(status="ok", model_version=MODEL_VERSION, labels_source=getattr(model, "labels_source_", "unknown"),
                trained_on_projects=model.n_train_, claude=llm.claude_available())


@app.get("/installers")
def installers():
    model = get_model()
    return {i: model.catalogue_.get(i, {}) for i in model.installers_}


def design_response(installer: str, home: dict, locks: dict) -> dict:
    """The /design logic, reused by /refine and /project."""
    model = get_model()
    _check_installer(model, installer)
    proposal = model.propose(home, installer, locks)
    d = proposal["design"]
    system = physics.System(pv_kwp=d["pv"]["kwp"] or 0.0, battery_kwh=d["battery"]["kwh"] or 0.0,
                            heatpump_kw=d["heatpump"]["kw"] or 0.0, wallbox=d["wallbox"]["include"])
    ph_home = home_to_physics(home)
    sim = physics.simulate(ph_home, system)
    flags = physics.sanity_flags(ph_home, system, sim)
    eco = physics.economics(ph_home, system, sim)
    similar = model.similar_homes(home, installer, k=5)
    return _py(dict(
        design=d,
        physics=dict(yield_kwh=round(sim.yield_kwh), self_consumption=round(sim.self_consumption, 3),
                     autarky=round(sim.autarky, 3), load_kwh=round(sim.load_kwh), grid_import_kwh=round(sim.grid_import_kwh),
                     feed_in_kwh=round(sim.feed_in_kwh), battery_cycles=round(sim.battery_cycles),
                     warnings=[f["message"] for f in flags if f["level"] in ("warn", "error")], flags=flags,
                     assumptions=sim.assumptions),
        economics=dict(capex_total_eur=round(eco["capex_total_eur"]), savings_first_year_eur=round(eco["savings_first_year_eur"]),
                       payback_years=None if eco["payback_years"] is None else round(eco["payback_years"], 1),
                       savings_lifetime_eur=round(eco["savings_lifetime_eur"]), assumptions=eco["assumptions"]),
        similar_homes=[dict(project_id=r.project_id, annual_kwh=r.annual_kwh, pv_kwp=round(r.pv_kwp, 2),
                            battery_kwh=r.battery_kwh, similarity=r.similarity) for r in similar.itertuples()],
        facts_for_explanation={**proposal["facts"], "home": home,
                               "demand": dict(household_kwh=sim.household_kwh, ev_kwh=sim.ev_kwh, heatpump_kwh=sim.heatpump_kwh)},
        model_version=f"{MODEL_VERSION} ({getattr(model, 'labels_source_', 'unknown labels')})",
    ))


@app.post("/design")
def design(req: DesignRequest):
    return design_response(req.installer, req.home.model_dump(), req.locks.model_dump())


@app.post("/validate")
def validate(req: ValidateRequest):
    model = get_model()
    _check_installer(model, req.installer)
    return _py({"flags": model.validate(req.home.model_dump(), req.installer, req.design.model_dump())})


@app.post("/refine")
def refine(req: RefineRequest):
    model = get_model()
    installer = req.installer or max(model.installers_, key=lambda i: (model.reference_.installer == i).sum())
    home, locks = req.home.model_dump(), req.locks.model_dump()
    parsed = llm.refine(req.text, home)
    home.update(parsed["home_changes"])
    locks.update(parsed["lock_changes"])
    return dict(changes={**parsed["home_changes"], **parsed["lock_changes"]}, summary=parsed["summary"],
                parsed_by=parsed["source"], home=home, locks=locks, design=design_response(installer, home, locks))


@app.post("/explain")
def explain(req: ExplainRequest):
    return StreamingResponse(llm.explain_stream(req.design_response, req.audience, req.language),
                             media_type="text/plain; charset=utf-8")


@app.get("/eval")
def eval_results():
    path = ARTIFACTS / "eval_results.json"
    if not path.exists():
        raise HTTPException(404, "No evaluation yet: run `python -m engine.train`.")
    return json.loads(path.read_text())


@app.get("/project/{project_id}")
def project(project_id: str):
    inputs, labels = get_projects()
    row = inputs[inputs.project_id == project_id]
    if row.empty:
        raise HTTPException(404, f"Unknown project {project_id!r}")
    r = row.iloc[0]
    nan = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NaT else v
    home = dict(annual_kwh=nan(r.annual_kwh) or 0.0, price_eur_kwh=nan(r.price_eur_kwh) if 0 < (r.price_eur_kwh or 0) <= 1 else None,
                load_profile=r.load_profile, has_ev=bool(r.has_ev), ev_km_year=nan(r.ev_km_year), heating=nan(r.heating),
                heating_demand_kwh=nan(r.heating_demand_kwh), existing_pv_kwp=None, existing_battery_kwh=None,
                existing_wallbox=bool(r.existing_wallbox),
                offer_date=None if pd.isna(r.offer_date) else r.offer_date.isoformat())
    options = labels[labels.project_id == project_id].sort_values("option_number")
    cols = ["option_number", "is_primary", "pv_kwp", "battery_kwh", "has_wallbox", "heatpump_kw"]
    variants = options[cols].to_dict("records")
    expert = next((v for v in variants if v["is_primary"]), None)
    ours = design_response(r.installer, home, {}) if home["annual_kwh"] > 0 else None
    return _py(dict(project_id=project_id, installer=r.installer, home=home, expert=expert, variants=variants, ours=ours))
