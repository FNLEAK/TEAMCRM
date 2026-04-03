-- Optional `appointments` table: squad streak + Command Center Realtime listen on `appointments`.
-- Calendar UI still uses `leads.appt_date`; this table is for streak metrics when rows exist.
-- Run in Supabase SQL Editor after `leads` exists.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_user_id_created_idx
  on public.appointments (user_id, created_at desc);

alter table public.appointments enable row level security;

drop policy if exists "appointments_select_authenticated" on public.appointments;
create policy "appointments_select_authenticated"
  on public.appointments for select
  to authenticated
  using (true);

drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own"
  on public.appointments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "appointments_update_own" on public.appointments;
create policy "appointments_update_own"
  on public.appointments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "appointments_delete_own" on public.appointments;
create policy "appointments_delete_own"
  on public.appointments for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.appointments_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists appointments_set_updated_at_trg on public.appointments;
create trigger appointments_set_updated_at_trg
  before update on public.appointments
  for each row
  execute function public.appointments_set_updated_at();

-- Realtime (ignore error if already in publication)
alter publication supabase_realtime add table public.appointments;
