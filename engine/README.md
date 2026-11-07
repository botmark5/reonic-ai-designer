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
1. **Heat pump = customer option:** if the home heats with gas/oil and the installer sells heat pumps, a heat pump is
   OFFERED (heat demand / 2,450 h, snapped to a catalogue size) but not included by default; the customer chooses based
   on budget and needs. `/design` returns `options.heatpump` with the full design **with and without** it (PV/battery
   re-sized, extra investment, extra yearly savings, lifetime benefit, autarky). Choose it with `locks.heatpump_kw = kw`
   (or `/refine` "the customer wants a heat pump"). Never offered if a heat pump already exists.
2. **Total demand (physics):** household + EV (km/100 × 18 kWh) + new heat pump (heat / SCOP 3.5).
3. **PV:** yes/no classifier; size from a Huber regressor with monotonic constraints (more demand or an EV never shrinks the PV); P10–P90 range; snapped to whole 450 W modules.
4. **Battery:** yes/no + size class, both seeing the planned PV; probabilities restricted to the installer's catalogue.
5. **Wallbox:** small classifier on EV features (most wallbox buyers have no EV recorded).
6. **Locks:** any component the planner fixes is kept, and the later steps adapt to it.
7. **Reasons:** per-decision SHAP contributions (LightGBM `pred_contrib`) turned into sentences.

## Results (held-out 20 %, 323 projects never seen in training, split by customer; interim labels)
| metric | model | band median | kWp = kWh/1000 |
|---|---|---|---|
| PV kWp MAE, end to end | 3.33 | **2.93** | 5.29 |
| PV kWp MAE, where both have PV | **2.70** | 2.93 | 5.22 |
| PV inside the variant range ± 1 kWp | **40 %** | 28 % | 11 % |
| battery kWh MAE, where both have one | **2.84** | 3.08 | 3.07 |
| battery within one catalogue step | **53 %** | 51 % | 42 % |
| battery inside the variant range ± 1 step | **54 %** | 50 % | 41 % |
| PV yes/no accuracy | **89 %** | 81 % | 81 % |
| battery yes/no accuracy | 89 % | 89 % | 89 % |
| wallbox yes/no accuracy | **73 %** | 72 % | 72 % |
| heat pump yes/no accuracy | 99 % | 99 % | 99 % |

Installer transfer (train on one, test on the other), PV MAE where both have PV: 2.97 vs 3.06 (23c108b7->2a8ba8e2) and 2.88 vs 3.53 (2a8ba8e2->23c108b7) for model vs band median.

## Known limitations (be honest in the pitch)
- **Labels are interim** (my parser) until engine/labels lands; PV for installer 2a8ba8e2 is panel count × an assumed 450 W.
- **PV size is barely predictable beyond consumption bands** (CV: 2.60 vs 2.69 kWp). The data has no roof size/orientation, which probably drives the expert choice.
- **End-to-end PV MAE loses to the baseline**: a few percent of test projects are wrongly predicted "no PV" (battery-only retrofits are hard to tell apart).
- **Wallbox ≈ coin flip** without EV information. **Heat pump** is offered (not chosen) for gas/oil homes; experts added one in 11 of 24 cases.
- **Time trend:** new projects use a date capped at the 90th percentile of training dates (~Mar 2026), because the last month is an unusual batch of battery-only retrofits.
- **Economics use placeholder prices.**

## API additions vs docs/api.md v0 (all optional, nothing removed)
`economics` block; `options.heatpump` (with/without comparison); `heatpump.option`; `physics.flags/assumptions/load_kwh/...`; `battery.alternatives`; `installer` and
`offer_date`/`orientation_deg`/`tilt_deg`/`existing_wallbox` as optional request fields; `/installers`, `/health`.
`/refine` returns `{changes, summary, parsed_by, home, locks, design}`.

## Deploy
The engine needs the Reonic data (or at least the trained artifacts), which are **never on GitHub**.
So a host that builds straight from the GitHub repo will not work out of the box. Options:
1. **Docker image built locally, pushed to a PRIVATE registry/host** (Fly.io, Railway, Render with a private image):
   `docker build -f engine/Dockerfile -t reonic-engine .` from the repo root. The image contains data/ and the model;
   set `ANTHROPIC_API_KEY` and `ENGINE_CORS_ORIGINS=https://<web>.vercel.app` as host secrets.
2. **Demo from this laptop through a tunnel** (`cloudflared tunnel --url http://localhost:8000`): no data leaves the
   machine, but the laptop must stay on.
Then set `NEXT_PUBLIC_ENGINE_URL` in the web app (Vercel) to the engine URL.
