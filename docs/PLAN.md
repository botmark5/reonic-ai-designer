# Plan & status (mirror of the shared Claude doc "Reonic Hack — Plan & Tracker")
Agents: tick tasks here when done (`- [x]`) and commit. Add blockers as "BLOCKED: …" under the task.
Gates: 19:00 checkpoint · 23:00 MINIMUM DONE · Sun 11:00 freeze · Sun 13:30 submit.

## Phase 0 — Setup
- [ ] Mark: private repo + invite Cala; push starter kit
- [ ] Cala: clone, copy data into data/raw, Python env, CSVs load
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
- [ ] Baselines (kWp ≈ kWh/1000; median by consumption band)
- [ ] Chained model PV → battery → wallbox, installer-aware, snapped to catalogue
- [ ] Similar-homes lookup → ranges + 5 nearest real projects
- [ ] Locks: recompute around fixed components
- [ ] Physics check + heat pump rules
- [ ] Evaluation: held-out + installer A→B; variant-range hit rate; vs baselines
- [ ] Error analysis by segment/installer
- [ ] /validate
- [ ] FastAPI deployed, matches docs/api.md

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
- Sat 16:00 · Data questions answered by our own assumptions (docs/data-notes.md); only business questions to Reonic
- Sat 15:45 · Build in Claude Code (Next.js), not Lovable · design system + mockups in Claude chat first
- Sat 15:15 · Keep all raw fields; expert-design table is derived on top
