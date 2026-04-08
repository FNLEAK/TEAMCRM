import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";

/**
 * Shared SELECT list for `leads` (server + client) — keep in sync with `LeadRow`.
 *
 * Embeds scheduler `profiles` when `appt_scheduled_by` references `public.profiles(id)`
 * (see `supabase/leads-appt-scheduled-by-profiles-fk.sql`). Set
 * `NEXT_PUBLIC_LEADS_SCHEDULER_PROFILE_EMBED=false` to omit the embed if your FK still targets `auth.users` only.
 */
export function getLeadSelectColumns(): string {
  const parts = [
    "id",
    "company_name",
    "phone",
    "website",
    "status",
    "notes",
    "favorited_by",
    "appt_date",
  ];
  /** Only set to "false" if your `leads` table has no `appt_scheduled_by` column yet. */
  const omitApptScheduledBy = process.env.NEXT_PUBLIC_LEADS_HAS_APPT_SCHEDULED_BY === "false";
  const embedScheduler =
    !omitApptScheduledBy && process.env.NEXT_PUBLIC_LEADS_SCHEDULER_PROFILE_EMBED !== "false";

  if (!omitApptScheduledBy) {
    parts.push("appt_scheduled_by");
  }
  /** Default on (team CRM). Set NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY=false if the column is not migrated yet. */
  if (process.env.NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY !== "false") {
    parts.push("claimed_by");
  }
  /** For “My schedule” when scheduler FK failed — stamp from squad-streak-lead-activity.sql. Opt out with =false. */
  if (process.env.NEXT_PUBLIC_LEADS_HAS_LAST_ACTIVITY_BY !== "false") {
    parts.push("last_activity_by");
  }
  /** Only set to "false" if `is_high_priority` is not migrated yet — see `supabase/leads-high-priority.sql`. */
  if (process.env.NEXT_PUBLIC_LEADS_HAS_HIGH_PRIORITY !== "false") {
    parts.push("is_high_priority");
  }
  parts.push("created_at");

  if (isDemoSiteFeatureEnabled()) {
    parts.push("demo_site_url", "demo_site_sent", "demo_site_sent_at");
  }

  let select = parts.join(", ");
  if (!omitApptScheduledBy && embedScheduler) {
    const fkHint =
      process.env.NEXT_PUBLIC_LEADS_SCHEDULER_PROFILE_FK_HINT?.trim() ||
      "leads_appt_scheduled_by_fkey";
    select += `, scheduler_profile:profiles!${fkHint}(full_name, first_name, avatar_initials)`;
  }
  return select;
}
