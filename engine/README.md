# Engine

Python engine: expert labels → chained design model + physics → evaluation → FastAPI for the website.
The engine decides every size. Claude only turns planner text into input changes and writes explanations.

## Setup and run (Windows; on macOS/Linux use `.venv/bin/python`)
```
python -m venv .venv
.venv\Scripts\python -m pip install -r engine/requirements.txt
# data: data/raw/<installer>/*.csv (never committed)
.venv\Scripts\python -m engine.train                          # evaluate + train -> engine/artifacts/
.venv\Scripts\uvicorn engine.api:app --reload --port 8000     # API; try it at http://localhost:8000/docs
.venv\Scripts\python -m pytest engine/tests -q                # 111 tests, no data or API key needed
```
Claude (optional): put `ANTHROPIC_API_KEY=...` in `engine/.env` (gitignored). Without a key, `/refine` uses a
keyword parser and `/explain` a template, so the demo always works. `GET /health` shows `"claude": true/false`.

If `engine/artifacts/design_model.joblib` is missing, the API trains a model on first start (~30 s).

## Files
| file | what |
|---|---|
| `interim_labels.py` | TEMPORARY expert designs parsed from offer line items, in the label contract (docs/data-notes.md). Replaced automatically by Mark's `artifacts/expert_designs.parquet` as soon as it exists |
| `features.py` | home inputs → model features (same code for training and prediction), incl. EV + heat pump demand |
| `model.py` | `DesignModel`: chain heat pump rule → PV → battery → wallbox, locks, catalogue snapping, ranges, confidence, SHAP reasons, similar homes, validation |
| `physics.py` | hourly synthetic year: yield, self-consumption, autarky, heat pump rule, economics, sanity flags |
| `evaluate.py` | model-agnostic evaluation: held-out by project, installer transfer, baselines, variant hit rate |
| `train.py` | runs the evaluation, then trains the shipped model on all projects |
| `llm.py` | Claude Haiku 5.5 (`/refine`, structured output) and Claude Sonnet 5.5 (`/explain`, streamed, server-side refusal fallback) + no-key fallbacks |
| `api.py` | FastAPI: `/design`, `/validate`, `/refine`, `/explain`, `/eval`, `/project/{id}`, `/installers`, `/health` |
| `config/economics.toml` | price assumptions (all placeholders) |

## How a design is made
1. **Heat pump (rule):** gas/oil heating and the installer sells heat pumps → heat demand / 2,450 h, snapped to a catalogue size. Never if a heat pump exists.
2. **Total demand (physics):** household + EV (km/100 × 18 kWh) + new heat pump (heat / SCOP 3.5).
3. **PV:** yes/no classifier; size from a Huber regressor with monotonic constraints (more demand or an EV never shrinks the PV); P10–P90 range; snapped to whole 450 W modules.
4. **Battery:** yes/no + size class, both seeing the planned PV; probabilities restricted to the installer's catalogue.
5. **Wallbox:** small classifier on EV features (most wallbox buyers have no EV recorded).
6. **Locks:** any component the planner fixes is kept, and the later steps adapt to it.
7. **Reasons:** per-decision SHAP contributions (LightGBM `pred_contrib`) turned into sentences.

## Results (held-out 20 %, 319 projects never seen in training; interim labels)
| metric | model | band median | kWp = kWh/1000 |
|---|---|---|---|
| PV kWp MAE, end to end | 2.92 | **2.67** | 4.80 |
| PV kWp MAE, where both have PV | **2.56** | 2.67 | 4.74 |
| PV inside the variant range ± 1 kWp | **40 %** | 30 % | 11 % |
| battery kWh MAE, where both have one | **2.43** | 2.66 | 3.04 |
| battery within one catalogue step | **62 %** | 58 % | 43 % |
| battery inside the variant range ± 1 step | **60 %** | 55 % | 41 % |
| PV yes/no accuracy | **89 %** | 81 % | 81 % |
| battery yes/no accuracy | 87 % | **88 %** | 88 % |
| wallbox yes/no accuracy | 78 % | 78 % | 78 % |
| heat pump yes/no accuracy | 98 % | **99 %** | 99 % |

Installer transfer (train on one, test on the other), PV MAE where both have PV: 2.99 vs 3.06 (A→B) and
2.88 vs 3.53 (B→A) for model vs band median.

## Known limitations (be honest in the pitch)
- **Labels are interim** (my parser) until engine/labels lands; PV for installer 2a8ba8e2 is panel count × an assumed 450 W.
- **PV size is barely predictable beyond consumption bands** (CV: 2.60 vs 2.69 kWp). The data has no roof size/orientation, which probably drives the expert choice.
- **End-to-end PV MAE loses to the baseline**: about 17 of 257 test projects are wrongly predicted "no PV" (battery-only retrofits are hard to tell apart).
- **Wallbox ≈ coin flip** without EV information. **Heat pump rule** proposes one for every gas/oil home; experts did so in 11 of 24 cases.
- **Time trend:** new projects use a date capped at the 90th percentile of training dates (~Mar 2026), because the last month is an unusual batch of battery-only retrofits.
- **Economics use placeholder prices.**

## API additions vs docs/api.md v0 (all optional, nothing removed)
`economics` block; `physics.flags/assumptions/load_kwh/...`; `battery.alternatives`; `installer` and
`offer_date`/`orientation_deg`/`tilt_deg`/`existing_wallbox` as optional request fields; `/installers`, `/health`.
`/refine` returns `{changes, summary, parsed_by, home, locks, design}`.
