-- Team reminders for a calendar day (Daily briefing under the dashboard calendar).
-- Table name: team_calendar_day_notes (plural). If you already have team_calendar_day_note, migrate below.

create table if not exists public.team_calendar_day_notes (
  day date primary key,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.team_calendar_day_notes enable row level security;

create policy "team_calendar_day_notes_select"
  on public.team_calendar_day_notes for select
  to authenticated
  using (true);

create policy "team_calendar_day_notes_insert"
  on public.team_calendar_day_notes for insert
  to authenticated
  with check (true);

create policy "team_calendar_day_notes_update"
  on public.team_calendar_day_notes for update
  to authenticated
  using (true);

create policy "team_calendar_day_notes_delete"
  on public.team_calendar_day_notes for delete
  to authenticated
  using (true);

-- One-time migration from singular table (run once if needed):
-- insert into public.team_calendar_day_notes (day, body, updated_at, updated_by)
--   select day, body, updated_at, updated_by from public.team_calendar_day_note
--   on conflict (day) do nothing;
