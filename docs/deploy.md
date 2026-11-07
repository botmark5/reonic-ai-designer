# Deploy (web on Vercel)

The web app (`web/`) deploys to Vercel. The engine runs elsewhere (Cala's tunnel or a private host, see engine/README.md);
the web app reaches it server-side only. Without any env vars the app still builds and runs: the engine falls back to
the offline estimate and the store to an in-memory demo inbox.

## Vercel project
- Root directory: `web` · Framework: Next.js · Build: `npm run build` · Install: `npm ci` · Node 22+.
- Connect the GitHub repo (`botmark5/reonic-ai-designer`), production branch `main`.

## Environment variables (names only; values live in Vercel and in web/.env.local, never in git)
| Name | Scope | Needed for |
|---|---|---|
| `ENGINE_URL` | server | live engine (unset or down = offline estimate, badge shown) |
| `ENGINE_API_KEY` | server | `X-Engine-Key` for the engine |
| `ANTHROPIC_API_KEY` | server | refine agent `/api/agent`, voice explain (unset = engine `/refine`, templates) |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | designs, shares, realtime inbox |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | read-only (RLS: designs, shares) + realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | server | all writes, calls (server-only) |
| `ELEVENLABS_TOOL_SECRET` | server | voice agent → `/api/voice/create-design` |
| `ELEVENLABS_WEBHOOK_SECRET` | server | post-call webhook HMAC |
| `ELEVENLABS_API_KEY` | server | "Listen to your offer" audio (optional) |
| `ELEVENLABS_VOICE_ID` | server | voice for the audio (optional) |
| `VOICE_TTS_ENABLED` | server | `true` to turn audio on (optional) |
| `VOICE_INSTALLER` | server | installer id for voice drafts (optional, default `2a8ba8e2`) |
| `GOOGLE_MAPS_API_KEY` | server | Google Solar roof lookup (optional) |

## Before the first production deploy
1. Apply `supabase/schema.sql`, then `supabase/migrations/*.sql` in date order (conversation_id, calls_private).
2. Set the engine's CORS/allowed origin if it checks one (`ENGINE_CORS_ORIGINS=https://<project>.vercel.app`); the web
   app calls it from the server, so CORS only matters for direct browser calls (none today).
3. Point the ElevenLabs tool and webhook at `https://<project>.vercel.app/api/voice/...` (docs/voice-agent.md).
4. Smoke test: `GET /api/engine/health` (engine reachable, key accepted, one /design), then `/`, `/live`, `/reality`.
