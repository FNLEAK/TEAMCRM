import { LEAD_STATUSES } from "@/lib/leadTypes";

/**
 * Leads created from the partner “web-friendly” studio booking webhook.
 *
 * `public.leads.status` must match `leads_status_check` in Supabase (exact spelling/casing).
 * Inspect with:
 *   SELECT pg_get_constraintdef(oid) FROM pg_constraint
 *   WHERE conrelid = 'public.leads'::regclass AND conname = 'leads_status_check';
 *
 * Never map payload `booking.status` (e.g. lowercase `"new"`) into `leads.status` unless you add an
 * explicit allow-list map — that field is recorded in notes only.
 *
 * Default without env: first canonical CRM stage (`New`) — included in this repo’s `leads-status-check.sql`.
 * For the “Website booked calls” Kanban bucket, run `supabase/leads-status-add-website-booked.sql` and set
 * `WEB_FRIENDLY_LEAD_STATUS=Website Booked` in Vercel.
 */
export const WEBSITE_BOOKED_LEAD_STATUS = "Website Booked";

/** Safe default when `WEB_FRIENDLY_LEAD_STATUS` is unset (matches typical `leads_status_check`). */
const WEBHOOK_SAFE_DEFAULT_STATUS = LEAD_STATUSES[0];

/** Status written to `leads.status` by POST /api/webhooks/booked-call. */
export function webhookLeadStatus(): string {
  const raw = process.env.WEB_FRIENDLY_LEAD_STATUS?.trim();
  if (raw) return raw;
  return WEBHOOK_SAFE_DEFAULT_STATUS;
}
