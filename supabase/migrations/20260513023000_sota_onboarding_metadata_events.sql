alter table onboarding_sessions
alter column onboarding_state drop default;

alter table onboarding_sessions
alter column onboarding_state type jsonb
using case
  when onboarding_state is null then '{}'::jsonb
  when onboarding_state::text ~ '^\s*[\{\[]' then onboarding_state::jsonb
  else jsonb_build_object('currentPhase', onboarding_state::text)
end;

alter table onboarding_sessions
alter column onboarding_state set default '{}'::jsonb;

alter table onboarding_sessions
add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_id uuid references onboarding_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_events_user_id_idx
on onboarding_events(user_id);

create index if not exists onboarding_events_session_id_idx
on onboarding_events(session_id);
