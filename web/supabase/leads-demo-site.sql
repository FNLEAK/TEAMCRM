-- Owner-set demo URL per lead + team “sent to customer” flag.
-- Run in Supabase SQL Editor after `public.leads` exists.
--
-- Then in web/.env.local set:
--   NEXT_PUBLIC_LEADS_HAS_DEMO_SITE=true
-- (Feature is opt-in so the app does not SELECT missing columns and empty your lead list.)

alter table public.leads
  add column if not exists demo_site_url text,
  add column if not exists demo_site_sent boolean not null default false,
  add column if not exists demo_site_sent_at timestamptz;

comment on column public.leads.demo_site_url is 'Sales demo page for this lead — only owners should set via app.';
comment on column public.leads.demo_site_sent is 'Team: marked when customer received the demo link.';
comment on column public.leads.demo_site_sent_at is 'When demo_site_sent was last set true.';
