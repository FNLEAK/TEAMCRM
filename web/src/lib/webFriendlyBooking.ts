/**
 * Leads created from the partner “web-friendly” studio booking webhook.
 * Status is intentionally outside `LEAD_STATUSES` so rows land in the Kanban column
 * labeled “Website booked calls” (non-canonical bucket).
 */
export const WEBSITE_BOOKED_LEAD_STATUS = "Website Booked";
