/**
 * Leads created from the partner “web-friendly” studio booking webhook.
 *
 * `public.leads.status` must match `leads_status_check` in Supabase (exact spelling/casing).
 * Never map payload `booking.status` (e.g. `"new"`) into `leads.status` — that value is for notes only.
 *
 * Default `Website Booked` is outside `LEAD_STATUSES` so rows land in the Kanban column labeled
 * “Website booked calls”. Override with `WEB_FRIENDLY_LEAD_STATUS` (e.g. `New`) if your constraint
 * does not allow `Website Booked` yet.
 */
export const WEBSITE_BOOKED_LEAD_STATUS = "Website Booked";

/** Status written to `leads.status` by POST /api/webhooks/booked-call. */
export function webhookLeadStatus(): string {
  const raw = process.env.WEB_FRIENDLY_LEAD_STATUS?.trim();
  if (raw) return raw;
  return WEBSITE_BOOKED_LEAD_STATUS;
}
