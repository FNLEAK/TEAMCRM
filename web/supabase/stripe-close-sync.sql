-- Optional: link Stripe invoices to pending close rows and idempotent webhooks.
-- Run in Supabase SQL editor after closed-deals.sql.

alter table public.closed_deals
  add column if not exists stripe_invoice_id text null;

alter table public.closed_deals
  add column if not exists stripe_checkout_session_id text null;

alter table public.closed_deals
  add column if not exists payment_source text null;

create unique index if not exists closed_deals_stripe_invoice_id_uidx
  on public.closed_deals (stripe_invoice_id)
  where stripe_invoice_id is not null;

-- Prevent double-processing the same Stripe event (retries).
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- No client access; only service role / server uses this table.
drop policy if exists stripe_webhook_events_deny_all on public.stripe_webhook_events;
create policy stripe_webhook_events_deny_all
  on public.stripe_webhook_events
  for all
  to authenticated
  using (false)
  with check (false);
