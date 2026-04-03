-- Team-visible high priority flag on leads (everyone sees the same value).
-- Run in Supabase SQL Editor after `leads` exists. RLS: existing shared-pool UPDATE covers this column.

alter table public.leads
  add column if not exists is_high_priority boolean not null default false;

create index if not exists leads_is_high_priority_idx
  on public.leads (is_high_priority)
  where is_high_priority = true;
