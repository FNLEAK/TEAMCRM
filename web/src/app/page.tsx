import dynamic from "next/dynamic";
import { RouteChunkFallback } from "@/components/RouteChunkFallback";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  COMPANY_SEARCH_MAX_LEN,
  escapeForIlike,
  normalizeFavoritedIds,
  parseLeadStatusFilterParam,
  teamProfileFromDb,
  type LeadRow,
  type TeamProfile,
  PAGE_SIZE,
} from "@/lib/leadTypes";
import { getLeadSelectColumns } from "@/lib/leadSelectColumns";
import { enrichProfileMapWithTeamRoles, fetchProfilesByIds } from "@/lib/profileSelect";
import {
  utcCalendarDayBounds,
  utcCalendarWeekBounds,
  utcPreviousCalendarWeekBounds,
} from "@/lib/utcDayBounds";
import { redirect } from "next/navigation";
import { canManageRoles } from "@/lib/roleAccess";

const CrmDashboard = dynamic(
  () => import("@/components/CrmDashboard").then((m) => ({ default: m.CrmDashboard })),
  { loading: () => <RouteChunkFallback label="Loading workspace…" /> },
);

type SearchParams = {
  page?: string;
  favorites?: string;
  q?: string;
  status?: string;
  openLead?: string;
};

function normalizeSearchQuery(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  return t.length > COMPANY_SEARCH_MAX_LEN ? t.slice(0, COMPANY_SEARCH_MAX_LEN) : t;
}

function collectTeamIds(rows: LeadRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    normalizeFavoritedIds(r.favorited_by).forEach((id) => s.add(id));
    if (r.claimed_by) s.add(r.claimed_by);
    if (r.appt_scheduled_by) s.add(r.appt_scheduled_by);
  }
  return [...s];
}

/** Fixed calendar color order (max 5). Env overrides auto-sort from profiles. */
function calendarTeamMemberOrderFromEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_CALENDAR_TEAM_USER_IDS?.trim();
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean).slice(0, 5);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const favoritesOnly = sp.favorites === "1";
  const searchQuery = normalizeSearchQuery(typeof sp.q === "string" ? sp.q : undefined);
  const statusFilter = parseLeadStatusFilterParam(typeof sp.status === "string" ? sp.status : undefined);
  const statusFilterParam = statusFilter ?? "";
  const openLeadRaw = typeof sp.openLead === "string" ? sp.openLead.trim() : "";
  const initialOpenLeadId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(openLeadRaw)
      ? openLeadRaw
      : null;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[var(--color-canvas)] px-6 text-center text-zinc-300">
        <h1 className="text-xl font-semibold text-white">Supabase env missing</h1>
        <p className="max-w-md text-sm text-zinc-400">
          Add <code className="text-zinc-200">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-zinc-200">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="text-zinc-200">web/.env.local</code>, then restart the dev server.
        </p>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const firstName =
    typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
  const welcomeFirstName =
    firstName ||
    (typeof meta?.full_name === "string" ? meta.full_name.trim() : "") ||
    (typeof meta?.name === "string" ? meta.name.trim() : "") ||
    user.email?.split("@")[0] ||
    "there";

  const userDisplayName =
    firstName ||
    (typeof meta?.full_name === "string" ? meta.full_name.trim() : "") ||
    (typeof meta?.name === "string" ? meta.name.trim() : "") ||
    user.email?.split("@")[0] ||
    "You";
  const allowRoleApplier = await canManageRoles(supabase, userId, user.email);

  const { dayStr, nextDayStr } = utcCalendarDayBounds();

  /** Use `.contains` only when `favorited_by` is uuid[]/jsonb; single uuid column needs `.eq`. */
  const favoritesAsArray = process.env.NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY === "true";

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let dataQuery = supabase.from("leads").select(getLeadSelectColumns(), { count: "exact" });

  if (searchQuery) {
    const pattern = `%${escapeForIlike(searchQuery)}%`;
    dataQuery = dataQuery.ilike("company_name", pattern);
  }

  if (favoritesOnly) {
    dataQuery = favoritesAsArray
      ? dataQuery.contains("favorited_by", [userId])
      : dataQuery.eq("favorited_by", userId);
  }

  if (statusFilter) {
    dataQuery = dataQuery.eq("status", statusFilter);
  }

  const { weekStartIso, weekEndExclusiveIso } = utcCalendarWeekBounds();
  const { weekStartIso: prevWeekStart, weekEndExclusiveIso: prevWeekEndEx } = utcPreviousCalendarWeekBounds();

  let favQ = supabase.from("leads").select("*", { count: "exact", head: true });
  favQ = favoritesAsArray ? favQ.contains("favorited_by", [userId]) : favQ.eq("favorited_by", userId);

  const [totalLeadsRes, apptRes, favRes, leadsRes, weekClosedRes, prevWeekClosedRes] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("appt_date", dayStr)
      .lt("appt_date", nextDayStr),
    favQ,
    (() => {
      let q = dataQuery;
      if (process.env.NEXT_PUBLIC_LEADS_HAS_HIGH_PRIORITY !== "false") {
        q = q.order("is_high_priority", { ascending: false, nullsFirst: false });
      }
      return q.order("created_at", { ascending: false, nullsFirst: false }).range(from, to);
    })(),
    (supabase as any)
      .from("closed_deals")
      .select("requested_by")
      .eq("approval_status", "approved")
      .not("requested_by", "is", null)
      .gte("approved_at", weekStartIso)
      .lt("approved_at", weekEndExclusiveIso),
    (supabase as any)
      .from("closed_deals")
      .select("requested_by")
      .eq("approval_status", "approved")
      .not("requested_by", "is", null)
      .gte("approved_at", prevWeekStart)
      .lt("approved_at", prevWeekEndEx),
  ]);

  const totalLeads = totalLeadsRes.count ?? 0;
  const appointmentsToday = apptRes.count ?? 0;
  const apptErr = apptRes.error;
  const favoritesCount = favRes.count ?? 0;

  if (apptErr) {
    console.warn("[CRM] appt_date filter failed — check column type and RLS:", apptErr.message);
  }

  if (leadsRes.error) {
    console.error("[CRM] leads query:", leadsRes.error.message);
  }
  const leads = (leadsRes.data as LeadRow[] | null) ?? [];
  const totalCount = leadsRes.count ?? 0;
  const teamIds = collectTeamIds(leads);

  if (weekClosedRes.error) {
    console.warn("[CRM] weekly closed deals leaderboard query:", weekClosedRes.error.message);
  }
  if (prevWeekClosedRes.error) {
    console.warn("[CRM] previous week closed deals leaderboard query:", prevWeekClosedRes.error.message);
  }

  const weekCounts = new Map<string, number>();
  for (const row of weekClosedRes.data ?? []) {
    const sid = (row as { requested_by?: string | null }).requested_by;
    if (sid) weekCounts.set(sid, (weekCounts.get(sid) ?? 0) + 1);
  }

  const prevWeekCounts = new Map<string, number>();
  for (const row of prevWeekClosedRes.data ?? []) {
    const sid = (row as { requested_by?: string | null }).requested_by;
    if (sid) prevWeekCounts.set(sid, (prevWeekCounts.get(sid) ?? 0) + 1);
  }

  const weeklyApptLeaderboard = [...weekCounts.entries()]
    .map(([uid, count]) => ({
      userId: uid,
      count,
      previousWeekCount: prevWeekCounts.get(uid) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const leaderboardIds = weeklyApptLeaderboard.map((r) => r.userId);
  const profileIdSet = new Set<string>([userId, ...teamIds, ...leaderboardIds]);

  const profileMap: Record<string, TeamProfile> = {};
  const needProfiles = [...profileIdSet].filter(Boolean);
  if (needProfiles.length > 0) {
    const { data: profRows, error: profErr } = await fetchProfilesByIds(supabase, needProfiles);
    if (profErr && !String(profErr.message).toLowerCase().includes("permission")) {
      console.warn("[CRM] profiles lookup failed — check RLS and columns:", profErr.message);
    }
    for (const p of profRows ?? []) {
      const id = p.id as string;
      profileMap[id] = teamProfileFromDb({
        id,
        first_name: p.first_name ?? null,
        full_name: p.full_name ?? null,
        avatar_initials: p.avatar_initials ?? null,
        email: p.email ?? null,
      });
    }
  }

  for (const id of profileIdSet) {
    if (!profileMap[id]) {
      profileMap[id] = {
        initials: "·",
        label: id.replace(/-/g, "").slice(0, 8),
        fullName: "",
        firstName: "",
        email: undefined,
      };
    }
  }

  await enrichProfileMapWithTeamRoles(supabase, profileMap, [...profileIdSet]);

  const selfFromMap = profileMap[userId];
  const welcomeFromProfile =
    selfFromMap?.fullName?.trim() ||
    selfFromMap?.firstName?.trim() ||
    (selfFromMap?.label && !/^[0-9a-f]{6,12}$/i.test(selfFromMap.label.trim())
      ? selfFromMap.label.trim().split(/\s+/)[0]
      : "") ||
    "";

  const welcomeFirstNameResolved = welcomeFromProfile || welcomeFirstName;

  let calendarTeamMemberOrder = calendarTeamMemberOrderFromEnv();
  if (calendarTeamMemberOrder.length === 0) {
    calendarTeamMemberOrder = [...profileIdSet].sort().slice(0, 5);
  }

  return (
    <CrmDashboard
      leads={leads}
      totalCount={totalCount}
      page={page}
      favoritesOnly={favoritesOnly}
      searchQuery={searchQuery}
      statusFilter={statusFilterParam}
      userId={userId}
      userDisplayName={userDisplayName}
      welcomeFirstName={welcomeFirstNameResolved}
      profileMap={profileMap}
      weeklyApptLeaderboard={weeklyApptLeaderboard}
      calendarTeamMemberOrder={calendarTeamMemberOrder}
      canManageRoles={allowRoleApplier}
      initialOpenLeadId={initialOpenLeadId}
      stats={{
        totalLeads: totalLeads ?? 0,
        appointmentsToday: apptErr ? 0 : (appointmentsToday ?? 0),
        favoritesCount,
      }}
    />
  );
}
