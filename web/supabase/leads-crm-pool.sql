-- Business-line split for `public.leads`: main website CRM vs vertical tabs (roofing, future HVAC).
-- Run after `web/supabase/leads-roofing-pool.sql` (needs `is_roofing_lead` for one-time backfill).
-- Then set `NEXT_PUBLIC_LEADS_USE_CRM_POOL=true` in web env so the app selects/filters `crm_pool` (defaults off until then).
-- With `NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL=true`, the app filters:
--   `/`           → crm_pool = 'main'
--   `/roofing-leads` → crm_pool = 'roofing'
-- Main lead fields (status, appointments, drawer, etc.) are identical per row; only `crm_pool` chooses which UI lists the row.

alter table public.leads
  add column if not exists crm_pool text not null default 'main';

alter table public.leads drop constraint if exists leads_crm_pool_check;

alter table public.leads
  add constraint leads_crm_pool_check
  check (crm_pool in ('main', 'roofing', 'hvac'));

comment on column public.leads.crm_pool is
  'CRM surface: main = Lead Management (/), roofing = /roofing-leads, hvac = reserved for future HVAC tab.';

-- One-time: legacy roofing flag → pool column (idempotent if already run).
update public.leads
set crm_pool = 'roofing'
where coalesce(is_roofing_lead, false) = true;

-- Keep boolean in sync for any code or views still reading `is_roofing_lead`.
update public.leads
set is_roofing_lead = (crm_pool = 'roofing')
where crm_pool is not null;

create index if not exists leads_crm_pool_idx on public.leads (crm_pool);
