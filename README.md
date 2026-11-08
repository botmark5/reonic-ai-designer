# Reonic AI Designer (thinc! Hack Munich 2026)

An AI design engine that turns a few facts about a home into a complete energy-system design, PV size, battery yes/no + size,
wallbox yes/no, heat pump as an option, the way an installer's planner would, learned from ~1,600 real installer projects of two
installers with different catalogues. Every decision comes with a plain-language reason, a range and a confidence; the planner can
fix any component and the rest adapts; a homeowner view explains the offer in plain words.

`engine/` = Python data pipeline, model, physics, FastAPI · `web/` = Next.js app (planner, reality check, homeowner offer, voice) · `docs/` = plan, decisions, API contract, pitch facts.

## Setup
- Engine (model + API): `engine/README.md` (venv, `pip install -r engine/requirements.txt`, tests, how to get the locked test set and the expert labels from the private `data-v1` release, `python -m engine.train`, `uvicorn engine.api:app`).
- Web app: `web/README.md` (`npm install`, `npm run dev`, env vars in `docs/deploy.md`).
- Raw Reonic data lives in `data/raw/` and is **never committed** (Reonic asked us not to share it); everything derived from it (`engine/artifacts/`) is git-ignored too.

## Approach (short)
1. **Expert labels** (`engine/labels.py`, rules in `docs/labels-rules.md`): one design per offer option parsed from the line items
   (PV kWp, battery kWh, wallbox, heat pump, offer type new system / battery retrofit / wallbox only), with the units of the raw
   columns fixed (several are shifted or in W/Wh).
2. **Chained model** (`engine/model.py`): heat pump rule (physics) → total demand incl. EV and heat pump → PV yes/no + size
   (LightGBM, monotone in demand, snapped to the installer's packages) → battery yes/no + catalogue size (sees the planned PV)
   → wallbox. Locks let the planner fix any step. An LLM never picks a size; Claude only parses planner text and writes explanations.
3. **Physics and economics** (`engine/physics.py`): hourly synthetic year → yield, self-consumption, autarky, payback, plausibility flags.
4. **Evaluation** (`engine/evaluate.py`): 315 held-out projects locked in `test_ids.json`, split by customer, never used for tuning;
   three baselines; installer A→B transfer; before/after per improvement and an error analysis in `engine/RESULTS.md`.

## Results and known limitations
See `engine/README.md` (results tables, what beats the baselines and what does not, honest caveats) and `engine/RESULTS.md`
(before/after, error analysis). Short version: the model clearly beats the baselines on the yes/no decisions and on the whole-project
PV error (2.94 vs 3.77 kWp MAE), beats them only slightly on pure size error (PV 2.48 vs 2.64 kWp, battery 2.45 vs 2.71 kWh),
and loses on "PV within ±1.5 kWp" and wallbox. PV size is barely predictable without roof data; a new system always gets a battery;
wallbox without EV information is a coin flip; the heat pump rule rests on 17 projects; economics use placeholder prices.
