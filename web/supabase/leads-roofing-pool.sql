-- Roofing vs main Command pool: `public.leads.is_roofing_lead`
-- After applying, set NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL=true in web env and redeploy.

alter table public.leads
  add column if not exists is_roofing_lead boolean not null default false;

comment on column public.leads.is_roofing_lead is
  'When true, lead appears only on /roofing-leads (owner). Main Lead Management lists rows where this is false.';

create index if not exists leads_is_roofing_lead_idx on public.leads (is_roofing_lead);
