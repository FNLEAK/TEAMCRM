-- Squad streak: record who last touched a lead (any insert/update) for streak + analytics.
-- Run in Supabase SQL Editor. Enable Realtime on `public.leads` if not already (Dashboard → Publications).

alter table public.leads
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.leads
  add column if not exists last_activity_by uuid references auth.users (id) on delete set null;

create index if not exists leads_last_activity_by_at_idx
  on public.leads (last_activity_by, last_activity_at desc);

-- Rough backfill for existing rows (no historical actor)
update public.leads
set last_activity_at = coalesce(created_at, now())
where true;

create or replace function public.leads_stamp_last_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.last_activity_at := coalesce(new.last_activity_at, now());
    new.last_activity_by := coalesce(new.last_activity_by, auth.uid());
  elsif tg_op = 'UPDATE' then
    new.last_activity_at := now();
    new.last_activity_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists leads_stamp_last_activity_biud on public.leads;

create trigger leads_stamp_last_activity_biud
  before insert or update on public.leads
  for each row
  execute function public.leads_stamp_last_activity();
