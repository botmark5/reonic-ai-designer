# Requirements check against the Reonic brief (8 Nov 2026, 04:40 Munich time)

Every requirement of `docs/reonic-brief.pdf`, where it is met, and the evidence. Status: **done** = works on main and on
production; **PR** = built tonight, waiting for the orchestrator to merge; **human** = needs Mark; **not done**.

## Minimum result (brief p. 2 and p. 7)
| requirement | status | evidence |
|---|---|---|
| Complete design for a project: PV, battery, heat pump **as appropriate**, with a short explanation of why | done | `POST /design` (engine/api.py); chain in `engine/model.py` `propose`; heat pump as a customer option with both variants (`options.heatpump`); "no new PV" and "no battery" are real outputs for add-on orders and planner locks; reasons per component; planner cards on `/` |
| "No battery" / "no heat pump" possible (p. 4 "As appropriate matters") | done, documented | retrofit / wallbox-only / other offer types, locks `battery_kwh = 0`, heat pump never included by default. For new systems the engine always proposes a battery because 96 % of experts do; the 4 % no-battery expert choice has no visible pattern (`engine/RESULTS.md`, "Physics flags calibrated on expert practice") |
| Measure how close designs come to the expert designs on unseen projects | done | 315 held-out homes split by customer (`engine/artifacts/test_ids.json`, never committed); `GET /eval`; `engine/RESULTS.md`; `/reality` screen; three rules-of-thumb baselines; installer A→B transfer |
| Planner changes an input or component and gets an updated design | done | locks (any component), refine box in plain words (Claude → structured input changes → engine), roof cap; verified on production (runbook table) |

## Stretch goals (p. 7)
| requirement | status | evidence |
|---|---|---|
| Analysis of where and why designs deviate from the experts | done | `engine/error_analysis.py`, `RESULTS.md` error analysis by installer / offer type / band / default flag; `/reality` "Where we differ from the experts" panel (PR #81) |
| Alternatives and confidence for every recommendation | done + PR | confidence per component; calibrated P10–P90 PV range; `pv.alternatives` and `battery.alternatives` = one smaller and one larger catalogue size with shares (PR #82); heat pump with/without; top-3 metric 70 % |
| Validation view for planners | done | every card: percentile among 40 similar homes + physics flags, also for planner-locked values ("Set by planner · Unusual"); `POST /validate`; thresholds calibrated on expert practice (PR #82) |
| View in which homeowners explore their offer, on the same engine | done | `/offer/<token>`: 3D house, variants the installer allows (checked server-side), plain-language explanation, "Listen to your offer" (ElevenLabs) |

## Ideas to explore (p. 6), where we have an answer
| question | answer | where |
|---|---|---|
| What do expert decisions have in common? Thresholds, bundles? | ~2 kWp per MWh; battery sized by PV (≈1 kWh/kWp), not by consumption; 96 % of new systems get a battery; small homes get 6 kWp + battery; experts do not size for maximum return | `RESULTS.md` round 2, calibration table; deck slide 8 |
| Combine learning with physical/economic reasoning | physics layer (PVGIS yield, hourly year) for yield/autarky/economics and plausibility flags; the economic optimum was tested as a predictor and lost (2.77 vs 2.49 kWp) | `engine/physics.py`, `RESULTS.md` |
| Minimum input, missing information | installer + yearly consumption reach the band-median rule; defaults + `physics.assumptions` list every assumption; the "left at 4,500 kWh" flag is modelled | `engine/README.md` Known limitations (input ablation) |
| Communicate confidence, alternatives, trade-offs | confidence, range, alternatives, with/without heat pump economics, "Offline estimate" badge | planner cards, `/design` |
| What does refinement feel like | plain words (refine box), locks, chips for alternatives and range ends, roof cap input | planner |
| Validation view "battery unusually large" | "Larger than 99 % of similar homes (x–y kWh is usual)" on the card | `/validate`, `system-card.tsx` |
| What can a homeowner change | variants allowed by the installer only; the home's data stays fixed | `/offer`, `web/src/lib/offer.ts` |

## Demo moment (p. 7) and submission (p. 8)
| item | status | note |
|---|---|---|
| Home described → complete system + why → refined ("EV next year") → checked against reality on many projects | done | `docs/demo-runbook.md` click path, verified on production at 02:50 |
| Working demo end to end | done | Vercel + Railway; `/api/engine/health` reports the engine; passcode gate |
| Short recording as a fallback | human | Mark records after the 11:00 freeze (shot list in the runbook) |
| Code as a GitHub link + README on setup, approach, known limitations | done, human | root `README.md`, `engine/README.md`; repo is private: judges must be invited (ask the organisers at 08:00) |
| Short pitch deck: problem, solution, evaluation, value | draft | `docs/pitch-deck.md` plan + the Claude Slides draft linked there; Mark to export and finalise |
| Data used only for the hackathon, never shared | done | `data/raw/` and `engine/artifacts/` gitignored, never committed (git history checked in the audit) |

## Open items for the morning (owner: Mark unless noted)
1. Merge PR #82 (engine, night fixes) and PR #87 (web, what-if switch) with merge commits; then `railway up` in the synced
   `D:\thinc\railway_build` folder (about 3 minutes) and re-check the runbook numbers on production.
2. Invite the judges to the repository; ask the organisers for the submission channel.
3. Export the deck to PDF after the 11:00 freeze; rehearse twice.
4. Record the backup video on production (runbook shot list).
