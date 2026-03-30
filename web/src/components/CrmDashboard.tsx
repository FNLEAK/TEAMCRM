"use client";

/**
 * Lead Command — main CRM shell.
 * Row click opens LeadDetailDrawer (segmented status, appointment picker, activity timeline, Live presence).
 */

import Link from "next/link";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { upsertTeamProfileFromSession } from "@/lib/syncTeamProfile";
import { CommandCenterBar } from "@/components/CommandCenterBar";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { buildTelHref } from "@/lib/phone";
import { mergeLeadFromRealtime } from "@/lib/realtimeLead";
import { getLeadSelectColumns } from "@/lib/leadSelectColumns";
import { DailyBriefingBanner } from "@/components/DailyBriefingBanner";
import { TeamCalendarSection } from "@/components/TeamCalendarSection";
import { WeeklyPerformanceCard, type WeeklyApptRank } from "@/components/WeeklyPerformanceCard";
import { utcCalendarDayBounds } from "@/lib/utcDayBounds";
import {
  calendarSchedulerInitialLetter,
  displayFirstName,
  displayProfessionalName,
  formatLiveViewerMonogram,
} from "@/lib/profileDisplay";
import { fetchProfilesByIds } from "@/lib/profileSelect";
import {
  COMPANY_SEARCH_MAX_LEN,
  isApptLeadLockedForViewer,
  isFavoritedBy,
  normalizeFavoritedIds,
  teamProfileFromDb,
  type LeadRow,
  type TeamProfile,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from "@/lib/leadTypes";

const MemoTeamCalendarSection = memo(TeamCalendarSection);
const MemoWeeklyPerformanceCard = memo(WeeklyPerformanceCard);

function buildListPath(pageNum: number, favoritesOnly: boolean, q: string): string {
  const p = new URLSearchParams();
  p.set("page", String(pageNum));
  if (favoritesOnly) p.set("favorites", "1");
  const trimmed = q.trim();
  if (trimmed) p.set("q", trimmed);
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

type CrmDashboardProps = {
  leads: LeadRow[];
  totalCount: number;
  page: number;
  favoritesOnly: boolean;
  searchQuery: string;
  userId: string;
  userDisplayName: string;
  welcomeFirstName: string;
  profileMap: Record<string, TeamProfile>;
  weeklyApptLeaderboard: WeeklyApptRank[];
  calendarTeamMemberOrder: string[];
  stats: {
    totalLeads: number;
    appointmentsToday: number;
    favoritesCount: number;
  };
};

function favoritesAsArrayMode() {
  return process.env.NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY === "true";
}

function toggleFavoritedValue(
  raw: LeadRow["favorited_by"],
  authUid: string,
): string[] | string | null {
  if (!favoritesAsArrayMode()) {
    const s = typeof raw === "string" ? raw : null;
    if (s && s === authUid) return null;
    return authUid;
  }

  const ids = Array.isArray(raw)
    ? (raw as string[]).filter(Boolean)
    : typeof raw === "string" && raw.length > 0
      ? [raw]
      : [];
  if (ids.includes(authUid)) {
    return ids.filter((id) => id !== authUid);
  }
  return [...ids, authUid];
}

function formatStat(n: number) {
  return new Intl.NumberFormat().format(n);
}

export function CrmDashboard({
  leads: initialLeads,
  totalCount,
  page,
  favoritesOnly,
  searchQuery,
  userId,
  userDisplayName,
  welcomeFirstName,
  profileMap,
  weeklyApptLeaderboard,
  calendarTeamMemberOrder,
  stats,
}: CrmDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [leads, setLeads] = useState(initialLeads);
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [profileExtras, setProfileExtras] = useState<Record<string, TeamProfile>>({});
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [apptsToday, setApptsToday] = useState(stats.appointmentsToday);
  const apptStatsTimer = useRef<number | null>(null);

  const drawerLeadLive = drawerLead
    ? (leads.find((l) => l.id === drawerLead.id) ?? drawerLead)
    : null;

  useEffect(() => {
    setApptsToday(stats.appointmentsToday);
  }, [stats.appointmentsToday]);

  const scheduleApptStatsRefresh = useCallback(() => {
    if (apptStatsTimer.current != null) window.clearTimeout(apptStatsTimer.current);
    apptStatsTimer.current = window.setTimeout(async () => {
      const supabase = createSupabaseBrowserClient();
      const { dayStr, nextDayStr } = utcCalendarDayBounds();
      const { count, error } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .gte("appt_date", dayStr)
        .lt("appt_date", nextDayStr);
      if (error) return;
      const next = count ?? 0;
      setApptsToday(next);
    }, 300);
  }, []);

  /** Stats strip + full calendar refetch — use after local saves from drawer / command center. */
  const bumpStatsAndCalendar = useCallback(() => {
    scheduleApptStatsRefresh();
    setCalendarRefreshKey((k) => k + 1);
  }, [scheduleApptStatsRefresh]);

  const bumpCalendarOnly = useCallback(() => {
    setCalendarRefreshKey((k) => k + 1);
  }, []);

  /** Avoid refetching the calendar on every `leads` column change (notes, etc.) — major flicker fix. */
  function leadRowUpdateAffectsCalendar(
    oldRow: Record<string, unknown> | undefined,
    newRow: Record<string, unknown>,
  ): boolean {
    if (!oldRow) return true;
    const keys = ["appt_date", "appt_scheduled_by", "status", "claimed_by"] as const;
    return keys.some((k) => oldRow[k] !== newRow[k]);
  }

  function leadRowUpdateAffectsApptTodayCount(
    oldRow: Record<string, unknown> | undefined,
    newRow: Record<string, unknown>,
  ): boolean {
    if (!oldRow) return true;
    return oldRow.appt_date !== newRow.appt_date || oldRow.status !== newRow.status;
  }

  useEffect(() => {
    return () => {
      if (apptStatsTimer.current != null) window.clearTimeout(apptStatsTimer.current);
    };
  }, []);

  const mergedProfileMap = useMemo(
    () => ({ ...profileMap, ...profileExtras }),
    [profileMap, profileExtras],
  );

  const viewerDisplayName = useMemo(() => {
    const fromProfile = displayProfessionalName(userId, mergedProfileMap[userId]);
    const w = welcomeFirstName.trim();
    if (fromProfile.startsWith("Member ") && w) return w;
    return fromProfile;
  }, [userId, mergedProfileMap, welcomeFirstName]);

  const viewerMonogram = useMemo(
    () => formatLiveViewerMonogram(mergedProfileMap[userId]?.initials, viewerDisplayName),
    [mergedProfileMap, userId, viewerDisplayName],
  );
  const profileMapRef = useRef(mergedProfileMap);
  profileMapRef.current = mergedProfileMap;

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    setProfileExtras({});
  }, [profileMap]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("crm-leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) {
              setLeads((prev) => prev.filter((l) => l.id !== oldId));
              setDrawerLead((d) => (d?.id === oldId ? null : d));
              bumpStatsAndCalendar();
            }
            return;
          }
          if (payload.eventType === "INSERT") {
            bumpStatsAndCalendar();
          }
          if (payload.eventType === "UPDATE") {
            const raw = payload.new as Record<string, unknown>;
            const old = payload.old as Record<string, unknown> | undefined;
            const rowId = raw.id as string;
            setLeads((prev) =>
              prev.map((l) => (l.id === rowId ? mergeLeadFromRealtime(l, raw) : l)),
            );
            setDrawerLead((d) =>
              d?.id === rowId ? mergeLeadFromRealtime(d, raw) : d,
            );

            if (leadRowUpdateAffectsCalendar(old, raw)) {
              bumpCalendarOnly();
            }
            if (leadRowUpdateAffectsApptTodayCount(old, raw)) {
              scheduleApptStatsRefresh();
            }

            const favRaw = raw.favorited_by;
            const ids =
              Array.isArray(favRaw) ? (favRaw as string[]) : typeof favRaw === "string" ? [favRaw] : [];
            const sched = raw.appt_scheduled_by as string | null | undefined;
            const claimed = raw.claimed_by as string | null | undefined;
            const needSet = new Set<string>();
            for (const uid of ids) needSet.add(uid);
            if (sched) needSet.add(sched);
            if (claimed) needSet.add(claimed);
            const need = [...needSet].filter((uid) => !profileMapRef.current[uid]);
            if (need.length === 0) return;
            const { data } = await fetchProfilesByIds(supabase, need);
            if (!data?.length) return;
            setProfileExtras((prev) => {
              const next = { ...prev };
              for (const p of data) {
                const id = p.id as string;
                next[id] = teamProfileFromDb({
                  id,
                  first_name: p.first_name ?? null,
                  full_name: p.full_name ?? null,
                  avatar_initials: p.avatar_initials ?? null,
                });
              }
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bumpCalendarOnly, bumpStatsAndCalendar, scheduleApptStatsRefresh]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hrefPrev = useMemo(
    () => buildListPath(page - 1, favoritesOnly, searchQuery),
    [page, favoritesOnly, searchQuery],
  );
  const hrefNext = useMemo(
    () => buildListPath(page + 1, favoritesOnly, searchQuery),
    [page, favoritesOnly, searchQuery],
  );

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const openLeadById = useCallback(async (leadId: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("leads")
      .select(getLeadSelectColumns())
      .eq("id", leadId)
      .maybeSingle();
    if (error) {
      console.error("[CRM] open lead by id:", error.message);
      return;
    }
    if (!data || typeof data !== "object" || !("id" in data)) return;
    setDrawerLead(data as LeadRow);
  }, []);

  const syncLeadInState = useCallback((id: string, patch: Partial<LeadRow>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDrawerLead((d) => (d?.id === id ? { ...d, ...patch } : d));
  }, []);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const openDrawerForLead = useCallback((row: LeadRow) => setDrawerLead(row), []);

  const handleCalendarOpenLead = useCallback(
    (id: string) => void openLeadById(id),
    [openLeadById],
  );

  const closeDrawer = useCallback(() => setDrawerLead(null), []);

  const handleToggleFavorite = useCallback(
    async (e: MouseEvent<Element>, row: LeadRow) => {
      e.stopPropagation();
      if (!userId) return;

      const supabase = createSupabaseBrowserClient();
      const nextVal = toggleFavoritedValue(row.favorited_by, userId);
      syncLeadInState(row.id, { favorited_by: nextVal as LeadRow["favorited_by"] });

      const { error } = await supabase.from("leads").update({ favorited_by: nextVal }).eq("id", row.id);

      if (error) {
        syncLeadInState(row.id, { favorited_by: row.favorited_by });
        console.error(error);
        return;
      }
      void upsertTeamProfileFromSession(supabase);
    },
    [userId, syncLeadInState],
  );

  const apptsActive = apptsToday > 0;
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,rgba(255,255,255,0.03),transparent)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <DailyBriefingBanner />

        <header className="mb-8">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Pipeline</p>
              <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
                Web Friendly CRM
              </h1>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              <CommandCenterBar onDataChanged={refresh} compact />
              <div className="hidden h-8 w-px bg-white/10 sm:block" aria-hidden />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-md border border-white/10 bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-zinc-400">
                  <span className="text-zinc-600">Signed in as </span>
                  <span className="font-medium text-zinc-200">{userDisplayName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-md border border-white/10 bg-[#0a0a0a] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/15 hover:bg-white/[0.04]"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-zinc-400">
            Welcome, <span className="text-zinc-200">{welcomeFirstName}</span>
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
            Quick adds and CSV import — open any row for status, scheduling, and live presence.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total leads" value={formatStat(stats.totalLeads)} />
          <AppointmentsStatCard
            label="Appointments today"
            value={formatStat(apptsToday)}
            active={apptsActive}
          />
          <StatCard label="My favorites" value={formatStat(stats.favoritesCount)} />
        </section>

        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] ring-1 ring-white/10">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-[1.75rem] flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-200">Leads</h2>
              <span
                className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90"
                title="Table syncs via Supabase Realtime"
              >
                Live
              </span>
              <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {formatStat(totalCount)} {hasSearch ? "matches" : "in view"}
              </span>
              {/* Always reserve width so isPending doesn’t reflow the row and push the calendar */}
              <span
                className={clsx(
                  "inline-block whitespace-nowrap text-xs tabular-nums",
                  isPending ? "text-zinc-500" : "pointer-events-none select-none opacity-0",
                )}
                aria-live="polite"
                aria-hidden={!isPending}
              >
                Syncing…
              </span>
            </div>
            <FavoritesToggle favoritesOnly={favoritesOnly} searchQuery={searchQuery} />
          </div>

          <DebouncedCompanySearch favoritesOnly={favoritesOnly} searchQuery={searchQuery} />

          <LeadsTableSection
            leads={leads}
            mergedProfileMap={mergedProfileMap}
            userId={userId}
            hasSearch={hasSearch}
            searchQuery={searchQuery}
            favoritesOnly={favoritesOnly}
            page={page}
            totalPages={totalPages}
            hrefPrev={hrefPrev}
            hrefNext={hrefNext}
            onRowClick={openDrawerForLead}
            onToggleFavorite={handleToggleFavorite}
          />
        </section>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start lg:gap-10">
          <MemoTeamCalendarSection
            userId={userId}
            onOpenLeadById={handleCalendarOpenLead}
            teamMemberColorOrder={calendarTeamMemberOrder}
            profileMap={mergedProfileMap}
            calendarRefreshKey={calendarRefreshKey}
          />
          <MemoWeeklyPerformanceCard
            ranks={weeklyApptLeaderboard}
            profileMap={mergedProfileMap}
            currentUserId={userId}
            teamMemberColorOrder={calendarTeamMemberOrder}
          />
        </div>
      </div>

      {drawerLeadLive ? (
        <LeadDetailDrawer
          lead={drawerLeadLive}
          userId={userId}
          viewerDisplayName={viewerDisplayName}
          viewerMonogram={viewerMonogram}
          profileMap={mergedProfileMap}
          onClose={closeDrawer}
          syncLeadInState={syncLeadInState}
          refresh={refresh}
          onLeadMetaChanged={bumpStatsAndCalendar}
        />
      ) : null}
    </div>
  );
}

function DebouncedCompanySearch({
  favoritesOnly,
  searchQuery,
}: {
  favoritesOnly: boolean;
  searchQuery: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(searchQuery);

  useEffect(() => {
    setValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = value.trim().slice(0, COMPANY_SEARCH_MAX_LEN);
      const cur = searchQuery.trim();
      if (next === cur) return;
      const p = new URLSearchParams();
      p.set("page", "1");
      if (favoritesOnly) p.set("favorites", "1");
      if (next) p.set("q", next);
      const qs = p.toString();
      startTransition(() => router.replace(qs ? `/?${qs}` : "/"));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value, favoritesOnly, searchQuery, router]);

  const clearHref = buildListPath(1, favoritesOnly, "");

  return (
    <div className="border-b border-white/[0.06] bg-black/25 px-5 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <SearchGlyph className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, COMPANY_SEARCH_MAX_LEN))}
            maxLength={COMPANY_SEARCH_MAX_LEN}
            placeholder="Search by business name…"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-zinc-950/80 py-2 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-inner shadow-black/40 transition focus:border-emerald-500/35 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
            aria-label="Search companies by name"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pending ? (
            <span className="text-xs text-zinc-500" aria-live="polite">
              Searching…
            </span>
          ) : null}
          {value.trim() ? (
            <Link
              href={clearHref}
              className="inline-flex h-11 items-center rounded-xl border border-white/[0.08] px-4 text-sm font-medium text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FavoriteStarCell({
  row,
  userId,
  profileMap,
  onToggle,
}: {
  row: LeadRow;
  userId: string;
  profileMap: Record<string, TeamProfile>;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const ids = normalizeFavoritedIds(row.favorited_by).slice(0, 5);
  const filled = isFavoritedBy(row, userId);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={filled ? "Remove favorite" : "Add favorite"}
        onClick={onToggle}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-amber-400 transition hover:border-amber-500/35 hover:bg-amber-500/10"
      >
        <StarIcon filled={filled} />
      </button>
      {ids.length > 0 ? (
        <div className="flex max-w-[4.5rem] flex-wrap justify-center gap-0.5">
          {ids.map((id) => (
            <span
              key={id}
              title={profileMap[id]?.label ?? id.slice(0, 8)}
              className="flex h-4 min-w-[1rem] items-center justify-center rounded bg-zinc-700/90 px-0.5 text-[8px] font-bold uppercase text-zinc-100 ring-1 ring-white/10"
            >
              {(() => {
                const p = profileMap[id];
                const letter = calendarSchedulerInitialLetter(p);
                return letter === "?" ? "·" : letter;
              })()}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ClaimedByBadge({ name }: { name: string }) {
  return (
    <span className="crm-claimed-badge inline-flex max-w-[200px] items-center gap-1.5 rounded-full border border-rose-400/40 bg-gradient-to-r from-rose-500/20 to-fuchsia-600/15 px-2.5 py-1 text-[10px] font-semibold leading-tight text-rose-100 shadow-[0_0_20px_-4px_rgba(244,63,94,0.55)]">
      <svg className="h-3 w-3 shrink-0 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <span className="truncate">
        Claimed by <span className="text-white">{name}</span>
      </span>
    </span>
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

const StatCard = memo(function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a] px-5 py-6 ring-1 ring-white/10">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-100">{value}</p>
    </div>
  );
});

const AppointmentsStatCard = memo(function AppointmentsStatCard({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-[#0a0a0a] px-5 py-6 ring-1 ring-white/10 ${
        active ? "border-emerald-800/50" : "border-white/10"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
          active ? "text-emerald-400" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
});

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-zinc-600">—</span>;
  }
  const low = status.trim().toLowerCase();
  const isAppt = low === "appt set";
  const isClaimed = low === "claimed";
  const isNotInterested = low === "not interested";
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        isAppt
          ? "crm-status-pill-appt-set bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/40"
          : isClaimed
            ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/35"
            : isNotInterested
              ? "bg-zinc-600/25 text-zinc-400 ring-1 ring-zinc-500/30"
              : "bg-white/[0.06] text-zinc-300 ring-1 ring-white/[0.06]"
      }`}
    >
      {status}
    </span>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      className={filled ? "text-amber-400" : "text-zinc-500"}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function PaginationLink({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (disabled) {
    return (
      <span className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm text-zinc-600">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.push(href))}
      className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-70"
    >
      {label}
    </button>
  );
}

const LeadsTableSection = memo(function LeadsTableSection({
  leads,
  mergedProfileMap,
  userId,
  hasSearch,
  searchQuery,
  favoritesOnly,
  page,
  totalPages,
  hrefPrev,
  hrefNext,
  onRowClick,
  onToggleFavorite,
}: {
  leads: LeadRow[];
  mergedProfileMap: Record<string, TeamProfile>;
  userId: string;
  hasSearch: boolean;
  searchQuery: string;
  favoritesOnly: boolean;
  page: number;
  totalPages: number;
  hrefPrev: string;
  hrefNext: string;
  onRowClick: (row: LeadRow) => void;
  onToggleFavorite: (e: MouseEvent<Element>, row: LeadRow) => void | Promise<void>;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-black/20 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="px-5 py-3.5 font-medium">Company</th>
              <th className="px-5 py-3.5 font-medium">Phone</th>
              <th className="px-5 py-3.5 font-medium">Website</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
              <th className="w-[5.5rem] px-5 py-3.5 text-center font-medium">Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-20 text-center text-sm text-zinc-500">
                  {hasSearch
                    ? `No companies match “${searchQuery}”.`
                    : `No leads on this page${favoritesOnly ? " (favorites only)" : ""}.`}
                </td>
              </tr>
            ) : (
              leads.map((row) => {
                const telHref = row.phone ? buildTelHref(row.phone) : null;
                const apptLocked = isApptLeadLockedForViewer(row, userId);
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick(row)}
                    title={
                      apptLocked
                        ? "Appointment set by a teammate — opening the drawer is view-only for pipeline & schedule"
                        : undefined
                    }
                    className={clsx(
                      "cursor-pointer transition-colors hover:bg-emerald-950/15",
                      apptLocked && "opacity-[0.42] saturate-50 hover:bg-zinc-900/40",
                    )}
                  >
                    <td className="px-5 py-4 align-top font-medium text-zinc-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.company_name ?? "—"}</span>
                        {row.claimed_by ? (
                          <ClaimedByBadge
                            name={displayProfessionalName(
                              row.claimed_by,
                              mergedProfileMap[row.claimed_by],
                            )}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      {row.phone && telHref ? (
                        <a
                          href={telHref}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
                        >
                          {row.phone}
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-4 align-top">
                      {row.website ? (
                        <a
                          href={
                            row.website.startsWith("http")
                              ? row.website
                              : `https://${row.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-emerald-400/90 hover:text-emerald-300 hover:underline"
                        >
                          {row.website}
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-center align-top">
                      <FavoriteStarCell
                        row={row}
                        userId={userId}
                        profileMap={mergedProfileMap}
                        onToggle={(e) => void onToggleFavorite(e, row)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-col gap-3 border-t border-white/[0.06] bg-black/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Page {page} of {totalPages} · {PAGE_SIZE} per page · click a row for drawer
        </p>
        <div className="flex gap-2">
          <PaginationLink disabled={page <= 1} href={hrefPrev} label="Previous" />
          <PaginationLink disabled={page >= totalPages} href={hrefNext} label="Next" />
        </div>
      </footer>
    </>
  );
});

function FavoritesToggle({
  favoritesOnly,
  searchQuery,
}: {
  favoritesOnly: boolean;
  searchQuery: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hrefAll = buildListPath(1, false, searchQuery);
  const hrefFav = buildListPath(1, true, searchQuery);

  return (
    <div className="inline-flex rounded-xl border border-white/[0.08] bg-black/40 p-1 ring-1 ring-black/40">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.push(hrefAll))}
        className={`rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-60 ${
          !favoritesOnly ? "bg-white/10 text-white shadow-inner" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        All
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.push(hrefFav))}
        className={`rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-60 ${
          favoritesOnly ? "bg-amber-500/20 text-amber-200 shadow-inner" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Favorites
      </button>
    </div>
  );
}
