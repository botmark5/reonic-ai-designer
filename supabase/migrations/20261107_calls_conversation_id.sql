-- Session D (voice): link calls rows to the ElevenLabs conversation, so the create_design tool and the post-call
-- webhook update the same row. Idempotent. Apply after supabase/schema.sql.
alter table public.calls add column if not exists conversation_id text;
create unique index if not exists calls_conversation_id_key on public.calls (conversation_id);
