-- CRM engine: timeline notes + who scheduled the appointment.
-- Run in Supabase SQL editor. Enable Realtime on new tables in Dashboard → Database → Publications.

-- Who last set / confirmed the appointment (shown as “Scheduled by [Name]” in the drawer)
alter table public.leads
  add column if not exists appt_scheduled_by uuid references auth.users (id);

create index if not exists leads_appt_scheduled_by_idx on public.leads (appt_scheduled_by);

-- Append-only activity log (timeline notes)
create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint lead_activity_body_len check (char_length(body) > 0 and char_length(body) <= 4000)
);

create index if not exists lead_activity_lead_id_created_idx
  on public.lead_activity (lead_id, created_at desc);

alter table public.lead_activity enable row level security;

create policy "lead_activity_select_team"
  on public.lead_activity for select
  to authenticated
  using (true);

create policy "lead_activity_insert_own"
  on public.lead_activity for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Realtime: add `lead_activity` to publication `supabase_realtime` (Dashboard or SQL below).
-- alter publication supabase_realtime add table public.lead_activity;
