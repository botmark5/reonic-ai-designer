# Voice agent backend + Google Solar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ElevenLabs site-visit agent a backend: a `create_design` server tool that drafts a full design into the planner inbox within ~3 s, a signed post-call webhook that stores the transcript, a Google Solar roof lookup, and an "explain my offer" text + audio endpoint.

**Architecture:** Next.js App Router route handlers under `web/src/app/api/{voice,solar}/`, with all logic in two pure-ish libs (`web/src/lib/voice.ts`, `web/src/lib/solar.ts`) that are unit-tested with Vitest and mocked `fetch`. Until session B's milestone 1 lands, `voice.ts` carries clearly marked TEMP stand-ins for the shared types, engine client (mock + real) and Supabase server client; afterwards they are deleted and imports point at `web/src/lib/{types,engine,supabase}.ts`.

**Tech Stack:** Next.js 16.4 route handlers (Node runtime), TypeScript, `@supabase/supabase-js` (already a dependency), Vitest (new dev dependency), plain `fetch` for Google, Anthropic and ElevenLabs (no new SDKs, so no `package.json` clash with session B's Anthropic SDK).

**Spec:** `docs/prompts/session-d-voice.md`, `docs/voice-agent.md`, `docs/rosi-notes.md`, `docs/api.md`, `engine/api.py` (Home / Locks models).

## Global Constraints

- Own ONLY `web/src/app/api/{voice,solar}/` and `web/src/lib/{solar,voice}.ts` (+ their tests). Exceptions, flagged for B: `web/package.json`/`package-lock.json` (add `vitest` + `"test": "vitest run"`), `web/vitest.config.mts`, `docs/voice-agent.md`, a PLAN.md tick.
- The ENGINE decides sizes. No LLM output ever becomes a size. Claude is used only in `/api/voice/explain` to phrase engine facts.
- Never log secrets, tokens, signatures or full request headers. Log only field names, statuses and timings.
- Secrets only from env: `ELEVENLABS_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENGINE_URL`, `VOICE_INSTALLER` (default `2a8ba8e2`), `VOICE_TTS_ENABLED` (default off).
- create-design answers in ≤ 3 s wall clock, always with HTTP 200 and an `instruction` string (rosi-notes), even when engine, Solar or Supabase fail.
- No audio is generated until Mark confirms the voice: TTS only runs when `VOICE_TTS_ENABLED === "true"`.
- `null`/missing facts are never invented: unknowns stay `null` in `home`; every estimate is listed in `assumptions[]` and stored.

## Review Focus

1. **Agent sends strings for numbers / empty strings for unknowns** ("4500", "", "unknown", "about 120 euros") → parsed as numbers where possible, else `null`; never `NaN` sent to the engine. Test in Task 2.
2. **Neither annual_kwh nor monthly_bill_eur given** → estimate from household size, list it in `assumptions`, instruction still tells the caller the draft is ready. Test in Task 2.
3. **Engine slower than the budget or down** → calls row still written, instruction says the draft will appear shortly, design completed via `after()`. Test in Task 4.
4. **Post-call webhook for a conversation with no create_design call** (agent never called the tool) → calls row inserted from data-collection results, and a draft design created when `annual_kwh`/bill/household is present. Test in Task 5.
5. **Webhook replay / tampered body / stale timestamp** → 401, nothing stored. Test in Task 5.

---

### Task 1: Worktree harness + TEMP stand-ins (types, engine client, Supabase)

**Files:**
- Modify: `web/package.json` (devDependency `vitest@^3`, script `"test": "vitest run"`), `web/package-lock.json`
- Create: `web/vitest.config.mts` (alias `@` → `src`, environment `node`)
- Create: `web/src/lib/voice.ts` (stand-in section only in this task)
- Test: `web/src/lib/voice.test.ts`

**Interfaces — Produces (TEMP, mirror docs/api.md exactly; deleted in Task 7 when B's files exist):**
- `type Home`, `type Locks`, `type DesignResponse` (with `design.{pv,battery,wallbox,heatpump}` blocks as api.md, plus optional `options?.heatpump?.available`)
- `designHome(installer: string, home: Home, locks: Locks, opts?: { signal?: AbortSignal }): Promise<DesignResponse>` — POSTs `${ENGINE_URL}/design` when `ENGINE_URL` is set, else deterministic MOCK: `kwp = snap(annual_kwh/1000 + (has_ev ? (ev_km_year ?? 15000) * 0.2 / 1000 : 0), 0.45)`, battery = nearest of `[5,7,10,14]` to kwp (no battery if kwp < 4), wallbox = `has_ev`, heatpump `include:false, kw:null`, `model_version: "mock"`.
- `serverSupabase(): SupabaseClient | null` — service-role client, `null` when env is missing (callers skip DB writes and log `"supabase not configured"`).

- [ ] **Step 1:** Add vitest + config; `npm test` runs with zero tests → exit 0.
- [ ] **Step 2: Failing tests** `mock engine: 4500 kWh no EV → pv.kwp 4.5, battery 5, wallbox false, heatpump include false`; `mock engine: 4500 kWh + EV 15000 km → pv.kwp 7.65, wallbox true`; `designHome posts {installer, home, locks} to ENGINE_URL/design when set` (mocked fetch, asserts URL + JSON body); `serverSupabase returns null without env`.
- [ ] **Step 3:** Implement; tests pass. **Step 4:** Commit `web(voice): vitest harness and temporary engine/supabase stand-ins`.

### Task 2: Fact normalisation + spoken summary (pure functions)

**Files:** Modify `web/src/lib/voice.ts`; Test `web/src/lib/voice.test.ts`

**Interfaces — Produces:**
- `type VoiceFacts` = the tool body: `customer_name, address, annual_kwh, monthly_bill_eur, household, daytime_presence, has_ev, ev_km_year, heating, heating_age_years, roof_type, roof_direction, existing_pv_kwp, existing_battery_kwh, notes, wishes, conversation_id` — every field optional and `unknown`-typed on input.
- `normaliseFacts(raw: unknown): { facts: VoiceFactsClean; home: Home; assumptions: string[] }`
- `spokenSummary(d: DesignResponse): string`
- `toolInstruction(d: DesignResponse | null): { instruction: string }`

Pinned values:
- Price `0.35 €/kWh` (engine `economics.toml` default). Bill → kWh: `round(monthly_bill_eur * 12 / 0.35, -2)`; assumption text `"Annual use estimated from a €{bill}/month bill at 0.35 €/kWh"`.
- No kWh and no bill: household → kWh `{1:1500, 2:2500, 3:3500, 4:4250, 5+:5000}`; no household either → `annual_kwh: 4000` + assumption.
- Heating → engine vocab: `gas→"Gas", oil→"Oil", heatpump→"Heatpump", electric→"Electric", district→"District", wood→"Wood", other→"Other", unknown→null`.
- `roof_direction` → `orientation_deg`: `south 180, south_east 135, south_west 225, east 90, west 270, north 0`; `east_west`/`unknown` → `null` (+ note "east-west roof").
- `household` → `inhabitants`; `roof_type` passed through except `unknown → null`; `has_ev` accepts `true/"yes"/"true"`; numbers accept `"4500"`, `"4.500"`, `"about 120"` → 120; `""`, `"unknown"`, `null` → `null`.
- Summary copy (exact): PV + battery + wallbox + HP option → `"10.8 kWp solar, a 10 kWh battery and a wallbox; a heat pump is a later option."`; parts omitted when `include` is false; HP included → `"... and a 9 kW heat pump."`. Instruction: `"Tell the caller: Your draft design is ready: {summary} It is in the planner's inbox now."`; when design is `null`: `"Tell the caller: Thank you, I have all the details. The draft design will be in the planner's inbox in a minute."`

- [ ] **Step 1: Failing tests:** `bill 120 €/month → annual_kwh 4100 + assumption`; `"4.500" kWh → 4500`; `household 4, no use → 4250 + assumption`; `heating "gas" → "Gas"`; `roof_direction south_west → 225`; `east_west → null`; `"" and "unknown" → null, never NaN` (Review Focus 1, 2); `spokenSummary` for the 3 copy variants above; `toolInstruction(null)` copy.
- [ ] **Step 2:** Implement; pass. **Step 3:** Commit `web(voice): normalise call facts and phrase the spoken summary`.

### Task 3: Google Solar lookup + `GET /api/solar`

**Files:** Create `web/src/lib/solar.ts`, `web/src/app/api/solar/route.ts`; Test `web/src/lib/solar.test.ts`, `web/src/app/api/solar/route.test.ts`; Fixture `web/src/lib/__fixtures__/building-insights.json` (hand-written, trimmed shape of a real response).

**Interfaces — Produces:**
- `type SolarResult = { status: "ok"; lat; lng; segments: {pitch_deg; azimuth_deg; area_m2}[]; max_panels: number; panel_watts: number; sunshine_hours_year: number; imagery_quality: string } | { status: "not_covered" | "not_found" | "no_key" | "error"; reason: string; lat?: number; lng?: number }`
- `lookupSolar(address: string, opts?: { signal?: AbortSignal }): Promise<SolarResult>` — Geocoding `maps.googleapis.com/maps/api/geocode/json?address=…®ion=de`, then `solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=…&location.longitude=…&requiredQuality=LOW`. Maps `solarPotential.roofSegmentStats[].{pitchDegrees, azimuthDegrees, stats.areaMeters2}`, `maxArrayPanelsCount`, `panelCapacityWatts`, `maxSunshineHoursPerYear`, `imageryQuality`. Solar 404 → `not_covered`; geocode `ZERO_RESULTS` → `not_found`. In-memory `Map` cache keyed by lower-cased trimmed address, 24 h TTL, failures (except `no_key`) cached 10 min.
- `roofFromSolar(s: SolarResult): { orientation_deg: number; tilt_deg: number } | null` — largest segment by area.
- Route: `GET /api/solar?address=` → always 200 JSON `SolarResult`; 400 only when `address` is missing.

Rule: the caller's statement wins; Solar fills only `orientation_deg`/`tilt_deg` that are `null`, and the fill is listed in `assumptions`.

- [ ] **Step 1: Failing tests:** fixture → `status ok`, 3 segments, largest-segment azimuth/pitch; Solar 404 → `not_covered` (no throw); missing key → `no_key`; second call same address → fetch called once (cache); route without address → 400.
- [ ] **Step 2:** Implement; pass. **Step 3:** Commit `web(solar): Google Solar building lookup with cache`.

### Task 4: `POST /api/voice/create-design` (agent server tool)

**Files:** Create `web/src/app/api/voice/create-design/route.ts`; add `createDraftFromFacts` to `web/src/lib/voice.ts`; Test `web/src/app/api/voice/create-design/route.test.ts`

**Interfaces:**
- Consumes: `normaliseFacts`, `designHome`, `serverSupabase`, `lookupSolar`, `roofFromSolar`, `toolInstruction`.
- Produces: `checkAgentToken(header: string | null, secret: string | undefined): boolean` (constant-time, `false` when secret unset); `createDraftFromFacts(raw: unknown, opts: { budgetMs: number }): Promise<{ instruction: string; call_id: string | null; design_id: string | null; pending: boolean }>` (also used by Task 5).

Flow: auth (`x-agent-token`) → 401 `{instruction:"Tell the caller: I could not save the design right now, a planner will follow up."}` → normalise → Solar with 900 ms budget (skip on timeout) → engine with remaining budget (total 2500 ms) → insert `calls` (`status:'in_progress'`, customer_name, address, `facts` = clean facts + `conversation_id` + `assumptions` + solar) → insert `designs` (`call_id`, `source:'voice'`, `status:'draft'`, `home`, `locks:{}`, `design`, `explanation:null`) → `{ instruction, call_id, design_id }`. Engine timeout/error → response `toolInstruction(null)` and `after()` retries the engine once (10 s) and inserts the designs row. Idempotent per `conversation_id`: a second call updates the same calls row and adds a new design version.

- [ ] **Step 1: Failing tests:** wrong/missing token → 401; happy path (mock engine, fake Supabase recorder) → 200, instruction contains `"kWp solar"`, designs insert has `source 'voice'`, `status 'draft'`, `call_id`; engine hangs → response in < 2.8 s with the "in a minute" copy (Review Focus 3); Supabase missing → still 200 with summary.
- [ ] **Step 2:** Implement; pass. **Step 3:** Commit `web(voice): create_design server tool`.

### Task 5: `POST /api/voice/post-call` (signed webhook)

**Files:** Create `web/src/app/api/voice/post-call/route.ts`; add `verifyElevenLabsSignature` to `voice.ts`; Test `web/src/app/api/voice/post-call/route.test.ts`

**Interfaces — Produces:** `verifyElevenLabsSignature(rawBody: string, header: string | null, secret: string | undefined, nowSec: number): boolean` — header `ElevenLabs-Signature: t=<unix>,v0=<hex>`; expected = HMAC-SHA256(secret, `${t}.${rawBody}`) hex; reject if `|now - t| > 1800`; constant-time compare. Read `await req.text()` FIRST, verify, then `JSON.parse`.

Handling: `type === "post_call_transcription"` → by `data.conversation_id` (stored in `calls.facts->>conversation_id`) update `transcript` (`data.transcript`), `summary` (`data.analysis.transcript_summary`), merge `data.analysis.data_collection_results` (`{field: {value}}` → values) + `evaluation_criteria_results` into `facts`, `status:'done'`. No row → insert one; then if no design exists for it and use/bill/household is known → `createDraftFromFacts` (Review Focus 4). Other types → 200 `{ignored:true}`.

- [ ] **Step 1: Failing tests:** valid signature → 200 + update recorded with transcript and summary; tampered body → 401, nothing written; timestamp 31 min old → 401 (Review Focus 5); no prior row → insert + draft design; `post_call_audio` → ignored.
- [ ] **Step 2:** Implement; pass. **Step 3:** Commit `web(voice): signed post-call webhook stores transcript and analysis`.

### Task 6: `POST /api/voice/explain` (45-second offer summary, audio gated)

**Files:** Create `web/src/app/api/voice/explain/route.ts`; add `offerScript` + `speak` to `voice.ts`; Test `web/src/app/api/voice/explain/route.test.ts`

**Interfaces — Produces:**
- Request `{ design_id?: string; design_response?: DesignResponse; language?: "en" | "de"; audio?: boolean }` (design loaded from Supabase when only `design_id`).
- `offerScript(d: DesignResponse, language): Promise<{ text: string; by: "claude" | "template" }>` — Anthropic Messages API via fetch, model `claude-sonnet-5-5`, system prompt: homeowner, plain words, ≤ 110 words (~45 s), use only the given numbers, no new sizes, no prices unless present in `economics`. Missing key / error → deterministic template from `spokenSummary` + physics numbers.
- `speak(text): Promise<ArrayBuffer>` — `POST api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, `model_id: "eleven_multilingual_v2"`.
- Response `{ text, by, audio_base64: string | null, audio_reason?: "tts_disabled" | "not_requested" | "error" }`. `speak` is called only when `audio === true` AND `VOICE_TTS_ENABLED === "true"`.

- [ ] **Step 1: Failing tests:** no Anthropic key → template text ≤ 110 words containing the kWp figure; `audio:true` with TTS disabled → ElevenLabs fetch NOT called, `audio_reason "tts_disabled"`; Claude mocked → text passed through and `by "claude"`; unknown `design_id` → 404.
- [ ] **Step 2:** Implement; pass. **Step 3:** Commit `web(voice): offer explanation text, audio behind a flag`.

### Task 7: Switch to B's shared libs, docs, tunnel, PR

**Files:** Modify `web/src/lib/voice.ts` (delete TEMP section once B's milestone 1 is on GitHub; import from `@/lib/{types,engine,supabase}`), `docs/voice-agent.md`, `docs/PLAN.md`.

- [ ] **Step 1:** Docs: cloudflared quick tunnel (`npm run build && npm start`, `cloudflared tunnel --url http://localhost:3000`, URL changes per run → update the agent tool + webhook URL), env table for `.env.local` and Vercel (names + where each comes from, no values), how to generate `ELEVENLABS_TOOL_SECRET` (`openssl rand -hex 32`), curl smoke tests for both voice endpoints.
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all green; run the tunnel; curl `create-design` with the token through the public URL and show the response.
- [ ] **Step 3:** When B's milestone 1 is pushed: merge `origin/web/app` (or main), drop stand-ins, rerun Step 2.
- [ ] **Step 4:** Tick `docs/PLAN.md` line "ElevenLabs … voice agent calling /design", push `web/voice`, open PR, report the public endpoint URLs.

## Open items for Mark (needed to go live, not to build)
1. Supabase project URL + service-role key (or does B create the project?). Without it the endpoints run and answer, but skip DB writes.
2. `GOOGLE_MAPS_API_KEY` with Geocoding + Solar API enabled.
3. `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` in `web/.env.local`.
4. Ask B to add `conversation_id text unique` to `calls` (until then I match on `facts->>conversation_id`).
