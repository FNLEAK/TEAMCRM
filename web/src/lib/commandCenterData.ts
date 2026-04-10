import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoBuildClaimFeatureEnabled } from "@/lib/demoBuildClaimFeature";
import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";
import { LEAD_STATUSES, NON_CANONICAL_STAGE_KEY, teamProfileFromDb } from "@/lib/leadTypes";
import { displayProfessionalName } from "@/lib/profileDisplay";
import { fetchProfilesByIds } from "@/lib/profileSelect";
import { utcCalendarDayBounds, utcCalendarWeekBounds } from "@/lib/utcDayBounds";

export type CommandCenterLead = {
  id: string;
  company_name: string | null;
  phone: string | null;
  website: string | null;
  status: string | null;
  notes: string | null;
  appt_date: string | null;
  claimed_by: string | null;
  appt_scheduled_by: string | null;
  /** From `squad-streak-lead-activity.sql` — who last updated the row (fallback when no claim/scheduler). */
  last_activity_by?: string | null;
  import_filename: string | null;
  created_at: string | null;
  /** Squad streak migration — best signal for “stuck” time in a stage. */
  last_activity_at?: string | null;
  /** Generic row bump when present (fallback if `last_activity_at` not selected). */
  updated_at?: string | null;
  is_high_priority?: boolean | null;
  demo_site_url?: string | null;
  demo_site_sent?: boolean | null;
  demo_site_sent_at?: string | null;
  demo_build_claimed_by?: string | null;
  demo_build_claimed_at?: string | null;
};

function commandCenterLeadsSelectBase(): string {
  const base =
    "id, company_name, phone, website, status, notes, appt_date, claimed_by, appt_scheduled_by, import_filename, created_at";
  let out = base;
  if (process.env.NEXT_PUBLIC_LEADS_HAS_HIGH_PRIORITY !== "false") {
    out = `${out}, is_high_priority`;
  }
  if (isDemoSiteFeatureEnabled()) {
    out = `${out}, demo_site_url, demo_site_sent, demo_site_sent_at`;
    if (isDemoBuildClaimFeatureEnabled()) {
      out = `${out}, demo_build_claimed_by, demo_build_claimed_at`;
    }
  }
  return out;
}

const SELECT = commandCenterLeadsSelectBase();

const SELECT_WITH_LAST_ACT = `${SELECT}, last_activity_by`;

/** Prefer for pipeline stale indicators; falls back in loader if columns missing. */
const SELECT_WITH_STALE_AND_LAST_ACT = `${SELECT}, last_activity_at, updated_at, last_activity_by`;

/** Kanban / owner filter: prefer explicit claim, then scheduler, then last person who touched the lead. */
export function pipelineAttributionUserId(lead: CommandCenterLead): string | null {
  const c = lead.claimed_by?.trim();
  if (c) return c;
  const a = lead.appt_scheduled_by?.trim();
  if (a) return a;
  const l = lead.last_activity_by?.trim();
  return l || null;
}

/** Max leads loaded for Command Center KPI + Kanban (newest first). Override with NEXT_PUBLIC_COMMAND_CENTER_LEADS_LIMIT. */
export function commandCenterLeadsLimit(): number {
  const raw = process.env.NEXT_PUBLIC_COMMAND_CENTER_LEADS_LIMIT;
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 500 && n <= 100_000) return n;
  return 6_000;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC calendar day key (YYYY-MM-DD), matches other CRM “today” metrics. */
function utcTodayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

const STREAK_LOOKBACK_DAYS = 120;
const STREAK_PAGE = 800;

function isoDaysAgoUtc(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** Consecutive UTC calendar days with activity, counting backward from today. */
export function consecutiveUtcStreakDays(activityDays: Set<string>): number {
  let streak = 0;
  let d = utcTodayYmd();
  while (activityDays.has(d)) {
    streak++;
    d = addDaysYmd(d, -1);
  }
  return streak;
}

function addIsoDayKeysFromTimestamps(rows: { created_at?: string | null; updated_at?: string | null }[], into: Set<string>) {
  for (const row of rows) {
    const ca = row.created_at;
    if (ca) into.add(ca.slice(0, 10));
    const ua = row.updated_at;
    if (ua) into.add(ua.slice(0, 10));
  }
}

function isMissingSchemaPiece(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  if (m.includes("does not exist") || m.includes("column") && m.includes("unknown")) return true;
  if (err.code === "42703" || err.code === "42P01") return true;
  return false;
}

async function paginateLeadActivityDays(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<Set<string>> {
  const days = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("lead_activity")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + STREAK_PAGE - 1);
    if (error) break;
    const rows = data ?? [];
    for (const row of rows) {
      const ca = (row as { created_at?: string }).created_at;
      if (ca) days.add(ca.slice(0, 10));
    }
    if (rows.length < STREAK_PAGE) break;
    offset += STREAK_PAGE;
  }
  return days;
}

async function paginateLeadsLastActivityDays(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<Set<string>> {
  const days = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("leads")
      .select("last_activity_at")
      .eq("last_activity_by", userId)
      .gte("last_activity_at", sinceIso)
      .order("last_activity_at", { ascending: false })
      .range(offset, offset + STREAK_PAGE - 1);
    if (error) {
      if (isMissingSchemaPiece(error)) return new Set();
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const t = (row as { last_activity_at?: string }).last_activity_at;
      if (t) days.add(t.slice(0, 10));
    }
    if (rows.length < STREAK_PAGE) break;
    offset += STREAK_PAGE;
  }
  return days;
}

async function fetchAppointmentActivityDays(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<Set<string>> {
  const days = new Set<string>();
  const [byCreated, byUpdated] = await Promise.all([
    supabase
      .from("appointments")
      .select("created_at, updated_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso),
    supabase
      .from("appointments")
      .select("created_at, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", sinceIso),
  ]);
  if (byCreated.error && isMissingSchemaPiece(byCreated.error)) return days;
  if (byUpdated.error && isMissingSchemaPiece(byUpdated.error)) return days;
  if (!byCreated.error) {
    addIsoDayKeysFromTimestamps((byCreated.data ?? []) as { created_at?: string; updated_at?: string }[], days);
  }
  if (!byUpdated.error) {
    addIsoDayKeysFromTimestamps((byUpdated.data ?? []) as { created_at?: string; updated_at?: string }[], days);
  }
  return days;
}

/**
 * Distinct UTC days with CRM activity for the signed-in user: timeline notes, attributed lead
 * touches (see `supabase/squad-streak-lead-activity.sql`), and optional `appointments` rows.
 */
export async function loadSquadStreakMetrics(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ squadStreakDays: number; streakProgress: number }> {
  const sinceIso = isoDaysAgoUtc(STREAK_LOOKBACK_DAYS);

  const [noteDays, leadDays, apptDays] = await Promise.all([
    paginateLeadActivityDays(supabase, userId, sinceIso),
    paginateLeadsLastActivityDays(supabase, userId, sinceIso),
    fetchAppointmentActivityDays(supabase, userId, sinceIso),
  ]);

  const merged = new Set<string>(noteDays);
  for (const d of leadDays) merged.add(d);
  for (const d of apptDays) merged.add(d);

  const squadStreakDays = consecutiveUtcStreakDays(merged);
  const streakProgress = Math.min(1, squadStreakDays / 7);

  return { squadStreakDays, streakProgress };
}

export type CommandCenterPayload = {
  leads: CommandCenterLead[];
  profileLabels: Record<string, string>;
  ownerRoles: Record<string, "owner" | "team">;
  metrics: {
    openPipelineDisplay: string;
    openPipelineSub: string;
    appointmentsToday: number;
    apptsNext7Days: number;
    apptsHeldThisWeek: number;
    winRateDisplay: string;
    winRateSub: string;
    squadStreakDays: number;
    streakProgress: number;
  };
  stageCounts: { status: string; count: number }[];
};

export async function loadCommandCenterPayload(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: CommandCenterPayload | null; error: string | null }> {
  let leadsRaw: unknown[] | null = null;
  let leadsErr: { message?: string } | null = null;
  {
    const tiers = [SELECT_WITH_STALE_AND_LAST_ACT, SELECT_WITH_LAST_ACT, SELECT];
    for (let i = 0; i < tiers.length; i += 1) {
      const r = await supabase
        .from("leads")
        .select(tiers[i])
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(commandCenterLeadsLimit());
      if (!r.error) {
        leadsRaw = r.data as unknown[] | null;
        leadsErr = null;
        break;
      }
      if (isMissingSchemaPiece(r.error) && i < tiers.length - 1) {
        continue;
      }
      leadsRaw = null;
      leadsErr = r.error;
      break;
    }
  }

  if (leadsErr) {
    return { data: null, error: leadsErr.message ?? "Failed to load leads" };
  }

  const leads = (leadsRaw ?? []) as CommandCenterLead[];

  const ownerIds = new Set<string>();
  for (const r of leads) {
    if (r.claimed_by) ownerIds.add(r.claimed_by);
    if (r.appt_scheduled_by) ownerIds.add(r.appt_scheduled_by);
    if (r.last_activity_by) ownerIds.add(r.last_activity_by);
    if (isDemoBuildClaimFeatureEnabled() && r.demo_build_claimed_by) {
      ownerIds.add(r.demo_build_claimed_by);
    }
  }
  const { data: profs } = await fetchProfilesByIds(supabase, [...ownerIds]);
  const profileLabels: Record<string, string> = {};
  for (const p of profs ?? []) {
    const t = teamProfileFromDb(p);
    profileLabels[p.id] = displayProfessionalName(p.id, t);
  }

  const ownerRoles: Record<string, "owner" | "team"> = {};
  if (ownerIds.size > 0) {
    const { data: roleRows, error: roleErr } = await (supabase as any)
      .from("team_roles")
      .select("user_id, role, account_name")
      .in("user_id", [...ownerIds]);
    if (!roleErr) {
      for (const row of roleRows ?? []) {
        const uid = (row as { user_id?: string }).user_id;
        const role = (row as { role?: string }).role;
        const acc = String((row as { account_name?: string | null }).account_name ?? "").trim();
        if (!uid) continue;
        if (role === "owner" || role === "team") {
          ownerRoles[uid] = role;
        }
        if (acc) {
          const pRow = (profs ?? []).find((x) => x.id === uid);
          const hasProfName = !!(pRow?.full_name?.trim() || pRow?.first_name?.trim() || pRow?.email?.trim());
          if (!pRow || !hasProfName) {
            profileLabels[uid] = acc;
          }
        }
      }
    }
  }

  const { dayStr, nextDayStr } = utcCalendarDayBounds();
  const weekEndDay = addDaysYmd(dayStr, 7);
  const { weekStartIso, weekEndExclusiveIso } = utcCalendarWeekBounds();

  const [{ count: apptToday = 0 }, { count: apptNext7 = 0 }, streakMetrics, heldWeek] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("appt_date", dayStr)
      .lt("appt_date", nextDayStr),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("appt_date", nextDayStr)
      .lte("appt_date", weekEndDay),
    loadSquadStreakMetrics(supabase, userId),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "Appt Set")
      .gte("appt_date", weekStartIso)
      .lt("appt_date", weekEndExclusiveIso),
  ]);

  const { squadStreakDays, streakProgress } = streakMetrics;

  const activeLeads = leads.filter((l) => (l.status ?? "").trim() !== "Not Interested");
  const openCount = activeLeads.length;

  const interestedOrAppt = leads.filter((l) => {
    const s = (l.status ?? "").trim().toLowerCase();
    return s === "interested" || s === "appt set";
  }).length;
  const denom = leads.filter((l) => (l.status ?? "").trim().toLowerCase() !== "not interested").length;
  const winRatePct = denom > 0 ? Math.round((interestedOrAppt / denom) * 100) : 0;

  const apptsHeldThisWeek = heldWeek.count ?? 0;

  /** Website-booked / non-canonical stages roll into Appt Set for board + distribution. */
  const stageCounts: { status: string; count: number }[] = LEAD_STATUSES.map((s) => {
    if (s === "Appt Set") {
      const appt = leads.filter((l) => (l.status ?? "").trim() === "Appt Set").length;
      const web = leads.filter((l) => !(LEAD_STATUSES as readonly string[]).includes((l.status ?? "").trim())).length;
      return { status: s, count: appt + web };
    }
    return { status: s, count: leads.filter((l) => (l.status ?? "").trim() === s).length };
  });

  return {
    data: {
      leads,
      profileLabels,
      ownerRoles,
      metrics: {
        openPipelineDisplay: `${openCount.toLocaleString()}`,
        openPipelineSub: `${openCount} active opportunities · excl. Not interested`,
        appointmentsToday: apptToday ?? 0,
        apptsNext7Days: apptNext7 ?? 0,
        apptsHeldThisWeek,
        winRateDisplay: `${winRatePct}%`,
        winRateSub: `Interested + Appt Set vs active (excl. Not interested)`,
        squadStreakDays,
        streakProgress,
      },
      stageCounts,
    },
    error: null,
  };
}
