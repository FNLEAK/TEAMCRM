-- Align `public.leads.status` CHECK with the CRM app (`LEAD_STATUSES` in `web/src/lib/leadTypes.ts`).
-- Fixes: "new row for relation \"leads\" violates check constraint \"leads_status_check\""
-- when sending a close request (status → `Pending Close`) or using pipeline stages.
--
-- Run once in Supabase SQL Editor. Safe to re-run: drops and recreates the same constraint name.

alter table public.leads drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
  check (
    status is null
    or btrim(status) = ''
    or status in (
      'New',
      'Called',
      'Interested',
      'Claimed',
      'Appt Set',
      'Pending Close',
      'Not Interested',
      'Website Booked'
    )
  );

comment on constraint leads_status_check on public.leads is
  'Allowed pipeline statuses for Web Friendly CRM; includes Claimed for legacy rows and Website Booked for partner webhooks.';
