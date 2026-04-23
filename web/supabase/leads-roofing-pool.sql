-- Legacy boolean: `public.leads.is_roofing_lead` (kept in sync with `crm_pool` — see `web/supabase/leads-crm-pool.sql`).
-- After applying both files, set NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL=true in web env and redeploy.

alter table public.leads
  add column if not exists is_roofing_lead boolean not null default false;

comment on column public.leads.is_roofing_lead is
  'When true, lead appears only on /roofing-leads (owner). Main Lead Management lists rows where this is false.';

create index if not exists leads_is_roofing_lead_idx on public.leads (is_roofing_lead);
