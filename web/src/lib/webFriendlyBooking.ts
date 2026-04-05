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
 * Default without env: `Website Booked` — not in `LEAD_STATUSES`, so rows appear in the Kanban column
 * labeled “Website booked calls”. Requires `Website Booked` in `leads_status_check` (run
 * `supabase/leads-status-add-website-booked.sql` or use the updated `leads-status-check.sql`).
 * If inserts fail on constraint, set `WEB_FRIENDLY_LEAD_STATUS=New` in Vercel until the SQL is applied.
 */
export const WEBSITE_BOOKED_LEAD_STATUS = "Website Booked";

/** Status written to `leads.status` by POST /api/webhooks/booked-call. */
export function webhookLeadStatus(): string {
  const raw = process.env.WEB_FRIENDLY_LEAD_STATUS?.trim();
  if (raw) return raw;
  return WEBSITE_BOOKED_LEAD_STATUS;
}
