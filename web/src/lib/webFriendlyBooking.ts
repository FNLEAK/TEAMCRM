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
 * Webhook **always** writes this status (no env override) so bookings never land in the **New** column by mistake.
 * Value is not in `LEAD_STATUSES` → Kanban bucket labeled “Website booked calls”.
 * DB must allow this exact string in `leads_status_check` — run `supabase/leads-status-add-website-booked.sql`
 * or the updated `leads-status-check.sql`. Remove `WEB_FRIENDLY_LEAD_STATUS` from Vercel if it is still set.
 */
export const WEBSITE_BOOKED_LEAD_STATUS = "Website booked calls";
