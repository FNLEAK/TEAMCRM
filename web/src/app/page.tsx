import { CrmDashboard } from "@/components/CrmDashboard";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  COMPANY_SEARCH_MAX_LEN,
  escapeForIlike,
  normalizeFavoritedIds,
  teamProfileFromDb,
  type LeadRow,
  type TeamProfile,
  PAGE_SIZE,
} from "@/lib/leadTypes";
import { getLeadSelectColumns } from "@/lib/leadSelectColumns";
import {
  PROFILE_COLUMNS_CORE,
  PROFILE_COLUMNS_FULL,
  isMissingColumnError,
  type ProfileRow,
} from "@/lib/profileSelect";
import {
  utcCalendarDayBounds,
  utcCalendarWeekBounds,
  utcPreviousCalendarWeekBounds,
} from "@/lib/utcDayBounds";
import { redirect } from "next/navigation";

type SearchParams = {
  page?: string;
  favorites?: string;
  q?: string;
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

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090b] px-6 text-center text-zinc-300">
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

  const { count: totalLeads = 0 } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });

  const { dayStr, nextDayStr } = utcCalendarDayBounds();
  const { count: appointmentsToday = 0, error: apptErr } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("appt_date", dayStr)
    .lt("appt_date", nextDayStr);

  if (apptErr) {
    console.warn("[CRM] appt_date filter failed — check column type and RLS:", apptErr.message);
  }

  /** Use `.contains` only when `favorited_by` is uuid[]/jsonb; single uuid column needs `.eq`. */
  const favoritesAsArray = process.env.NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY === "true";

  let favoritesCount = 0;
  let favQ = supabase.from("leads").select("*", { count: "exact", head: true });
  favQ = favoritesAsArray ? favQ.contains("favorited_by", [userId]) : favQ.eq("favorited_by", userId);
  const { count: favCt } = await favQ;
  favoritesCount = favCt ?? 0;

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

  const { data, error, count } = await dataQuery
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    console.error("[CRM] leads query:", error.message);
  }

  const leads = (data as LeadRow[] | null) ?? [];
  const totalCount = count ?? 0;

  const teamIds = collectTeamIds(leads);

  const { weekStartIso, weekEndExclusiveIso } = utcCalendarWeekBounds();
  const { data: weekApptRows, error: weekApptErr } = await supabase
    .from("leads")
    .select("appt_scheduled_by")
    .eq("status", "Appt Set")
    .not("appt_scheduled_by", "is", null)
    .gte("appt_date", weekStartIso)
    .lt("appt_date", weekEndExclusiveIso);

  if (weekApptErr) {
    console.warn("[CRM] weekly appt leaderboard query:", weekApptErr.message);
  }

  const { weekStartIso: prevWeekStart, weekEndExclusiveIso: prevWeekEndEx } = utcPreviousCalendarWeekBounds();
  const { data: prevWeekApptRows, error: prevWeekApptErr } = await supabase
    .from("leads")
    .select("appt_scheduled_by")
    .eq("status", "Appt Set")
    .not("appt_scheduled_by", "is", null)
    .gte("appt_date", prevWeekStart)
    .lt("appt_date", prevWeekEndEx);

  if (prevWeekApptErr) {
    console.warn("[CRM] previous week appt leaderboard query:", prevWeekApptErr.message);
  }

  const weekCounts = new Map<string, number>();
  for (const row of weekApptRows ?? []) {
    const sid = (row as { appt_scheduled_by?: string | null }).appt_scheduled_by;
    if (sid) weekCounts.set(sid, (weekCounts.get(sid) ?? 0) + 1);
  }

  const prevWeekCounts = new Map<string, number>();
  for (const row of prevWeekApptRows ?? []) {
    const sid = (row as { appt_scheduled_by?: string | null }).appt_scheduled_by;
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

  let allProfs: ProfileRow[] | null = null;
  let allProfErr: { message: string } | null = null;

  {
    const attemptFull = await supabase.from("profiles").select(PROFILE_COLUMNS_FULL);
    const res =
      attemptFull.error && isMissingColumnError(attemptFull.error.message)
        ? await supabase.from("profiles").select(PROFILE_COLUMNS_CORE)
        : attemptFull;
    allProfs = (res.data as ProfileRow[] | null) ?? null;
    allProfErr = res.error;
  }

  if (!allProfErr && allProfs?.length) {
    for (const p of allProfs) {
      const id = p.id as string;
      profileMap[id] = teamProfileFromDb({
        id,
        first_name: p.first_name ?? null,
        full_name: p.full_name ?? null,
        avatar_initials: p.avatar_initials ?? null,
      });
    }
  } else {
    if (allProfErr && !String(allProfErr.message).toLowerCase().includes("permission")) {
      console.warn("[CRM] full profiles list unavailable — using per-id fetch:", allProfErr.message);
    }
    const need = [...profileIdSet].filter(Boolean);
    if (need.length > 0) {
      const batchFull = await supabase.from("profiles").select(PROFILE_COLUMNS_FULL).in("id", need);
      const batch =
        batchFull.error && isMissingColumnError(batchFull.error.message)
          ? await supabase.from("profiles").select(PROFILE_COLUMNS_CORE).in("id", need)
          : batchFull;
      if (batch.error) {
        if (!String(batch.error.message).toLowerCase().includes("permission")) {
          console.warn("[CRM] profiles batch lookup failed — check RLS and columns:", batch.error.message);
        }
      } else {
        for (const p of (batch.data ?? []) as ProfileRow[]) {
          const id = p.id as string;
          profileMap[id] = teamProfileFromDb({
            id,
            first_name: p.first_name ?? null,
            full_name: p.full_name ?? null,
            avatar_initials: p.avatar_initials ?? null,
          });
        }
      }
    }
  }

  for (const id of profileIdSet) {
    if (!profileMap[id]) {
      profileMap[id] = {
        initials: "·",
        label: id.replace(/-/g, "").slice(0, 8),
        fullName: "",
        firstName: "",
      };
    }
  }

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
  if (calendarTeamMemberOrder.length === 0 && allProfs && allProfs.length > 0) {
    calendarTeamMemberOrder = [...allProfs]
      .map((p) => p.id as string)
      .sort()
      .slice(0, 5);
  }

  return (
    <CrmDashboard
      leads={leads}
      totalCount={totalCount}
      page={page}
      favoritesOnly={favoritesOnly}
      searchQuery={searchQuery}
      userId={userId}
      userDisplayName={userDisplayName}
      welcomeFirstName={welcomeFirstNameResolved}
      profileMap={profileMap}
      weeklyApptLeaderboard={weeklyApptLeaderboard}
      calendarTeamMemberOrder={calendarTeamMemberOrder}
      stats={{
        totalLeads: totalLeads ?? 0,
        appointmentsToday: apptErr ? 0 : (appointmentsToday ?? 0),
        favoritesCount,
      }}
    />
  );
}
