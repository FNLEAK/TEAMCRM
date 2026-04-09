-- Who is currently building the demo for this lead (owners only — avoids two owners duplicating work).
-- Run after `leads-demo-site.sql`. Keep `NEXT_PUBLIC_LEADS_HAS_DEMO_SITE=true` so the app selects these columns.

alter table public.leads
  add column if not exists demo_build_claimed_by uuid references auth.users (id) on delete set null,
  add column if not exists demo_build_claimed_at timestamptz;

comment on column public.leads.demo_build_claimed_by is 'Account owner building the demo page; cleared when done. App enforces owner-only updates.';
comment on column public.leads.demo_build_claimed_at is 'When demo_build_claimed_by was last set.';
