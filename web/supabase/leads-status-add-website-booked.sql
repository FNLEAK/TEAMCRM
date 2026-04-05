-- One-off: allow `Website Booked` on leads (partner webhook /api/webhooks/booked-call).
-- Run if you already applied leads-status-check.sql before `Website Booked` was added.
-- Safe to re-run: drops and recreates `leads_status_check`.

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
