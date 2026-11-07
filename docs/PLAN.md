# Plan & status (mirror of the shared Claude doc "Reonic Hack — Plan & Tracker")
Agents: tick tasks here when done (`- [x]`) and commit. Add blockers as "BLOCKED: …" under the task.
Gates: 19:00 checkpoint · 23:00 MINIMUM DONE · Sun 11:00 freeze · Sun 13:30 submit.

## Phase 0 — Setup
- [ ] Mark: private repo + invite Cala; push starter kit
- [x] Cala: clone, copy data into data/raw, Python env, CSVs load
- [ ] Mark: web/ Next.js + Tailwind + shadcn + Framer Motion on Vercel
- [ ] Both: confirm docs/api.md v0

## Phase 1 — Data and expert designs (Cala + Mark pair)
- [ ] Profile every column of both installers (fill rate, values, outliers) → docs/data-notes.md
- [ ] Expert design per project: PV kWp, battery kWh, wallbox, heat pump, inverter kW; all variants kept
- [ ] Extra features: roof type, scaffolding, brand, installer, date, retrofit flags
- [ ] Edge cases decided and written down
- [ ] Per-installer catalogue of real sizes
- [ ] engine/artifacts/expert_designs.parquet + 20 random projects spot-checked by hand

## Phase 2 — Engine and evaluation (Cala)
- [ ] docs/engine-spec.md in plain English
- [x] Baselines (kWp ≈ kWh/1000; median by consumption band)
- [x] Chained model PV → battery → wallbox, installer-aware, snapped to catalogue
- [x] Similar-homes lookup → ranges + 5 nearest real projects
- [x] Locks: recompute around fixed components
- [x] Physics check + heat pump rules
- [x] Evaluation: held-out + installer A→B; variant-range hit rate; vs baselines
  - done on INTERIM labels (engine/interim_labels.py); rerun `python -m engine.train` once expert_designs.parquet lands
- [ ] Error analysis by segment/installer
- [x] /validate
- [ ] FastAPI deployed, matches docs/api.md
  - engine/api.py runs locally and matches api.md (+ optional additions, see engine/README.md); not deployed yet

## Phase 3 — Product (Mark)
- [ ] Design system + mockups (Claude chat) → tokens into web/
- [ ] Planner screen (inputs → design cards → locks/overrides)
- [ ] Refine box (Haiku) + streamed explanation (Sonnet)
- [ ] Reality-check screen (ours vs expert + /eval charts)
- [ ] Supabase: saved_designs, overrides, homeowner share link
- [ ] Live on the real engine, deployed

## Phase 4 — Stretch
- [ ] Homeowner view (variants only, savings/payback/autarky in plain words)
- [ ] ElevenLabs "Explain my offer" voice + voice agent calling /design
- [ ] Validation screen
- [ ] Confidence calibration, A→B findings for the deck, fix worst 3 edge cases

## Phase 5 — Pitch and submission
- [ ] Business case · deck · metric charts · README · backup video · rehearse ×2 · submit by 13:30

## Decisions
- Sat 18:40 · Model trains on interim labels (engine/interim_labels.py) until engine/labels lands; swap is automatic
- Sat 18:40 · PV size model: Huber loss + monotonic constraints (more demand / EV never shrinks PV); PV snapped to 450 W modules
- Sat 18:40 · New projects use an offer date capped at the 90th percentile of training dates (last month is an unusual retrofit batch)
- Sat 18:40 · Claude: Haiku 5.5 for /refine (structured output), Sonnet 5.5 for /explain (streamed, server-side refusal fallback); keyword/template fallback without key
- Sat 18:00 · Physics = hourly synthetic year with seeded sunny/cloudy days, calibrated to HTW-Berlin rule-of-thumb ranges (not official BDEW tables)
- Sat 18:00 · Variant-range hit = inside [min, max] of the project's options ± tolerance (PV ± 1 kWp, battery ± 1 catalogue step); strict number reported too
- Sat 18:00 · Label contract proposed in docs/data-notes.md (one row per project × option, is_primary flag); evaluate.py joins inputs from data/raw
- Sat 16:00 · Data questions answered by our own assumptions (docs/data-notes.md); only business questions to Reonic
- Sat 15:45 · Build in Claude Code (Next.js), not Lovable · design system + mockups in Claude chat first
- Sat 15:15 · Keep all raw fields; expert-design table is derived on top
