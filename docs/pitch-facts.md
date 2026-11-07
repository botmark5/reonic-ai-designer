# Pitch facts

Every number the pitch, deck or README may use, with where it comes from and how to say it.
Checked on 2026-11-08 at 00:20 against the live engine's `GET /eval`: every metric matched the shipped model.

**How to read this**
- **Safe** means say it as written.
- **Caveat** means say it only together with the caveat in the same row.
- **Don't** means leave it out of the pitch.
- "Answered" means the planner answered "Solar already on the roof?". In the evaluation that answer is taken from the expert's offer type, so it assumes the planner answers correctly. That is the product flow: the voice agent and the planner form both ask it first.
- Lower is better for errors (MAE = mean absolute error per home). Higher is better for percentages.

Sources:
- `/eval` means `GET /eval` on the live engine, the same JSON as `engine/artifacts/eval_results.json`. Paths below start at its root, and `dm` stands for `design_model`.
- `RESULTS.md` means `engine/RESULTS.md`. Its column E is the shipped model.
- `aggregates.json` means `docs/deck/out/aggregates.json`, written by `docs/deck/charts.py`. It is also on the data-v1 release.

## 1. How we measured
| fact | number | source | say it |
|---|---|---|---|
| Held-out test set, never used for training or tuning | 315 homes | `/eval` `protocol.n_test` | Safe |
| Split | grouped by customer (41 customers have 2 projects), stratified by installer, seed 42 | `/eval` `protocol` | Safe |
| Installers in the data | 2: A (248 test homes) and B (67 test homes) | `/eval` `by_installer` | Safe. Say "Installer A / B", never the ids. |
| Shipped model is trained on | 1,563 projects | live `GET /health` `trained_on_projects` | Safe |
| Expert designs parsed from offer line items | 1,994 offer options from 1,593 projects | `docs/data-notes.md` | Safe |
| Hand check of the parsed expert designs | 20 random projects, every size correct | `engine/spotcheck.py` (PR #7) | Safe |
| Comparison | the **best** of 3 rules of thumb for each metric: kWh ÷ 1,000, installer median per consumption band, installer kWp per MWh | `/eval` `baselines` | Safe. Always say "best rule of thumb", not "a baseline". |
| Installer A's PV size rests on an assumed 450 W per panel | median design 9.0 kWp; 8.6 at 430 W, 9.5 at 475 W | `docs/engine-spec.md` §3 | Caveat: only if asked about label quality. |

## 2. Headline: PV size
| fact | engine | best rule | source | say it |
|---|---|---|---|---|
| **New systems, answered** (253 homes) | **2.50 kWp** | 2.62 (band median) | `/eval` `with_existing_pv_answer.segments.full_designs.{dm,baseline_band_median}.pv_kwp_mae_all_projects`. RESULTS.md shows 2.49 because it rounds 2.4996. | Caveat: "on par with the best rule, slightly better". The 5 % gap is inside the cross-validation noise of ±0.18 kWp (RESULTS.md, round 2). |
| All 315 homes, answered | **2.19 kWp** | 3.77 (band median) | `/eval` `with_existing_pv_answer.metrics.*.pv_kwp_mae_all_projects` | Safe, with "when the planner answers the solar question". 42 % lower. |
| All 315 homes, not answered | **2.94 kWp** | 3.77 (band median) | `/eval` `metrics.*.pv_kwp_mae_all_projects` | Safe. 22 % lower. |
| Add-on sales, answered (62 homes: battery retrofits, wallbox-only, PV extensions) | **0.94 kWp** | 4.06 (kWh ÷ 1,000) | `/eval` `with_existing_pv_answer.segments.add_ons.*` | Safe, with "small group, 62 homes". 4× lower: rules of thumb always propose new PV. |
| New systems with real consumption, answered (205 homes) | **2.38 kWp** | 2.49 (band median) | `/eval` `with_existing_pv_answer.segments.full_designs_known_consumption.*` | Caveat: same as the first row, the gap is within noise. |
| PV size where both chose PV, all homes, not answered | 2.48 kWp | 2.64 | `/eval` `metrics.*.pv_kwp_mae_when_both_pv` | Safe |
| PV within ±1.5 kWp, answered | 44 % | 43 % | `/eval` `with_existing_pv_answer.metrics.*.pv_kwp_within_1.5_pct` | Caveat: level. Not answered it is 40 % vs 43 %, so below the rule. |
| Exact PV package match | 9 % | 9 % | RESULTS.md, "PV exact match" | Don't |

## 3. The one question: "Solar already on the roof?"
| fact | before | after | source | say it |
|---|---|---|---|---|
| PV error, all 315 homes | 2.94 kWp | **2.19 kWp** (−25 %) | `/eval` `metrics` vs `with_existing_pv_answer.metrics`, `dm.pv_kwp_mae_all_projects`; deck chart 3 | Caveat: the "after" assumes a correct answer. |
| PV error, new systems | 3.14 kWp | 2.50 kWp | same, `segments.full_designs` | Caveat: as above |
| PV error, add-on sales | 2.15 kWp | 0.94 kWp | same, `segments.add_ons` | Caveat: as above |
| Offer type right (new system / battery retrofit / wallbox only / other) | 83 % | **95 %** | `/eval` `dm.offer_type_accuracy` | Caveat: as above |
| PV yes/no right | 88 % | 97 % | `/eval` `dm.has_pv_accuracy` | Caveat: as above |
| Why it matters | the data records existing solar for only 5 % of the homes that got a battery-only add-on | `engine/README.md` | Safe |

## 4. Inside the expert's own options (variant range)
Expert range means the smallest to largest PV across the variants the expert offered, ±1 kWp. A single offer is its own range.

| fact | engine | best rule | source | say it |
|---|---|---|---|---|
| All 315 homes, answered | **48 %** | 30 % | `/eval` `with_existing_pv_answer.metrics.*.pv_variant_hit_tolerant_pct` | Caveat: add-on sales drive most of the gap. |
| New systems, answered | 38 % | 37 % | `…segments.full_designs.*` | Safe as "level". Say it before a judge asks. |
| Add-on sales, answered | 87 % | 3 % | `…segments.add_ons.*` | Safe, with "62 homes". |

## 5. Battery, wallbox, heat pump
| fact | engine | best rule | source | say it |
|---|---|---|---|---|
| Battery size, both chose a battery, all homes, answered | **2.35 kWh** | 2.71 | `/eval` `with_existing_pv_answer.metrics.*.battery_kwh_mae_when_both_battery` | Safe |
| Battery size, new systems, answered | 2.61 kWh | 2.64 (installer's most common size) | `…segments.full_designs.*` | Caveat: level. RESULTS.md compares with the band median (2.97), but the strongest rule here is the installer's most common size. |
| Battery within one catalogue size, new systems, answered | **54 %** | 46 % | `…segments.full_designs.*.battery_within_one_step_pct` | Safe |
| Battery yes/no, new systems | 95 % | 95 % | `…segments.full_designs.*.has_battery_accuracy` | Caveat: level. Not answered, over all homes, it is 88 % vs 90 %, below the rule. |
| Wallbox yes/no, all homes, answered | 75 % | 73 % | `…metrics.*.has_wallbox_accuracy` | Caveat: close to level. Without EV information it is near a coin flip, and most wallbox buyers have no EV recorded. Not answered it is 72 % vs 73 %, below the rule. |
| Heat pump yes/no | 99 % | 99 % | `/eval` `dm.has_heatpump_accuracy` | Don't: almost no home in the data gets one. |
| Heat pump in the product | offered as a customer option for gas and oil homes, never chosen by the engine. Size = heat demand ÷ 2,450 full-load hours, snapped to the catalogue. | `engine/README.md` §How a design is made | Safe |
| Experts added a heat pump when it was a candidate | 11 of 24 homes | `engine/README.md` §Known limitations | Safe |

## 6. Trust: ranges, installers, consumption
| fact | number | source | say it |
|---|---|---|---|
| Expert PV falls inside the engine's P10–P90 range, all homes | **80 %** (target 80 %); best rule 9 % | RESULTS.md, "P10–P90 contains expert PV", column E. Not in `/eval` yet: issue #43. | Safe. The /reality tile may stay empty until #43 is done. |
| Same, new systems answered | 79 % | RESULTS.md, full designs (answered), column E | Safe |
| Trained on installer B only, tested on installer A (PV size where both chose PV, not answered) | 2.91 vs 3.00 kWp best rule | `/eval` `transfer["23c108b7->2a8ba8e2"].*.pv_kwp_mae_when_both_pv` | Caveat: small margin, tested on all of A's projects. |
| Trained on A only, tested on B | 2.79 vs 3.15 kWp | `/eval` `transfer["2a8ba8e2->23c108b7"].*` | Same caveat |
| Engine beats the best rule in held-out and transfer tests per installer | 4 of 4 | `aggregates.json` `pv_mae_installer_transfer`; deck chart 2b | Safe |
| PV size error by yearly consumption (both chose PV, answered) | 2.1–2.6 kWp up to 9 MWh; 3.4 kWp above 9 MWh (15 homes) | `aggregates.json` `bands`; deck chart 2a | Safe |
| Homes left at the 4,500 kWh default ("consumption not entered") | 98 of 315; PV size error 2.71 kWp | `aggregates.json` `bands[unknown]` | Safe |

## 7. What the data can and cannot explain
| fact | number | source | say it |
|---|---|---|---|
| Every method tried for PV size lands in a narrow band | 2.47–2.57 kWp (5-fold CV by customer, new systems, 1,046 homes) | RESULTS.md, round 2 | Safe: "we hit the ceiling of what these inputs explain; the rest is roof and customer wishes". |
| Experts do not size for maximum return | sizing for the economic optimum gives 2.77 kWp error vs 2.49 for the engine | RESULTS.md, round 2 | Safe |
| Installers size the battery by PV size, not by consumption | engine rule 2.25 kWh, "1 kWh per kWp" 2.54, "1 kWh per 1,000 kWh" 4.46 (CV) | RESULTS.md, round 2, battery table | Safe |
| Installers size PV at about 2 kWp per MWh | median 1.9 (A) and 2.2 (B) kWp per MWh; "kWh ÷ 1,000" undersizes by about half | `docs/engine-spec.md` §3 | Safe |
| Biggest lever is new inputs, not algorithms | roof capacity from Google Solar (used as a cap), the existing-solar question | RESULTS.md, conclusion | Safe |

## 8. Speed and build quality
| fact | number | source | say it |
|---|---|---|---|
| One full design from the engine | 0.27–0.49 s (10 calls, laptop to the live engine) | measured 2026-11-08 00:20 | Safe: "under half a second". |
| Voice call to draft design on production | 207 ms engine time | d-voice smoke test, 2026-11-08 00:13 | Safe |
| Engine health check | 0.15–0.16 s (5 calls, laptop to the live engine) | measured 2026-11-08 00:20 | Safe |
| Engine tests | 379 pytest (362 run without the raw data, 17 need it; all 379 pass with it) | `pytest`, main 201ead9 | Safe |
| Web tests | 157 vitest in 19 files | `npm test` in `web/`, main 201ead9 | Safe |
| Who decides sizes | the engine only. Claude turns planner text into input changes and writes explanations. | `CLAUDE.md`, `engine/README.md` | Safe |

## Don't say
- **"X % accurate"** without saying which metric and which comparison.
- **Time saved per offer, or win-rate uplift.** Neither was measured. Every project in the data is a signed deal, so there are no lost offers to learn from. Say "a reviewed draft in seconds instead of a design from scratch" and leave the minutes to Reonic.
- **Payback years and savings as facts.** The economics use placeholder prices (`engine/config/economics.toml`).
- **"Beats the experts"** or **"matches the experts"** for new systems. Say "on par with the best rule of thumb, and it explains itself, takes the planner's changes and handles add-on sales".
- **Project ids, installer ids, customer names, or any number from a single real project.** Reonic data stays private.
