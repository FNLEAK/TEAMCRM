-- Idempotent web bookings → `public.leads` (friend’s studio webhook).
-- Run in Supabase SQL Editor once. Requires SUPABASE_SERVICE_ROLE_KEY on the Next.js webhook route.

alter table public.leads
  add column if not exists source_booking_id text;

comment on column public.leads.source_booking_id is
  'External booking id from partner webhooks (e.g. studio_booking.created). Unique when set; used for upsert / dedup.';

-- PostgreSQL treats each NULL as distinct, so many non-webhook leads can have NULL.
create unique index if not exists leads_source_booking_id_key
  on public.leads (source_booking_id);
