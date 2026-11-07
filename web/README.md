# web: Reonic AI Designer (Next.js)

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest (mock engine logic)
npm run build
```

## Env (web/.env.local, never committed)
| var | where | what |
|---|---|---|
| `ENGINE_URL` | server | Python engine base URL (docs/api.md). Unset = deterministic MOCK engine (`model_version: "MOCK"`, reasons prefixed `[mock]`) |
| `NEXT_PUBLIC_ENGINE_URL` | browser | optional, same engine for client-side calls |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | read-only + realtime (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | all writes |
| `ANTHROPIC_API_KEY` | server only | /api/agent (refine agent) |

## Shared files (sessions C and D import these; owner: session B)
- `src/lib/types.ts`: engine types matching docs/api.md (+ optional engine extras)
- `src/lib/engine.ts`: `getEngine()` → `design / validate / refine / explain / eval / project`; mock when `ENGINE_URL` is unset
- `src/lib/supabase.ts`: `getBrowserSupabase()` (anon, read + realtime), `getServerSupabase()` (service role, server only), row types
- `../supabase/schema.sql`: tables calls, designs, overrides, shares; RLS; realtime on calls + designs

## Theme
`src/app/globals.css` maps docs/design/tokens.json to Tailwind v4: token names as utilities (`bg-surface-1`, `text-ink-muted`,
`bg-comp-pv`, `text-ai-text`, `bg-ai` gradient, `text-metric`, `text-label`, `rounded-pill`, `shadow-pop`) and shadcn's
semantic names mapped onto them. Dark mode = `.dark` class (next-themes, follows the system).
