import { readableEmailLocalPart } from "@/lib/readableEmailLocal";

/** Nested row from `profiles` embedded on `leads` (FK `leads_appt_scheduled_by_fkey` → `profiles.id`). */
export type LeadSchedulerProfileEmbed = {
  full_name?: string | null;
  first_name?: string | null;
  avatar_initials?: string | null;
};

export type LeadRow = {
  id: string;
  company_name: string | null;
  phone: string | null;
  website: string | null;
  status: string | null;
  notes: string | null;
  /** Postgres `uuid[]` / `text[]`, or a single uuid string if you use one user per row */
  favorited_by: string[] | string | null;
  /** Used for “Appointments today” stat; nullable (matches `appt_date` in Supabase) */
  appt_date: string | null;
  /** Set when a teammate saves an appointment — requires migration + `NEXT_PUBLIC_LEADS_HAS_APPT_SCHEDULED_BY=true` */
  appt_scheduled_by?: string | null;
  /**
   * Populated when the leads select embeds scheduler `profiles` (alias `scheduler_profile`).
   */
  scheduler_profile?: LeadSchedulerProfileEmbed | null;
  /** Who last “owns” outreach — set when status moves to Called / Interested / Appt Set / Pending Close (see `statusAssignsClaimToActor`). Requires `claimed_by` column unless `NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY=false`. */
  claimed_by?: string | null;
  /** Optional: `squad-streak-lead-activity.sql` — last user who updated the row (Realtime may include it). */
  last_activity_by?: string | null;
  /** Populated for CSV bulk imports — see `supabase/leads-import-batch.sql` */
  import_batch_id?: string | null;
  import_filename?: string | null;
  created_at?: string | null;
  /** Team-visible — see `supabase/leads-high-priority.sql`. Omit from API if env disables column. */
  is_high_priority?: boolean | null;
  /** Owner-set demo URL — see `supabase/leads-demo-site.sql`. Enable app UI: `NEXT_PUBLIC_LEADS_HAS_DEMO_SITE=true` after SQL. */
  demo_site_url?: string | null;
  demo_site_sent?: boolean | null;
  demo_site_sent_at?: string | null;
  /** Owner building the demo (see `leads-demo-build-claim.sql`) — selected when demo site feature is on. */
  demo_build_claimed_by?: string | null;
  demo_build_claimed_at?: string | null;
  /** Roofing-only pool — see `web/supabase/leads-roofing-pool.sql` + NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL. */
  is_roofing_lead?: boolean | null;
};

/** Canonical pipeline values (store exact casing in DB for consistent pills). */
export const LEAD_STATUSES = [
  "New",
  "Called",
  "Interested",
  "Appt Set",
  "Pending Close",
  "Not Interested",
] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

/** `?status=` on the CRM list — only canonical pipeline values are accepted. */
export function parseLeadStatusFilterParam(raw: string | null | undefined): LeadStatusValue | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return (LEAD_STATUSES as readonly string[]).includes(t) ? (t as LeadStatusValue) : null;
}

/** Pipeline stages where the teammate who saves the update becomes `claimed_by` (list + drawer “Claimed by …”). */
export function statusAssignsClaimToActor(next: LeadStatusValue): boolean {
  return (
    next === "Called" ||
    next === "Interested" ||
    next === "Appt Set" ||
    next === "Pending Close"
  );
}

/** Unclaimed pool — no “Claimed by” badge; saving New clears `claimed_by` when that column is enabled. */
export function isNewLeadStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "new";
}

export function isInterestedStage(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "interested";
}

/** Internal bucket for statuses outside `LEAD_STATUSES` (DB may use legacy/custom values). */
export const NON_CANONICAL_STAGE_KEY = "Other";

/** User-facing name for `NON_CANONICAL_STAGE_KEY` in dashboards and filters. */
export const NON_CANONICAL_STAGE_LABEL = "Website booked calls";

export function pipelineStageDisplayLabel(stageKey: string): string {
  return stageKey === NON_CANONICAL_STAGE_KEY ? NON_CANONICAL_STAGE_LABEL : stageKey;
}

export const PAGE_SIZE = 50;

/** Max length for search input (server applies same cap). */
export const COMPANY_SEARCH_MAX_LEN = 200;

export const SEARCH_DEBOUNCE_MS = 380;

/**
 * Escape `%`, `_`, and `\` so user input is literal inside PostgREST `ilike` patterns.
 */
export function escapeForIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function normalizeFavoritedIds(raw: LeadRow["favorited_by"]): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean) as string[];
  if (typeof raw === "string" && raw.length > 0) return [raw];
  return [];
}

export function isFavoritedBy(row: Pick<LeadRow, "favorited_by">, userId: string): boolean {
  return normalizeFavoritedIds(row.favorited_by).includes(userId);
}

export function isApptSetStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "appt set";
}

export function isLeadHighPriority(row: Pick<LeadRow, "is_high_priority">): boolean {
  return row.is_high_priority === true;
}

/** Safe for odd DB/Realtime shapes — avoids calling `.trim` on non-strings. */
export function normalizeDemoSiteUrl(raw: LeadRow["demo_site_url"]): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  return String(raw);
}

export function hasDemoSiteUrl(row: Pick<LeadRow, "demo_site_url">): boolean {
  return Boolean(normalizeDemoSiteUrl(row.demo_site_url).trim());
}

export function isDemoSiteSent(row: Pick<LeadRow, "demo_site_sent">): boolean {
  return row.demo_site_sent === true;
}

export function demoBuildClaimedByUserId(row: Pick<LeadRow, "demo_build_claimed_by">): string | null {
  const v = row.demo_build_claimed_by;
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * When status is Appt Set and `appt_scheduled_by` points at someone else, viewers should see the lead as read-only
 * (pipeline + appointment locked). Requires `appt_scheduled_by` column + env not set to "false".
 */
export function isApptLeadLockedForViewer(
  row: Pick<LeadRow, "status" | "appt_scheduled_by">,
  viewerUserId: string,
): boolean {
  const hasCol = process.env.NEXT_PUBLIC_LEADS_HAS_APPT_SCHEDULED_BY !== "false";
  if (!hasCol) return false;
  if (!isApptSetStatus(row.status)) return false;
  const sid = row.appt_scheduled_by;
  return Boolean(sid) && sid !== viewerUserId;
}

export type TeamProfile = {
  initials: string;
  /** Primary display line — from `profiles.full_name`, then `first_name`, then fallback */
  label: string;
  /** Professional name: prefer `profiles.full_name` */
  fullName: string;
  /** Short / first token — from `first_name` or first word of `full_name` */
  firstName: string;
  /** From `profiles.email` — used when names are empty (Claimed by, etc.) */
  email?: string;
};

/**
 * Derive display initials from a person’s name only — do **not** pass a UUID here
 * (UUID prefixes look like random numbers in small avatars).
 */
export function initialsFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "••";
}

/** Prefer `avatar_initials`; otherwise two letters for multi-word names, one letter for a single name. */
export function initialsFromPersonFields(fullName: string, firstName: string): string {
  const t = (fullName || firstName).trim();
  if (!t) return "";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return (a + b).toUpperCase();
  }
  const one = parts[0] || t;
  return one[0] ? one[0].toUpperCase() : "";
}

export function fallbackInitialsFromUserId(id: string): string {
  const hex = id.replace(/-/g, "");
  return hex.slice(0, 2).toUpperCase();
}

/** Build a `TeamProfile` from a `profiles` row (same shape as Supabase select). */
export function teamProfileFromDb(p: {
  id: string;
  first_name?: string | null;
  full_name?: string | null;
  avatar_initials?: string | null;
  email?: string | null;
}): TeamProfile {
  const fn = ((p.full_name as string | null) ?? "").trim();
  const storedFirst = typeof p.first_name === "string" ? p.first_name.trim() : "";
  const firstName =
    storedFirst || (fn ? (fn.split(/\s+/).filter(Boolean)[0] ?? "") : "") || "";
  const fullName = fn || storedFirst || "";
  const mail = typeof p.email === "string" ? p.email.trim() : "";
  const ai = (p.avatar_initials as string | null)?.trim();
  const idFrag = p.id.replace(/-/g, "").slice(0, 8);
  const fromStoredInitials = ai && ai.length > 0 ? ai.toUpperCase().slice(0, 3) : "";
  const fromName = initialsFromPersonFields(fn, storedFirst);
  const fromMail = mail ? readableEmailLocalPart(mail) : "";
  return {
    initials: fromStoredInitials || fromName || "·",
    label: fullName || fromMail || idFrag,
    fullName,
    firstName,
    email: mail || undefined,
  };
}

/** Build display profile from embedded `profiles` on the lead (calendar + drawer). */
export function teamProfileFromSchedulerEmbed(
  userId: string | null | undefined,
  embed: LeadSchedulerProfileEmbed | null | undefined,
): TeamProfile | undefined {
  if (!userId || embed == null) return undefined;
  return teamProfileFromDb({
    id: userId,
    first_name: embed.first_name ?? null,
    full_name: embed.full_name ?? null,
    avatar_initials: embed.avatar_initials ?? null,
  });
}
