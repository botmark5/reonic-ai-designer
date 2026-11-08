# Reonic AI Designer (thinc! Hack Munich 2026)

An AI design engine that turns a few facts about a home into a complete energy-system design, the way an experienced
installer's planner would: PV size, battery yes/no + size, wallbox yes/no, and a heat pump as an option. It learned from the
real projects of two installers with different catalogues. Every size comes with a plain-language reason, a range and similar
past homes. The planner can change or lock any component and the rest of the design adapts. The homeowner gets the offer
explained in plain words, and a voice agent can take the first call.

- `engine/`: Python data pipeline, expert labels, model, physics, evaluation, FastAPI.
- `web/`: Next.js app with the planner, the reality check (`/reality`), the homeowner offer and the voice intake.
- `docs/`: plan and decisions, API contract, data notes, pitch facts, demo runbook.

## Setup
- **Engine:** [`engine/README.md`](engine/README.md). It covers the venv, `pip install -r engine/requirements.txt`, the tests,
  downloading the expert labels and the locked test set from the private `data-v1` release, `python -m engine.train` and
  `uvicorn engine.api:app`.
- **Web app:** [`web/README.md`](web/README.md): `npm install`, `npm run dev`. Environment variables are listed in
  [`docs/deploy.md`](docs/deploy.md); keys go in `.env.local`, never in git.
- **Data:** the raw Reonic data lives in `data/raw/` and is **never committed** (Reonic asked us not to share it). Everything
  derived from it (`engine/artifacts/`) is git-ignored too.

## Approach
1. **Expert labels** ([`engine/labels.py`](engine/labels.py), rules in [`docs/labels-rules.md`](docs/labels-rules.md)):
   1,994 offer options from 1,593 projects, parsed from the offer line items into one design each (PV kWp, battery kWh, wallbox,
   heat pump, offer type: new system / battery retrofit / wallbox only). The units of shifted raw columns are fixed, and 20 random
   projects were checked by hand against their raw offer lines.
2. **Chained model** ([`engine/model.py`](engine/model.py)): heat pump rule (physics) → total demand including EV and heat pump →
   PV yes/no + size (LightGBM, monotone in demand, snapped to the installer's packages) → battery yes/no + catalogue size (it sees
   the planned PV) → wallbox. A planner lock fixes any step and the later steps follow. "No battery" and "no new solar" are
   possible outputs.
3. **Physics and economics** ([`engine/physics.py`](engine/physics.py)): an hourly synthetic year gives yield, self-consumption,
   autarky, payback and plausibility flags.
4. **Who decides sizes:** the engine only. Claude turns planner text into input changes and writes the explanations; it never
   picks a size.

## How we measured
- **315 held-out homes, never trained on.** The test set is locked in `test_ids.json`: grouped by customer, stratified by
  installer, seed 42. Model choices were made by cross-validation on the training part; the locked set was re-scored after each
  shipped improvement ([`engine/RESULTS.md`](engine/RESULTS.md), "Before/after per improvement").
- **Compared with the best of 3 rules of thumb for each metric:** kWh ÷ 1,000, the installer's median per consumption band, and
  the installer's kWp per MWh.
- **Installer transfer:** trained on one installer, tested on the other, in both directions.
- The shipped model is trained on 1,563 projects. The two houses on `/reality` ("One past home") show that shipped model, so they
  are a picture of how it designs, not a test. Only the numbers below the houses are held-out.

## Results (315 held-out homes, live `GET /eval`)
Every number below, with its source and how to say it, is in [`docs/pitch-facts.md`](docs/pitch-facts.md).

| | engine | best rule of thumb |
|---|---|---|
| Whole-project solar error, all homes (an unwanted or missing system counts) | **2.93 kWp** | 3.85 kWp (24 % lower) |
| Solar error, new systems (253 homes, as on /reality) | 2.45 kWp | 2.64 kWp (slightly better; small margin) |
| Solar yes/no right, all homes | **88 %** | 82 % |
| Add-on sales (62 homes): proposes no new solar where none was sold, without being told there is solar on the roof | **77 %** | 6 % |
| Battery size where both chose one | 2.42 kWh | 2.71 kWh |
| Battery within one catalogue size, new systems | 53 % | 46 % |
| Expert PV inside the engine's P10–P90 range, new full systems (target 80 %) | 82 % | – |
| Expert PV within 1.5 kWp of one of the engine's 3 options, new systems | 66 % | – |
| Installer transfer and per-installer tests where the engine beats the best rule | 4 of 4 | – |

One full design takes 0.27–0.64 s from the laptop to the live engine. In the measured demo flow it is 29 s of machine time from
"Play demo call" to the homeowner link, 24.5 s of which is the scripted call itself; the planner's own review time comes on top.

## Known limits
- **Exact PV size:** within ±1.5 kWp the engine is right for 40 % of homes against 43 % for the band median. The gains are the
  yes/no decisions, the add-on sales and the ranges. Every learner we tried landed between 2.42 and 2.57 kWp of error: without
  roof data, PV size is barely more predictable from these inputs.
- **Below the rule:** battery yes/no over all homes (88 vs 90 %) and wallbox yes/no (72 vs 73 %). A new system almost always
  gets a battery, and without EV information the wallbox is close to a coin flip.
- **"Solar already on the roof?"** The data records existing solar for only 5 % of battery-only add-on homes, so the planner and
  the voice agent ask it. Numbers with that answer are a what-if, never an accuracy.
- **Heat pump:** offered as a customer option for gas and oil homes, never chosen by the engine; experts added one in 11 of 24
  candidate homes.
- **Economics** use placeholder prices (`engine/config/economics.toml`), so payback and savings are not facts.
- Time saved per offer and win-rate uplift were not measured: every project in the data is a signed deal.

More detail: [`engine/README.md`](engine/README.md) (results tables and caveats) and [`engine/RESULTS.md`](engine/RESULTS.md)
(before/after per improvement, error analysis).

## Demo and pitch
- [`docs/user-guide.md`](docs/user-guide.md): using the website, screen by screen (planner, live call, reality check, homeowner offer).
- [`docs/demo-runbook.md`](docs/demo-runbook.md): the 5-minute click path, the hero moments and the fallbacks.
- [`docs/pitch-deck.md`](docs/pitch-deck.md): the deck plan, slide by slide, with the script.
- [`docs/pitch-facts.md`](docs/pitch-facts.md): every number the pitch, deck or README may use, plus what not to say.
- [`docs/PLAN.md`](docs/PLAN.md): plan, status and decisions · [`docs/api.md`](docs/api.md): engine ↔ web contract.
