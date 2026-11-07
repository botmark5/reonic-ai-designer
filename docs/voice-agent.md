# Voice agent (ElevenLabs)

- Agent: "Reonic AI Designer - Site Visit Agent", id `agent_5001m6vfnmapfkxvxv4af19jj87w` (Mark's ElevenLabs workspace)
- Editor: https://elevenlabs.io/app/agents/agents/agent_5001m6vfnmapfkxvxv4af19jj87w
- Test call (browser/phone): https://elevenlabs.io/app/talk-to?agent_id=agent_5001m6vfnmapfkxvxv4af19jj87w
- Language: English (German preset can be added later). Voice: default for now; planned "Dylan" (KxR7w7QY9Rc4gig86VPG)
  once added to the workspace from the Voice Library.
- Behaviour: collects 8 fact groups, never invents values, reads a summary back, confirms, says the draft will be in the inbox.

## Data collection (post-call analysis fields)
customer_name, address, annual_kwh, monthly_bill_eur, household, daytime_presence, has_ev, ev_km_year,
heating [gas|oil|heatpump|electric|district|wood|other|unknown], heating_age_years,
roof_type [concrete_tile|clay_tile|flat|metal|slate|other|unknown],
roof_direction [south|south_east|south_west|east_west|east|west|north|unknown],
existing_pv_kwp, existing_battery_kwh, wishes, facts_confirmed.
Evaluation criterion: facts_complete.

## Still to connect (session D builds the endpoints, then Claude in chat attaches them to the agent)
1. Server tool `create_design` → POST {PUBLIC_URL}/api/voice/create-design with header `x-agent-token: {ELEVENLABS_TOOL_SECRET}`,
   params = the fields above (description: "never assume values; only send what the caller said"), response
   `{ instruction: "Tell the caller: …" }`. Then the prompt's closing step changes to "call create_design, then read its instruction".
2. Post-call webhook (workspace settings) → POST {PUBLIC_URL}/api/voice/post-call, HMAC secret = ELEVENLABS_WEBHOOK_SECRET.
3. PUBLIC_URL = the Vercel deployment (or a cloudflared tunnel while developing).
See docs/rosi-notes.md for the pitfalls (raw-body HMAC, null → '', defaults for dynamic variables).

## Endpoints (session D, `web/src/app/api/{voice,solar}`, logic in `web/src/lib/{voice,solar}.ts`)
| Endpoint | Auth | What it does |
|---|---|---|
| `POST /api/voice/create-design` | `x-agent-token` (or `Authorization: Bearer`) = `ELEVENLABS_TOOL_SECRET` | Normalises the facts (bill → kWh at 0.35 €/kWh, household-size estimate, heating/roof vocab), fills a missing roof orientation/tilt from Google Solar (≤ 0.9 s), calls the engine (budget 2.5 s), writes `calls` (status `live`) + `designs` (source `voice`, status `draft`), returns `{ instruction, call_id, design_id, pending }`. Engine slow or down → `pending: true`, "in the inbox in a minute", the design is finished after the response (3 tries, 8 s apart). Never stores the engine client's offline estimate as a voice draft. |
| `POST /api/voice/post-call` | `ElevenLabs-Signature` HMAC on the raw body, `ELEVENLABS_WEBHOOK_SECRET`, ±30 min | `post_call_transcription` → transcript, summary, data-collection values and evaluation results onto the same `calls` row (by `conversation_id`), status `ended`/`failed`. If the agent never called the tool and use/bill/household is known, drafts the design then. Other webhook types → `{ ignored: true }`. |
| `GET /api/solar?address=…` | none (server key) | `{ status: ok, lat, lng, segments[{pitch_deg, azimuth_deg, area_m2}], max_panels, panel_watts, sunshine_hours_year, imagery_quality }` or `{ status: not_covered | not_found | no_key | error, reason }`. Cached 24 h. |
| `POST /api/voice/explain` | none | `{ design_id }` or `{ design_response }`, optional `language: "de"`, `audio: true` → `{ text, by: claude|template, audio_base64, audio_reason }`. ≤ 110 words. Audio only when `VOICE_TTS_ENABLED=true` (off until Mark confirms the voice). |

The tool needs `conversation_id` as a parameter filled from the system dynamic variable `system__conversation_id`, so the
tool call and the post-call webhook land on the same `calls` row. Requires `supabase/migrations/20261107_calls_conversation_id.sql`.

## Env vars (web/.env.local locally, Vercel → Project → Settings → Environment Variables; names only, never values in git)
| Name | Where it comes from | Needed for |
|---|---|---|
| `ENGINE_URL`, `ENGINE_API_KEY` | Cala's engine (tunnel URL + its key) | real designs (without: mock in dev) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project settings → API | storing calls/designs (without: endpoints answer, nothing stored) |
| `ELEVENLABS_TOOL_SECRET` | `openssl rand -hex 32`; same value in the agent tool's `x-agent-token` header | create-design auth |
| `ELEVENLABS_WEBHOOK_SECRET` | ElevenLabs → workspace settings → webhooks, shown when the post-call webhook is created | post-call HMAC |
| `GOOGLE_MAPS_API_KEY` | Google Cloud, Geocoding API + Solar API enabled | roof lookup (without: `no_key`, design still made) |
| `ANTHROPIC_API_KEY` | Anthropic console | explain text (without: template text) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `VOICE_TTS_ENABLED=true` | ElevenLabs | explain audio (off by default) |
| `VOICE_INSTALLER` (optional) | default `2a8ba8e2` | which installer's catalogue voice drafts use |

## Local webhooks through a tunnel (cloudflared)
```bash
cd web && npm run build && npx next start -p 3100      # production server (dev also works, first call compiles)
cloudflared tunnel --url http://localhost:3100          # prints https://<random>.trycloudflare.com
```
The quick-tunnel URL changes on every restart: update the `create_design` tool URL and the post-call webhook URL in
ElevenLabs each time (or use a named tunnel / the Vercel URL). Smoke tests:
```bash
curl -X POST $PUBLIC_URL/api/voice/create-design -H "x-agent-token: $ELEVENLABS_TOOL_SECRET" -H 'content-type: application/json' \
  -d '{"conversation_id":"test_1","customer_name":"Test","monthly_bill_eur":150,"household":4,"has_ev":"yes","heating":"gas","roof_direction":"south"}'
curl "$PUBLIC_URL/api/solar?address=Marienplatz%201%20M%C3%BCnchen"
curl -X POST $PUBLIC_URL/api/voice/post-call -d '{}'        # → 401 invalid signature (expected)
```
