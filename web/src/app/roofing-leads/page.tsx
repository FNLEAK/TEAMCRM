import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canManageRoles } from "@/lib/roleAccess";
import { RouteChunkFallback } from "@/components/RouteChunkFallback";
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
import { isRoofingLeadPoolEnabled } from "@/lib/roofingLeadPoolFeature";

const RoofingLeadsShell = dynamic(
  () => import("@/components/RoofingLeadsShell").then((m) => ({ default: m.RoofingLeadsShell })),
  { loading: () => <RouteChunkFallback label="Loading…" /> },
);

function calendarTeamMemberOrderFromEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_CALENDAR_TEAM_USER_IDS?.trim();
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean).slice(0, 5);
}

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

type SearchParams = {
  page?: string;
  favorites?: string;
  q?: string;
  status?: string;
};

export default async function RoofingLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-red-400">
        Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const favoritesOnly = sp.favorites === "1";
  const searchQuery = normalizeSearchQuery(typeof sp.q === "string" ? sp.q : undefined);
  const statusFilter = parseLeadStatusFilterParam(typeof sp.status === "string" ? sp.status : undefined);
  const statusFilterParam = statusFilter ?? "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const allowRoleApplier = await canManageRoles(supabase, user.id, user.email);
  if (!allowRoleApplier) redirect("/");

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const firstName = typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
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

  const userId = user.id;
  const poolEnabled = isRoofingLeadPoolEnabled();

  let calendarTeamMemberOrder = calendarTeamMemberOrderFromEnv();
  const profileIdSet = new Set<string>([userId, ...calendarTeamMemberOrder]);
  if (calendarTeamMemberOrder.length === 0) {
    calendarTeamMemberOrder = [...profileIdSet].sort().slice(0, 5);
  }

  const favoritesAsArray = process.env.NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY === "true";
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let leads: LeadRow[] = [];
  let totalCount = 0;

  if (poolEnabled) {
    let dataQuery = supabase.from("leads").select(getLeadSelectColumns(), { count: "exact" }).eq("is_roofing_lead", true);

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

    if (process.env.NEXT_PUBLIC_LEADS_HAS_HIGH_PRIORITY !== "false") {
      dataQuery = dataQuery.order("is_high_priority", { ascending: false, nullsFirst: false });
    }

    const leadsRes = await dataQuery
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (leadsRes.error) {
      console.error("[Roofing Leads] leads query:", leadsRes.error.message);
    }
    leads = (leadsRes.data as LeadRow[] | null) ?? [];
    totalCount = leadsRes.count ?? 0;

    const teamIds = collectTeamIds(leads);
    for (const id of teamIds) profileIdSet.add(id);
  }

  const profileMap: Record<string, TeamProfile> = {};
  const needProfiles = [...profileIdSet].filter(Boolean);
  if (needProfiles.length > 0) {
    const { data: profRows, error: profErr } = await fetchProfilesByIds(supabase, needProfiles);
    if (profErr && !String(profErr.message).toLowerCase().includes("permission")) {
      console.warn("[Roofing Leads] profiles lookup failed — check RLS and columns:", profErr.message);
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

  return (
    <RoofingLeadsShell
      poolEnabled={poolEnabled}
      userId={userId}
      userDisplayName={userDisplayName}
      welcomeFirstName={welcomeFirstNameResolved}
      canManageRoles={allowRoleApplier}
      profileMap={profileMap}
      calendarTeamMemberOrder={calendarTeamMemberOrder}
      leads={leads}
      totalCount={totalCount}
      page={page}
      favoritesOnly={favoritesOnly}
      searchQuery={searchQuery}
      statusFilter={statusFilterParam}
    />
  );
}
