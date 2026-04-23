"use client";

/**
 * Lead Command — main CRM shell.
 * Row click opens LeadDetailDrawer (segmented status, appointment picker, activity timeline, Live presence).
 */

import Link from "next/link";
import Image from "next/image";
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
import { DeskShell } from "@/components/DeskShell";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { OwnerRoofingLeadsFooterLink } from "@/components/OwnerRoofingLeadsFooterLink";
import { mergeLeadFromRealtime } from "@/lib/realtimeLead";
import { getLeadSelectColumns } from "@/lib/leadSelectColumns";
import { DailyBriefingBanner } from "@/components/DailyBriefingBanner";
import { TeamCalendarSection } from "@/components/TeamCalendarSection";
import { LeadsTableSection } from "@/components/LeadListTableSection";
import { WeeklyPerformanceCard, type WeeklyApptRank } from "@/components/WeeklyPerformanceCard";
import { HelpMarker } from "@/components/HelpMarker";
import { MessageCircle, Trash2 } from "lucide-react";
import { deleteLeadsBulkAction } from "@/app/actions/deleteLeadsBulkAction";
import ExpandableWarMap from "@/components/ExpandableWarMap";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import { utcCalendarDayBounds } from "@/lib/utcDayBounds";
import { displayFirstName, displayProfessionalName, formatLiveViewerMonogram } from "@/lib/profileDisplay";
import { enrichProfileMapWithTeamRoles, fetchProfilesByIds } from "@/lib/profileSelect";
import { CRM_POOL_MAIN, crmPoolFromRealtimePayload } from "@/lib/crmPool";
import { isCrmPoolColumnEnabled, isRoofingLeadPoolEnabled } from "@/lib/roofingLeadPoolFeature";
import {
  COMPANY_SEARCH_MAX_LEN,
  isFavoritedBy,
  isNewLeadStatus,
  LEAD_STATUSES,
  normalizeFavoritedIds,
  parseLeadStatusFilterParam,
  teamProfileFromDb,
  type LeadRow,
  type TeamProfile,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from "@/lib/leadTypes";

const MemoTeamCalendarSection = memo(TeamCalendarSection);
const MemoWeeklyPerformanceCard = memo(WeeklyPerformanceCard);
const DAILY_LEAD_BADGE_THRESHOLD = 3;

function buildListPath(pageNum: number, favoritesOnly: boolean, q: string, status: string): string {
  const p = new URLSearchParams();
  p.set("page", String(pageNum));
  if (favoritesOnly) p.set("favorites", "1");
  const trimmed = q.trim();
  if (trimmed) p.set("q", trimmed);
  const st = status.trim();
  if (st && parseLeadStatusFilterParam(st)) p.set("status", st);
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

type CrmDashboardProps = {
  leads: LeadRow[];
  /** Set when the server `leads` query failed (otherwise empty list is easy to misread as “no data”). */
  leadsQueryError?: string | null;
  totalCount: number;
  page: number;
  favoritesOnly: boolean;
  searchQuery: string;
  /** Canonical `LEAD_STATUSES` value or "" for all. */
  statusFilter: string;
  userId: string;
  userDisplayName: string;
  welcomeFirstName: string;
  profileMap: Record<string, TeamProfile>;
  weeklyApptLeaderboard: WeeklyApptRank[];
  calendarTeamMemberOrder: string[];
  canManageRoles: boolean;
  /** Deep link from Roofing Leads (or elsewhere): open drawer once, then strip `openLead` from the URL. */
  initialOpenLeadId?: string | null;
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
  leadsQueryError = null,
  totalCount,
  page,
  favoritesOnly,
  searchQuery,
  statusFilter,
  userId,
  userDisplayName,
  welcomeFirstName,
  profileMap,
  weeklyApptLeaderboard,
  calendarTeamMemberOrder,
  canManageRoles,
  initialOpenLeadId = null,
  stats,
}: CrmDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [leads, setLeads] = useState(initialLeads);
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [profileExtras, setProfileExtras] = useState<Record<string, TeamProfile>>({});
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [apptsToday, setApptsToday] = useState(stats.appointmentsToday);
  const [totalLeadsLive, setTotalLeadsLive] = useState(stats.totalLeads);
  const apptStatsTimer = useRef<number | null>(null);
  const calendarBumpTimer = useRef<number | null>(null);
  const [dailyLeadUpdateCount, setDailyLeadUpdateCount] = useState(0);
  const [dailyLeadUpdateAt, setDailyLeadUpdateAt] = useState<Date | null>(null);
  /** Owner-only: multi-select rows on this page for bulk delete. */
  const [bulkDeleteSelected, setBulkDeleteSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const totalLeadsKnownRef = useRef(stats.totalLeads);
  /** Avoid repeat client fetches for `claimed_by` profiles that still lack name/email after first try. */
  const claimedProfileFetchAttemptedRef = useRef<Set<string>>(new Set());
  const openLeadFromUrlConsumedRef = useRef(false);

  const drawerLeadLive = drawerLead
    ? (leads.find((l) => l.id === drawerLead.id) ?? drawerLead)
    : null;

  useEffect(() => {
    setApptsToday(stats.appointmentsToday);
  }, [stats.appointmentsToday]);

  useEffect(() => {
    setTotalLeadsLive(stats.totalLeads);
    totalLeadsKnownRef.current = stats.totalLeads;
  }, [stats.totalLeads]);

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

  const refreshTotalLeadsAndNotify = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { count, error } = await supabase.from("leads").select("*", { count: "exact", head: true });
    if (error || count == null) return;
    setTotalLeadsLive(count);
    const prev = totalLeadsKnownRef.current;
    if (count > prev) {
      const diff = count - prev;
      setDailyLeadUpdateCount((c) => c + diff);
      setDailyLeadUpdateAt(new Date());
    }
    totalLeadsKnownRef.current = count;
  }, []);

  /** Stats strip + full calendar refetch — use after local saves from drawer / command center. */
  const bumpStatsAndCalendar = useCallback(() => {
    scheduleApptStatsRefresh();
    void refreshTotalLeadsAndNotify();
    setCalendarRefreshKey((k) => k + 1);
  }, [refreshTotalLeadsAndNotify, scheduleApptStatsRefresh]);

  /** Coalesce rapid Realtime UPDATEs so the calendar does not flicker / constantly refetch. */
  const bumpCalendarOnlyDebounced = useCallback(() => {
    if (calendarBumpTimer.current != null) window.clearTimeout(calendarBumpTimer.current);
    calendarBumpTimer.current = window.setTimeout(() => {
      calendarBumpTimer.current = null;
      setCalendarRefreshKey((k) => k + 1);
    }, 500);
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
      if (calendarBumpTimer.current != null) window.clearTimeout(calendarBumpTimer.current);
    };
  }, []);

  useEffect(() => {
    void refreshTotalLeadsAndNotify();
    const t = window.setInterval(() => {
      void refreshTotalLeadsAndNotify();
    }, 15000);
    return () => window.clearInterval(t);
  }, [refreshTotalLeadsAndNotify]);

  const mergedProfileMap = useMemo(
    () => ({ ...profileMap, ...profileExtras }),
    [profileMap, profileExtras],
  );

  const viewerDisplayName = useMemo(() => {
    const fromProfile = displayProfessionalName(userId, mergedProfileMap[userId]);
    const w = welcomeFirstName.trim();
    if ((fromProfile === "Teammate" || fromProfile.startsWith("Member ")) && w) return w;
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
    setBulkDeleteSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(initialLeads.map((l) => l.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [initialLeads]);

  useEffect(() => {
    setProfileExtras({});
    claimedProfileFetchAttemptedRef.current.clear();
  }, [profileMap]);

  useEffect(() => {
    const need: string[] = [];
    for (const row of leads) {
      const id = row.claimed_by?.trim();
      if (!id || isNewLeadStatus(row.status)) continue;
      if (claimedProfileFetchAttemptedRef.current.has(id)) continue;
      const p = mergedProfileMap[id];
      if (p?.fullName?.trim() || p?.firstName?.trim() || p?.email?.trim()) continue;
      need.push(id);
    }
    const uniq = [...new Set(need)];
    if (uniq.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      for (const id of uniq) claimedProfileFetchAttemptedRef.current.add(id);
      const { data, error } = await fetchProfilesByIds(supabase, uniq);
      const combined: Record<string, TeamProfile> = {};
      for (const id of uniq) {
        const pr = data?.find((r) => (r.id as string) === id);
        combined[id] = pr
          ? teamProfileFromDb({
              id: pr.id as string,
              first_name: pr.first_name ?? null,
              full_name: pr.full_name ?? null,
              avatar_initials: pr.avatar_initials ?? null,
              email: pr.email ?? null,
            })
          : (mergedProfileMap[id] ?? {
              initials: "·",
              label: "",
              fullName: "",
              firstName: "",
              email: undefined,
            });
      }
      await enrichProfileMapWithTeamRoles(supabase, combined, uniq);
      setProfileExtras((prev) => {
        const next = { ...prev };
        for (const id of uniq) {
          next[id] = combined[id];
        }
        return next;
      });
    })();
  }, [leads, mergedProfileMap]);

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
            setDailyLeadUpdateCount((c) => c + 1);
            setDailyLeadUpdateAt(new Date());
            setTotalLeadsLive((n) => n + 1);
            totalLeadsKnownRef.current += 1;
            bumpStatsAndCalendar();
          }
          if (payload.eventType === "UPDATE") {
            const raw = payload.new as Record<string, unknown>;
            const old = payload.old as Record<string, unknown> | undefined;
            const rowId = raw.id as string;

            if (isRoofingLeadPoolEnabled()) {
              const leftMain = isCrmPoolColumnEnabled()
                ? crmPoolFromRealtimePayload(raw) !== CRM_POOL_MAIN
                : raw.is_roofing_lead === true;
              if (leftMain) {
                setLeads((prev) => prev.filter((l) => l.id !== rowId));
                setDrawerLead((d) => (d?.id === rowId ? null : d));
                setTotalLeadsLive((n) => Math.max(0, n - 1));
                totalLeadsKnownRef.current = Math.max(0, totalLeadsKnownRef.current - 1);
                if (leadRowUpdateAffectsCalendar(old, raw)) bumpCalendarOnlyDebounced();
                if (leadRowUpdateAffectsApptTodayCount(old, raw)) scheduleApptStatsRefresh();
                bumpStatsAndCalendar();
                return;
              }
              if (isCrmPoolColumnEnabled()) {
                const oldPool = old ? crmPoolFromRealtimePayload(old as Record<string, unknown>) : CRM_POOL_MAIN;
                if (old && oldPool !== CRM_POOL_MAIN && crmPoolFromRealtimePayload(raw) === CRM_POOL_MAIN) {
                  startTransition(() => router.refresh());
                  return;
                }
              } else if (old && old.is_roofing_lead === true && raw.is_roofing_lead === false) {
                startTransition(() => router.refresh());
                return;
              }
            }

            setLeads((prev) =>
              prev.map((l) => (l.id === rowId ? mergeLeadFromRealtime(l, raw) : l)),
            );
            setDrawerLead((d) =>
              d?.id === rowId ? mergeLeadFromRealtime(d, raw) : d,
            );

            if (leadRowUpdateAffectsCalendar(old, raw)) {
              bumpCalendarOnlyDebounced();
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
                  email: p.email ?? null,
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
  }, [bumpCalendarOnlyDebounced, bumpStatsAndCalendar, scheduleApptStatsRefresh, router]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hrefPrev = useMemo(
    () => buildListPath(page - 1, favoritesOnly, searchQuery, statusFilter),
    [page, favoritesOnly, searchQuery, statusFilter],
  );
  const hrefNext = useMemo(
    () => buildListPath(page + 1, favoritesOnly, searchQuery, statusFilter),
    [page, favoritesOnly, searchQuery, statusFilter],
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

  useEffect(() => {
    if (!initialOpenLeadId || openLeadFromUrlConsumedRef.current) return;
    openLeadFromUrlConsumedRef.current = true;
    void (async () => {
      await openLeadById(initialOpenLeadId);
      router.replace(buildListPath(page, favoritesOnly, searchQuery, statusFilter));
    })();
  }, [initialOpenLeadId, openLeadById, router, page, favoritesOnly, searchQuery, statusFilter]);

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

  const handleLeadDeleted = useCallback(
    (leadId: string) => {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setDrawerLead((d) => (d?.id === leadId ? null : d));
      setTotalLeadsLive((n) => Math.max(0, n - 1));
      totalLeadsKnownRef.current = Math.max(0, totalLeadsKnownRef.current - 1);
      bumpStatsAndCalendar();
      startTransition(() => router.refresh());
    },
    [bumpStatsAndCalendar, router],
  );

  const toggleBulkDeleteSelect = useCallback((id: string) => {
    setBulkDeleteSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisibleForBulkDelete = useCallback(() => {
    setBulkDeleteSelected(new Set(leads.map((l) => l.id)));
  }, [leads]);

  const deselectAllVisibleForBulkDelete = useCallback(() => {
    setBulkDeleteSelected((prev) => {
      const next = new Set(prev);
      for (const l of leads) next.delete(l.id);
      return next;
    });
  }, [leads]);

  const clearBulkDeleteSelection = useCallback(() => setBulkDeleteSelected(new Set()), []);

  const handleBulkDeleteLeads = useCallback(async () => {
    if (!canManageRoles || bulkDeleteSelected.size === 0) return;
    const ids = [...bulkDeleteSelected];
    const idSet = new Set(ids);
    const confirmed = window.confirm(
      `Permanently delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!confirmed) return;
    const confirmedAgain = window.confirm(
      `Are you sure? ${ids.length} lead${ids.length === 1 ? "" : "s"} will be removed from the database forever.`,
    );
    if (!confirmedAgain) return;
    setBulkDeletePending(true);
    try {
      const res = await deleteLeadsBulkAction(ids);
      if (!res.ok) {
        window.alert(res.error ?? "Delete failed.");
        return;
      }
      setLeads((prev) => prev.filter((l) => !idSet.has(l.id)));
      setDrawerLead((d) => (d && idSet.has(d.id) ? null : d));
      setBulkDeleteSelected(new Set());
      setTotalLeadsLive((n) => Math.max(0, n - ids.length));
      totalLeadsKnownRef.current = Math.max(0, totalLeadsKnownRef.current - ids.length);
      bumpStatsAndCalendar();
      startTransition(() => router.refresh());
    } finally {
      setBulkDeletePending(false);
    }
  }, [bulkDeleteSelected, bumpStatsAndCalendar, canManageRoles, router]);

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
  const hasStatusFilter = Boolean(statusFilter.trim());
  const listFilterActive = hasSearch || hasStatusFilter;
  const { isMobileShell: layoutMobileShell } = useDeskLayout();

  const sidebarFooter = (
    <>
      <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/[0.09] via-[#0b0c0f]/92 to-[#0b0c0f]/92 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_22px_-14px_rgba(34,211,238,0.7)]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">Signed in</p>
        <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{userDisplayName}</p>
      </div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="w-full rounded-xl border border-cyan-300/25 bg-cyan-500/[0.09] py-2 text-[13px] font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-500/[0.16]"
      >
        Sign out
      </button>
    </>
  );

  return (
    <DeskShell
      sections={commandDeskSections({ canManageRoles })}
      sidebarFooter={sidebarFooter}
      sidebarBelowFooter={canManageRoles ? <OwnerRoofingLeadsFooterLink /> : null}
    >
      <div className="relative mx-auto w-full min-w-0 max-w-[1600px] text-zinc-100">
        <DailyBriefingBanner />

        <header
          className={clsx(
            "mb-8 rounded-2xl border border-cyan-300/15 bg-gradient-to-b from-cyan-500/[0.06] via-[#0b0c0f]/95 to-[#0b0c0f]/95 px-4 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(34,211,238,0.65)]",
            layoutMobileShell ? "@md:px-6 @md:py-7" : "md:px-6 md:py-7",
          )}
        >
          <div
            className={clsx(
              "flex flex-col gap-4 border-b border-white/[0.08] pb-6",
              layoutMobileShell
                ? "@lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6"
                : "lg:flex-row lg:items-center lg:justify-between lg:gap-6",
            )}
          >
            <div
              className={clsx(
                "min-w-0 flex-1 pl-0",
                layoutMobileShell ? "@md:pl-1" : "md:pl-1",
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Pipeline</p>
              <h1
                className={clsx(
                  "mt-1 flex flex-wrap items-center gap-2.5 font-sans text-xl font-semibold tracking-tight text-white",
                  layoutMobileShell ? "@md:text-[1.65rem]" : "md:text-[1.65rem]",
                )}
              >
                <Image
                  src="/brand-logo.png?v=8"
                  alt="WF mini logo"
                  width={34}
                  height={34}
                  unoptimized
                  className="h-8 w-8 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(74,222,128,0.38)]"
                />
                <span>Web Friendly CRM</span>
              </h1>
            </div>
            <div
              className={clsx(
                "flex w-full shrink-0 flex-col items-stretch gap-3",
                layoutMobileShell
                  ? "@sm:flex-row @sm:items-center @sm:justify-end @lg:w-auto"
                  : "sm:flex-row sm:items-center sm:justify-end lg:w-auto",
              )}
            >
              <CommandCenterBar
                onDataChanged={refresh}
                compact
                canDeleteImportBatches={canManageRoles}
              />
            </div>
          </div>
          {canManageRoles ? (
            <div
              className={clsx(
                "mt-3 flex w-full shrink-0 flex-col items-stretch gap-3",
                layoutMobileShell
                  ? "@sm:flex-row @sm:items-center @sm:justify-end @lg:w-auto"
                  : "sm:flex-row sm:items-center sm:justify-end lg:w-auto",
              )}
            >
              <Link
                href="/admin-logs"
                className={clsx(
                  "inline-flex w-full items-center justify-center rounded-md border border-cyan-400/40 bg-gradient-to-r from-cyan-600/20 via-sky-600/15 to-blue-950/40 font-medium text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-cyan-300/55 hover:from-cyan-500/30 hover:via-sky-500/20 hover:to-blue-900/50 hover:text-white",
                  layoutMobileShell
                    ? "px-3 py-2.5 text-xs @min-[480px]:w-auto @min-[480px]:py-2"
                    : "px-3 py-2.5 text-xs min-[480px]:w-auto min-[480px]:py-2",
                )}
              >
                Admin Logs
              </Link>
            </div>
          ) : null}
          <div className="mt-4 inline-flex max-w-2xl flex-col gap-1 rounded-xl border border-violet-300/25 bg-gradient-to-r from-violet-500/[0.14] to-black/45 px-3 py-2 backdrop-blur-sm">
            <p className="text-base font-semibold tracking-tight text-zinc-100 [text-shadow:0_2px_18px_rgba(0,0,0,0.75)]">
              Welcome,{" "}
              <span className="text-white [text-shadow:0_2px_22px_rgba(167,139,250,0.38)]">{welcomeFirstName}</span>
            </p>
            <p className="text-sm leading-relaxed text-zinc-200/90 [text-shadow:0_2px_18px_rgba(0,0,0,0.75)]">
              Quick adds and CSV import — open any row for status, scheduling, and live presence.
            </p>
          </div>
        </header>

        <section
          className={clsx(
            "mb-8 grid grid-cols-1 gap-4",
            layoutMobileShell ? "@md:grid-cols-3" : "md:grid-cols-3",
          )}
        >
          <StatCard
            label="Total leads"
            value={formatStat(totalLeadsLive)}
            tone="cyan"
            dailyLeadUpdateCount={dailyLeadUpdateCount}
            dailyLeadUpdateAt={dailyLeadUpdateAt}
            helpText="ALL UPLOADED LEADS: This represents the entire database of leads that have been imported into the CRM. It includes every prospect, regardless of their current status or who they are assigned to."
          />
          <AppointmentsStatCard
            label="Appointments today"
            value={formatStat(apptsToday)}
            active={apptsActive}
            helpText="TODAY'S SCHEDULE: This shows the total number of firm appointments set for today. These are leads where a specific date and time have been locked in, and they require immediate attention or follow-up today."
          />
          <StatCard
            label="My favorites"
            value={formatStat(stats.favoritesCount)}
            tone="violet"
            helpText="YOUR PRIORITIES: Star any lead in the main list to save them here for quick access."
          />
        </section>

        <ExpandableWarMap />

        <section
          id="crm-leads-section"
          className="relative overflow-visible rounded-xl border border-cyan-300/15 bg-gradient-to-b from-cyan-500/[0.035] via-[#0a0d12]/95 to-[#090b10]/95 ring-1 ring-cyan-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_30px_-20px_rgba(34,211,238,0.45)]"
        >
          {leadsQueryError ? (
            <div className="border-b border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-3 text-sm text-rose-100/95">
              <p className="font-semibold">Leads could not be loaded</p>
              <p className="mt-1 font-mono text-xs text-rose-200/80">{leadsQueryError}</p>
              <p className="mt-2 text-xs text-rose-100/75">
                Often this is a missing column (run <code className="rounded bg-black/30 px-1">web/supabase/leads-roofing-pool.sql</code> then{" "}
                <code className="rounded bg-black/30 px-1">web/supabase/leads-crm-pool.sql</code> when{" "}
                <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL=true</code>) or an RLS policy blocking{" "}
                <code className="rounded bg-black/30 px-1">select</code> on <code className="rounded bg-black/30 px-1">leads</code>. Check the browser
                Network tab and Supabase logs.
              </p>
            </div>
          ) : null}
          {!leadsQueryError && isRoofingLeadPoolEnabled() && totalCount === 0 && stats.totalLeads === 0 ? (
            <div className="border-b border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-3 text-sm text-amber-100/90">
              <p className="font-semibold">Main list is empty — roofing pool is on</p>
              <p className="mt-1 text-xs text-amber-100/75">
                With <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL=true</code>, this page only shows leads in the{" "}
                <code className="rounded bg-black/30 px-1">main</code> pool (<code className="rounded bg-black/30 px-1">crm_pool</code>). Open{" "}
                <Link href="/roofing-leads" className="font-medium text-amber-50 underline decoration-amber-300/50 hover:text-white">
                  Roofing Leads Management
                </Link>{" "}
                for roofing-only rows, or turn a lead&apos;s &quot;Roofing pool&quot; toggle off in the drawer to bring it back here.
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 border-b border-white/[0.08] px-3.5 py-2">
            <div className="flex min-h-[1.5rem] flex-wrap items-center justify-center gap-2.5 text-center">
              <h2 className="text-[19px] font-semibold tracking-tight text-zinc-100">Leads</h2>
              <HelpMarker
                accent="crimson"
                text="SHARED TEAM POOL: This is the live list of all potential business leads.
ACTION: Click any row to claim a lead, call the number provided, or update the status.
SYNC: When you set an appointment, it automatically updates the shared Team Calendar for everyone to see."
              />
              <span
                className="rounded-full border border-emerald-400/35 bg-emerald-500/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-200 shadow-[0_0_16px_-8px_rgba(16,185,129,0.75)]"
                title="Table syncs via Supabase Realtime"
              >
                Live
              </span>
              <span className="rounded-full border border-cyan-200/55 bg-white/[0.08] px-3 py-0.5 text-[12px] font-bold uppercase tracking-wide text-zinc-100">
                {formatStat(totalCount)} {listFilterActive ? "matches" : "in view"}
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
          </div>

          <DebouncedCompanySearch
            favoritesOnly={favoritesOnly}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            layoutMobileShell={layoutMobileShell}
          />
          <LeadStatusFilterBar
            favoritesOnly={favoritesOnly}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            layoutMobileShell={layoutMobileShell}
          />

          {canManageRoles && bulkDeleteSelected.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-500/20 bg-rose-500/[0.08] px-3.5 py-3">
              <p className="text-sm font-medium text-rose-100/95">
                {bulkDeleteSelected.size} lead{bulkDeleteSelected.size === 1 ? "" : "s"} selected
                <span className="ml-2 text-xs font-normal text-zinc-400">Owners only · permanent delete</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleBulkDeleteLeads()}
                  disabled={bulkDeletePending}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-400/50 bg-rose-600/90 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  {bulkDeletePending ? "Deleting…" : "Delete selected"}
                </button>
                <button
                  type="button"
                  onClick={clearBulkDeleteSelection}
                  disabled={bulkDeletePending}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50"
                >
                  Clear selection
                </button>
              </div>
            </div>
          ) : null}

          <LeadsTableSection
            leads={leads}
            mergedProfileMap={mergedProfileMap}
            userId={userId}
            hasSearch={hasSearch}
            searchQuery={searchQuery}
            favoritesOnly={favoritesOnly}
            statusFilter={statusFilter}
            page={page}
            totalPages={totalPages}
            hrefPrev={hrefPrev}
            hrefNext={hrefNext}
            onRowClick={openDrawerForLead}
            onToggleFavorite={handleToggleFavorite}
            canBulkDelete={canManageRoles}
            bulkDeleteSelected={bulkDeleteSelected}
            onToggleBulkDeleteSelect={toggleBulkDeleteSelect}
            onSelectAllVisibleForBulkDelete={selectAllVisibleForBulkDelete}
            onDeselectAllVisibleForBulkDelete={deselectAllVisibleForBulkDelete}
          />
        </section>

        <div
          className={clsx(
            "mt-12 grid grid-cols-1 gap-8",
            layoutMobileShell
              ? "@lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] @lg:items-start @lg:gap-10"
              : "lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:items-start lg:gap-10",
          )}
        >
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

      <Link
        href="/team-chat"
        prefetch
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#222] bg-[#111] text-zinc-400 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8)] transition hover:border-zinc-600 hover:text-zinc-100 md:bottom-8 md:right-8"
        aria-label="Team chat"
        title="Team chat"
      >
        <MessageCircle className="h-5 w-5" strokeWidth={2} />
      </Link>

      {drawerLeadLive ? (
        <LeadDetailDrawer
          lead={drawerLeadLive}
          userId={userId}
          viewerDisplayName={viewerDisplayName}
          viewerMonogram={viewerMonogram}
          profileMap={mergedProfileMap}
          onClose={closeDrawer}
          syncLeadInState={syncLeadInState}
          onLeadMetaChanged={bumpStatsAndCalendar}
          isOwner={canManageRoles}
          onLeadDeleted={handleLeadDeleted}
        />
      ) : null}
    </DeskShell>
  );
}

function LeadStatusFilterBar({
  favoritesOnly,
  searchQuery,
  statusFilter,
  layoutMobileShell,
}: {
  favoritesOnly: boolean;
  searchQuery: string;
  statusFilter: string;
  layoutMobileShell: boolean;
}) {
  const normalized = parseLeadStatusFilterParam(statusFilter);
  const current = normalized ?? "";

  return (
    <div className="border-b border-white/[0.06] bg-black/20 px-4 py-2.5">
      <div
        className={clsx(
          "flex flex-col gap-2",
          layoutMobileShell ? "@sm:flex-row @sm:items-center @sm:gap-3" : "sm:flex-row sm:items-center sm:gap-3",
        )}
      >
        <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Status</p>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <Link
            href={buildListPath(1, favoritesOnly, searchQuery, "")}
            scroll={false}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              !current
                ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40"
                : "border border-white/[0.08] bg-zinc-950/60 text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200",
            )}
          >
            All
          </Link>
          {LEAD_STATUSES.map((s) => {
            const active = current === s;
            return (
              <Link
                key={s}
                href={buildListPath(1, favoritesOnly, searchQuery, s)}
                scroll={false}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40"
                    : "border border-white/[0.08] bg-zinc-950/60 text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200",
                )}
              >
                {s}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DebouncedCompanySearch({
  favoritesOnly,
  searchQuery,
  statusFilter,
  layoutMobileShell,
}: {
  favoritesOnly: boolean;
  searchQuery: string;
  statusFilter: string;
  layoutMobileShell: boolean;
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
      const st = statusFilter.trim();
      if (st && parseLeadStatusFilterParam(st)) p.set("status", st);
      const qs = p.toString();
      startTransition(() => router.replace(qs ? `/?${qs}` : "/"));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value, favoritesOnly, searchQuery, statusFilter, router]);

  const clearHref = buildListPath(1, favoritesOnly, "", statusFilter);

  return (
      <div className="border-b border-white/[0.08] bg-gradient-to-r from-cyan-500/[0.035] via-black/25 to-black/25 px-4 py-2.5">
      <div
        className={clsx(
          "flex flex-col gap-3",
          layoutMobileShell ? "@sm:flex-row @sm:items-center" : "sm:flex-row sm:items-center",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <SearchGlyph className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, COMPANY_SEARCH_MAX_LEN))}
            maxLength={COMPANY_SEARCH_MAX_LEN}
            placeholder="Search by business name…"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-cyan-300/20 bg-zinc-950/80 py-1.5 pl-9 pr-3 text-[13px] text-zinc-100 placeholder:text-zinc-600 shadow-inner shadow-black/40 transition focus:border-cyan-400/45 focus:outline-none focus:ring-1 focus:ring-cyan-400/25"
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
              className="inline-flex h-9 items-center rounded-lg border border-cyan-300/20 px-3 text-[13px] font-medium text-zinc-300 transition hover:border-cyan-300/35 hover:text-zinc-100"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </div>
    </div>
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

const StatCard = memo(function StatCard({
  label,
  value,
  tone = "cyan",
  dailyLeadUpdateCount = 0,
  dailyLeadUpdateAt = null,
  helpText,
}: {
  label: string;
  value: string;
  tone?: "cyan" | "violet" | "emerald";
  dailyLeadUpdateCount?: number;
  dailyLeadUpdateAt?: Date | null;
  helpText?: string;
}) {
  const showDailyLeadBadge = label === "Total leads" && dailyLeadUpdateCount >= DAILY_LEAD_BADGE_THRESHOLD;
  const toneClass =
    tone === "violet"
      ? "border-violet-300/20 bg-gradient-to-br from-violet-500/[0.08] via-[#0b0c0f]/90 to-[#0b0c0f]/90 ring-violet-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(167,139,250,0.7)]"
      : tone === "emerald"
        ? "border-emerald-300/20 bg-gradient-to-br from-emerald-500/[0.08] via-[#0b0c0f]/90 to-[#0b0c0f]/90 ring-emerald-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(16,185,129,0.7)]"
        : "border-cyan-300/20 bg-gradient-to-br from-cyan-500/[0.08] via-[#0b0c0f]/90 to-[#0b0c0f]/90 ring-cyan-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(34,211,238,0.7)]";
  const toneLabel = tone === "violet" ? "text-violet-200/75" : tone === "emerald" ? "text-emerald-200/75" : "text-cyan-200/75";
  return (
    <div className={clsx("relative rounded-xl border px-5 py-6 ring-1", toneClass)}>
      {helpText ? <HelpMarker accent="crimson" text={helpText} /> : null}
      {showDailyLeadBadge ? (
        <div className="absolute right-11 top-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 shadow-[0_0_16px_-8px_rgba(16,185,129,0.9)]">
          <span className="relative inline-flex h-2 w-2">
            <span className="crm-live-dot absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          +{dailyLeadUpdateCount} today
          {dailyLeadUpdateAt ? (
            <span className="text-emerald-100/80 normal-case tracking-normal">
              {dailyLeadUpdateAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className={clsx("text-[10px] font-semibold uppercase tracking-[0.16em]", toneLabel)}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-100">{value}</p>
    </div>
  );
});

const AppointmentsStatCard = memo(function AppointmentsStatCard({
  label,
  value,
  active,
  helpText,
}: {
  label: string;
  value: string;
  active: boolean;
  helpText?: string;
}) {
  return (
    <div
      className={`relative rounded-xl border bg-gradient-to-br from-cyan-500/[0.06] via-[#0b0c0f]/90 to-[#0b0c0f]/90 px-5 py-6 ring-1 ring-cyan-300/10 ${
        active ? "border-emerald-400/35 shadow-[0_0_32px_-16px_rgba(16,185,129,0.75)]" : "border-cyan-300/20"
      }`}
    >
      {helpText ? <HelpMarker accent="crimson" text={helpText} /> : null}
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/75">{label}</p>
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
