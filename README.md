# Reonic AI Designer

thinc! Hack Munich 2026, Reonic case.

A few facts about a home go in. A complete energy-system design comes out: PV size, battery yes/no and size, wallbox yes/no, and a heat pump as a customer option. The engine decides the way this installer's planners decided on their own past offers. The planner can override every choice and always sees why.

**The flow:**
1. An AI voice agent takes the site-visit call.
2. A draft design lands in the planner's inbox.
3. The planner refines it in plain words ("they're buying an EV next year") or by locking any component.
4. A planner can compare the engine with the real expert design on homes it never saw.
5. The homeowner gets a link with a 3D view of their house and a spoken explanation.

## Architecture
```
voice call (ElevenLabs agent) ──► web (Next.js on Vercel) ──server-side, X-Engine-Key──► engine (FastAPI on Railway)
                                   │  planner · /live · /reality · /offer                  │  labels → model → physics → /eval
                                   └─► Supabase (calls, designs, shares)                   └─► Claude: text → input changes, facts → plain words
```
- **The engine decides every size.** It chains a model per component: heat-pump rule → PV → battery → wallbox. Every output snaps to sizes the installer actually sells.
- **Claude never picks a size.** It turns planner text into structured input changes and turns engine facts into explanations. Without an API key, a keyword parser and templates take over.
- **Physics** gives yield, self-consumption and autarky for each design, using PVGIS data for roof tilt and orientation.
- **The browser never talks to the engine.** Server routes add the key. When the engine is unreachable, the app shows a labelled "Offline estimate" instead of failing.
- More detail:
  - Engine: [engine/README.md](engine/README.md).
  - API contract: [docs/api.md](docs/api.md).
  - Deploy: [docs/deploy.md](docs/deploy.md).
  - Voice agent: [docs/voice-agent.md](docs/voice-agent.md).

## How we measured
- **Ground truth.** The expert designs were parsed from the line items of 1,994 offer options across 1,593 signed projects from two installers. 20 random projects were hand-checked. Rules and assumptions: [docs/data-notes.md](docs/data-notes.md), [docs/labels-rules.md](docs/labels-rules.md).
- **Test set.** 315 held-out homes, split by customer and never used for training or tuning. We also train on one installer and test on the other.
- **Comparison.** For every metric we compare against the best of three rules of thumb: kWh ÷ 1,000, the installer's median per consumption band, and the installer's kWp per MWh.

The table shows mean PV error per home in kWp (lower is better). "Answered" means the planner answered "Solar already on the roof?", which both the voice agent and the planner form ask first.

| | engine | best rule of thumb |
|---|---|---|
| New systems, answered (253 homes) | 2.50 | 2.62: on par, inside cross-validation noise |
| All homes, answered (315) | 2.19 | 3.77 |
| Add-on sales such as battery retrofits, answered (62) | 0.94 | 4.06 |
| All homes, without the answer | 2.94 | 3.77 |

Other results:
- Asking about existing solar cuts PV error by 25 %, and the offer type is right for 95 % of homes instead of 83 %.
- The expert's PV falls inside the engine's P10–P90 range for 79–81 % of new full systems, against a target of 80 %.
- On battery and wallbox yes/no, the engine is the same as the best rule for new systems. It is better once the planner answers the existing-solar question, and slightly below without the answer.

Every number, its source and how to phrase it: [docs/pitch-facts.md](docs/pitch-facts.md).
Before/after per improvement, everything we tried that did not help, and the error analysis: [engine/RESULTS.md](engine/RESULTS.md).

## Run it locally
**Web.** It runs without any keys: the engine falls back to the offline estimate and the store to an in-memory demo inbox.
```bash
cd web && npm ci && npm run dev        # http://localhost:3000
npm test                               # 158 tests
```

**Engine.** It needs Reonic's data in `data/raw/`, which is never committed, or the trained artifacts.
```bash
python -m venv .venv && .venv/bin/pip install -r engine/requirements.txt
.venv/bin/python -m engine.labels      # expert designs + catalogue
.venv/bin/python -m engine.train       # evaluation (= GET /eval) + shipped model
.venv/bin/uvicorn engine.api:app --port 8000
.venv/bin/python -m pytest -q          # 380 tests (17 need the data)
```
Then set `ENGINE_URL` (and `ENGINE_API_KEY` if the engine has one) in `web/.env.local`. All environment variables are listed in [docs/deploy.md](docs/deploy.md).

## Known limits
- **PV size has hit the ceiling of these inputs.** Every learner, hybrid and tuned variant we tried lands at 2.47–2.57 kWp error. kNN and sizing for the economic optimum did worse. The rest is roof size and customer wishes, which the data does not hold. Roof capacity from Google Solar is an optional input and caps the size.
- **The existing-solar answer matters most.** The data records existing solar for only 5 % of battery-only add-ons, so without the answer the engine has to guess whether a home needs a new system or an add-on.
- **Installer A's PV sizes assume 450 W per panel**, because their offers list only panel counts.
- **The wallbox is close to a coin flip** without EV information. The heat pump is offered for gas and oil homes, never imposed.
- **Economics use placeholder prices.** Payback and savings are illustrations, not quotes.
- **Two installers only.** Transfer to a new installer works in our test, but it rests on one pair.

## Repo
| folder | what |
|---|---|
| [`engine/`](engine/) | Python: expert labels, model, physics, evaluation, FastAPI |
| [`web/`](web/) | Next.js app: planner, live call screen, reality check, homeowner offer, 3D house, voice endpoints |
| [`supabase/`](supabase/) | schema and migrations |
| [`docs/`](docs/) | plan and decisions ([PLAN.md](docs/PLAN.md)), data notes, API contract, pitch facts, [demo runbook](docs/demo-runbook.md) |

Raw data is never committed, at Reonic's request.
