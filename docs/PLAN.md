# Plan & status (mirror of the shared Claude doc "Reonic Hack — Plan & Tracker")
Agents: tick tasks here when done (`- [x]`) and commit. Add blockers as "BLOCKED: …" under the task.
Gates: 19:00 checkpoint · 23:00 MINIMUM DONE · Sun 11:00 freeze · Sun 13:30 submit.

## Phase 0 — Setup
- [x] Mark: private repo + invite Cala; push starter kit
- [x] Cala: clone, copy data into data/raw, Python env, CSVs load
- [ ] Mark: web/ Next.js + Tailwind + shadcn + Framer Motion on Vercel
  - app builds and runs locally; NOT on Vercel yet (needs Mark's Vercel account + a stable engine URL)
- [ ] Both: confirm docs/api.md v0

## Phase 1 — Data and expert designs (Cala + Mark pair)
- [x] Profile every column of both installers (fill rate, values, outliers) → docs/data-notes.md
- [x] Expert design per project: PV kWp, battery kWh, wallbox, heat pump, inverter kW; all variants kept
- [x] Extra features: roof type, scaffolding, brand, installer, date, retrofit flags
- [x] Edge cases decided and written down
- [x] Per-installer catalogue of real sizes
- [x] engine/artifacts/expert_designs.parquet + 20 random projects spot-checked by hand

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
  - Sat 19:15: reachable only via a cloudflared QUICK tunnel (URL changes on restart; was 502 at 19:16). Vercel needs a stable URL

## Phase 3 — Product (Mark)
- [x] Design system + mockups (Claude chat) → tokens into web/
- [x] Planner screen (inputs → design cards → locks/overrides) (PR #12, incl. 'Solar already on the roof?')
- [x] Refine box + streamed explanation (PR #13: Claude agent with tools; engine computes all sizes)
- [x] Reality-check screen (ours vs expert + /eval charts) (PR #23: held-out demo cases + random from locked test set, verdicts with engine tolerances, /eval tiles, A→B transfer)
- [x] Supabase: saved_designs, overrides, homeowner share link (PR #12, #21; calls private: PR #20 migration 20261107_calls_private.sql)
- [ ] Live on the real engine, deployed
  - live on the real engine locally (served: engine, ~0.3 s, offline fallback verified); not deployed

## Phase 4 — Stretch
- [x] Homeowner view (variants only, savings/payback/autarky in plain words) (PR #21: /offer/[token], allowed variants checked server-side, House3D, Listen to your offer)
- [x] Interactive 3D house `<House3D>` (web/src/components/house3d): panels from kWp, battery/inverter/wallbox/heat pump, energy flows, presets, tooltips, still-image fallback
  - mounted in the planner and /offer/[token] (PR #21)
- [x] Live-call big screen /live (PR #18): server-polled calls, facts checklist, live draft; scripted "Play demo call" sends the draft to the inbox
- [x] ElevenLabs "Explain my offer" voice + voice agent calling /design (backend: web/voice — create_design tool, post-call webhook, /api/solar, /api/voice/explain; audio off until the voice is confirmed)
- [ ] Validation screen
- [ ] Confidence calibration, A→B findings for the deck, fix worst 3 edge cases

## Phase 5 — Pitch and submission
- [ ] Business case · deck · metric charts · README · backup video · rehearse ×2 · submit by 13:30

## Decisions
- Sat 20:30 · Web: engine called only from server routes (key never in the browser); offline estimate after 4 s (design) or on any engine error, 15 s cooldown, "Offline estimate" badge
- Sat 20:30 · Web: refine agent = claude-sonnet-5-5 tool loop; a lock is accepted only at a value the planner wrote or the engine offered (alternatives, range ends, heat pump option); all sizes from run_design
- Sat 20:30 · Web: calls are server-only (names/addresses/transcripts); /live polls GET /api/calls every 2 s; realtime only on designs
- Sat 20:30 · Web: held-out ids for /reality read server-side from the gitignored engine/artifacts (or HELDOUT_PROJECT_IDS env); never committed
- Sat 20:15 · PV snaps to the installer's standard packages (sold >= 10x, within 1 kWp) else 450 W modules; battery cut-off learned out-of-fold (CV on training only)
- Sat 19:25 · Demo set = 5 HELD-OUT projects (locked test_ids.json) picked by fixed rules in engine/demo_set.py: typical PV+battery (closest to median), EV+wallbox, gas home with an expert heat pump (only 1 held out), battery retrofit, widest PV spread across full-design variants; output engine/artifacts/demo_projects.json (not committed, shared via data-v1)
- Sat 19:20 · 3D house is procedural three.js (Blender not installed); session B mounts `<House3D>`; roof from home.tilt_deg/orientation_deg, overridable by Google Solar via the `roof` prop
- Sat 19:15 · Orchestrator session coordinates the 4 Claude Code sessions via .status/ (local); merges green PRs, keeps this file honest
- Sat 20:10 · Engine trains on engine/labels expert_designs.parquet with its cleaned home columns (default 4,500 kWh kept WITH its flag; < 1,500 kWh invalid)
- Sat 20:10 · Test set locked in engine/artifacts/test_ids.json (grouped by customer, seed 42); all tuning by CV on the training part
- Sat 20:10 · Claims only against the BEST baseline per metric (kWh/1000, band median, installer kWp/MWh); results reported for all projects, full designs, real consumption
- Sat 19:40 · Offer type is its own decision (new PV / battery retrofit / wallbox only / other); optional planner input 'Is there already PV on the roof?' (biggest single error source)
- Sat 19:00 · Heat pump is a customer OPTION (offered for gas/oil homes, not included by default); /design returns the full design with and without it so the customer can choose by budget/needs
- Sat 18:40 · Model trains on interim labels (engine/interim_labels.py) until engine/labels lands; swap is automatic
- Sat 18:40 · PV size model: Huber loss + monotonic constraints (more demand / EV never shrinks PV); PV snapped to 450 W modules
- Sat 18:40 · New projects use an offer date capped at the 90th percentile of training dates (last month is an unusual retrofit batch)
- Sat 18:40 · Claude: Haiku 5.5 for /refine (structured output), Sonnet 5.5 for /explain (streamed, server-side refusal fallback); keyword/template fallback without key
- Sat 18:30 · Expert labels v1 (engine/labels): primary = lowest full new-system option; default 4,500 kWh = consumption unknown;
  2a8 panels at 450 W; battery from the (shifted) numeric column; retrofits kept with offer_type, main model on new_system only.
  Rules: docs/labels-rules.md · schema: docs/data-notes.md
- Sat 18:00 · Physics = hourly synthetic year with seeded sunny/cloudy days, calibrated to HTW-Berlin rule-of-thumb ranges (not official BDEW tables)
- Sat 18:00 · Variant-range hit = inside [min, max] of the project's options ± tolerance (PV ± 1 kWp, battery ± 1 catalogue step); strict number reported too
- Sat 18:00 · Label contract proposed in docs/data-notes.md (one row per project × option, is_primary flag); evaluate.py joins inputs from data/raw
- Sat 16:00 · Data questions answered by our own assumptions (docs/data-notes.md); only business questions to Reonic
- Sat 15:45 · Build in Claude Code (Next.js), not Lovable · design system + mockups in Claude chat first
- Sat 15:15 · Keep all raw fields; expert-design table is derived on top
