"use client";

import clsx from "clsx";
import Link from "next/link";
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
import { deleteLeadsBulkAction } from "@/app/actions/deleteLeadsBulkAction";
import { HelpMarker } from "@/components/HelpMarker";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { LeadsTableSection } from "@/components/LeadListTableSection";
import { TeamCalendarSection } from "@/components/TeamCalendarSection";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { upsertTeamProfileFromSession } from "@/lib/syncTeamProfile";
import { getLeadSelectColumns } from "@/lib/leadSelectColumns";
import { enrichProfileMapWithTeamRoles, fetchProfilesByIds } from "@/lib/profileSelect";
import { displayProfessionalName, formatLiveViewerMonogram } from "@/lib/profileDisplay";
import { mergeLeadFromRealtime } from "@/lib/realtimeLead";
import { buildRoofingLeadsListPath } from "@/lib/roofingLeadsRoutes";
import {
  COMPANY_SEARCH_MAX_LEN,
  LEAD_STATUSES,
  normalizeFavoritedIds,
  parseLeadStatusFilterParam,
  teamProfileFromDb,
  type LeadRow,
  type TeamProfile,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from "@/lib/leadTypes";

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

function RoofingDebouncedCompanySearch({
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
      startTransition(() => router.replace(qs ? `/roofing-leads?${qs}` : "/roofing-leads"));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value, favoritesOnly, searchQuery, statusFilter, router]);

  const clearHref = buildRoofingLeadsListPath(1, favoritesOnly, "", statusFilter);

  return (
    <div className="border-b border-white/[0.08] bg-gradient-to-r from-teal-500/[0.06] via-black/25 to-black/25 px-4 py-2.5">
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
            className="h-10 w-full rounded-lg border border-teal-300/25 bg-zinc-950/80 py-1.5 pl-9 pr-3 text-[13px] text-zinc-100 placeholder:text-zinc-600 shadow-inner shadow-black/40 transition focus:border-teal-400/45 focus:outline-none focus:ring-1 focus:ring-teal-400/25"
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
              className="inline-flex h-9 items-center rounded-lg border border-teal-300/25 px-3 text-[13px] font-medium text-zinc-300 transition hover:border-teal-300/40 hover:text-zinc-100"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RoofingLeadStatusFilterBar({
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
            href={buildRoofingLeadsListPath(1, favoritesOnly, searchQuery, "")}
            scroll={false}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              !current
                ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
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
                href={buildRoofingLeadsListPath(1, favoritesOnly, searchQuery, s)}
                scroll={false}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
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

export const RoofingLeadsManagementClient = memo(function RoofingLeadsManagementClient({
  poolEnabled,
  leads: initialLeads,
  totalCount,
  page,
  favoritesOnly,
  searchQuery,
  statusFilter,
  userId,
  welcomeFirstName,
  userDisplayName,
  profileMap: initialProfileMap,
  calendarTeamMemberOrder,
  canManageRoles,
}: {
  poolEnabled: boolean;
  leads: LeadRow[];
  totalCount: number;
  page: number;
  favoritesOnly: boolean;
  searchQuery: string;
  statusFilter: string;
  userId: string;
  welcomeFirstName: string;
  userDisplayName: string;
  profileMap: Record<string, TeamProfile>;
  calendarTeamMemberOrder: string[];
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [leads, setLeads] = useState(initialLeads);
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [profileExtras, setProfileExtras] = useState<Record<string, TeamProfile>>({});
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [bulkDeleteSelected, setBulkDeleteSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const claimedProfileFetchAttemptedRef = useRef<Set<string>>(new Set());
  const profileMapRef = useRef(initialProfileMap);

  const mergedProfileMap = useMemo(
    () => ({ ...initialProfileMap, ...profileExtras }),
    [initialProfileMap, profileExtras],
  );
  profileMapRef.current = mergedProfileMap;

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

  const { isMobileShell: layoutMobileShell } = useDeskLayout();

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
  }, [initialProfileMap]);

  useEffect(() => {
    const need: string[] = [];
    for (const row of leads) {
      const id = row.claimed_by?.trim();
      if (!id) continue;
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
      if (error || !data?.length) return;
      const combined: Record<string, TeamProfile> = {};
      for (const id of uniq) {
        const pr = data.find((r) => (r.id as string) === id);
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

  const bumpCalendar = useCallback(() => {
    setCalendarRefreshKey((k) => k + 1);
  }, []);

  const syncLeadInState = useCallback((id: string, patch: Partial<LeadRow>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDrawerLead((d) => (d?.id === id ? { ...d, ...patch } : d));
  }, []);

  const openLeadById = useCallback(async (leadId: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("leads")
      .select(getLeadSelectColumns())
      .eq("id", leadId)
      .maybeSingle();
    if (error) {
      console.error("[Roofing] open lead by id:", error.message);
      return;
    }
    if (!data || typeof data !== "object" || !("id" in data)) return;
    setDrawerLead(data as LeadRow);
  }, []);

  const openDrawerForLead = useCallback((row: LeadRow) => setDrawerLead(row), []);

  const closeDrawer = useCallback(() => setDrawerLead(null), []);

  const handleLeadDeleted = useCallback(
    (leadId: string) => {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setDrawerLead((d) => (d?.id === leadId ? null : d));
      bumpCalendar();
      startTransition(() => router.refresh());
    },
    [bumpCalendar, router],
  );

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
      bumpCalendar();
      startTransition(() => router.refresh());
    } finally {
      setBulkDeletePending(false);
    }
  }, [bulkDeleteSelected, bumpCalendar, canManageRoles, router]);

  useEffect(() => {
    if (!poolEnabled) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("roofing-leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) {
              setLeads((prev) => prev.filter((l) => l.id !== oldId));
              setDrawerLead((d) => (d?.id === oldId ? null : d));
              bumpCalendar();
            }
            return;
          }
          if (payload.eventType === "UPDATE") {
            const raw = payload.new as Record<string, unknown>;
            const rowId = raw.id as string;
            const roofing = raw.is_roofing_lead === true;
            if (!roofing) {
              setLeads((prev) => prev.filter((l) => l.id !== rowId));
              setDrawerLead((d) => (d?.id === rowId ? null : d));
              bumpCalendar();
              return;
            }
            setLeads((prev) => {
              const idx = prev.findIndex((l) => l.id === rowId);
              if (idx === -1) {
                startTransition(() => router.refresh());
                return prev;
              }
              const next = [...prev];
              next[idx] = mergeLeadFromRealtime(next[idx], raw);
              return next;
            });
            setDrawerLead((d) => (d?.id === rowId ? mergeLeadFromRealtime(d, raw) : d));
            bumpCalendar();
          }
          if (payload.eventType === "INSERT") {
            startTransition(() => router.refresh());
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [poolEnabled, bumpCalendar, router]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hrefPrev = buildRoofingLeadsListPath(page - 1, favoritesOnly, searchQuery, statusFilter);
  const hrefNext = buildRoofingLeadsListPath(page + 1, favoritesOnly, searchQuery, statusFilter);
  const hasSearch = searchQuery.trim().length > 0;
  const hasStatusFilter = Boolean(statusFilter.trim());
  const listFilterActive = hasSearch || hasStatusFilter;
  const drawerLeadLive = drawerLead ? (leads.find((l) => l.id === drawerLead.id) ?? drawerLead) : null;

  return (
    <div className="@container relative mx-auto w-full max-w-[1600px] text-zinc-100">
      <header className="mb-8 rounded-2xl border border-teal-300/15 bg-gradient-to-b from-teal-500/[0.07] via-[#0b0c0f]/95 to-[#0b0c0f]/95 px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(20,184,166,0.55)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-teal-200/75">Owners</p>
        <h1 className="mt-3 font-sans text-3xl font-semibold tracking-tight text-teal-300 drop-shadow-[0_0_24px_rgba(45,212,191,0.3)] sm:text-[2.35rem]">
          Roofing Leads Management
        </h1>
        <p className="mx-auto mt-3 max-w-4xl text-base leading-relaxed text-zinc-300/85">
          {poolEnabled
            ? "Roofing-only pipeline below — main Lead Management stays on Command. Team calendar includes all appointments."
            : "Turn on the roofing pool in env and run the SQL migration to list roofing leads here (calendar still works)."}
        </p>
      </header>

      {!poolEnabled ? (
        <div className="mb-8 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100/90">
          Set <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL=true</code> and apply{" "}
          <code className="rounded bg-black/30 px-1">web/supabase/leads-roofing-pool.sql</code>, then redeploy.
        </div>
      ) : (
        <section className="relative mb-10 overflow-visible rounded-xl border-t-2 border-teal-400/50 bg-gradient-to-b from-teal-500/[0.04] via-[#0a0d12]/95 to-[#090b10]/95 ring-1 ring-teal-300/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_30px_-20px_rgba(45,212,191,0.4)]">
          <div className="flex flex-col gap-1 border-b border-white/[0.08] px-3.5 py-2">
            <div className="flex min-h-[1.5rem] flex-wrap items-center justify-center gap-2.5 text-center">
              <h2 className="text-[19px] font-semibold tracking-tight text-zinc-100">Roofing leads</h2>
              <HelpMarker
                accent="crimson"
                text="ROOFING POOL: Same columns as Command — only leads marked Roofing in the owner drawer appear here. Toggle off in the drawer to move a lead back to main Lead Management."
              />
              <span className="rounded-full border border-emerald-400/35 bg-emerald-500/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-200 shadow-[0_0_16px_-8px_rgba(16,185,129,0.75)]">
                Live
              </span>
              <span className="rounded-full border border-teal-200/55 bg-white/[0.08] px-3 py-0.5 text-[12px] font-bold uppercase tracking-wide text-zinc-100">
                {new Intl.NumberFormat().format(totalCount)} {listFilterActive ? "matches" : "in view"}
              </span>
            </div>
          </div>

          <RoofingDebouncedCompanySearch
            favoritesOnly={favoritesOnly}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            layoutMobileShell={layoutMobileShell}
          />
          <RoofingLeadStatusFilterBar
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
      )}

      <div
        className={clsx(
          "mt-12 grid grid-cols-1 gap-8",
          layoutMobileShell
            ? "@lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] @lg:items-start @lg:gap-10"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:items-start lg:gap-10",
        )}
      >
        <TeamCalendarSection
          userId={userId}
          onOpenLeadById={(id) => void openLeadById(id)}
          teamMemberColorOrder={calendarTeamMemberOrder}
          profileMap={mergedProfileMap}
          calendarRefreshKey={calendarRefreshKey}
        />
        <div className="rounded-xl border border-zinc-700/40 bg-zinc-950/40 px-4 py-5 text-sm text-zinc-400">
          <p className="font-medium text-zinc-200">Calendar</p>
          <p className="mt-2 leading-relaxed">
            Same team schedule as Command. Opening a lead from the calendar uses this page&apos;s drawer when you are
            on Roofing Leads Management.
          </p>
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
          onLeadMetaChanged={() => {
            bumpCalendar();
            startTransition(() => router.refresh());
          }}
          isOwner={canManageRoles}
          onLeadDeleted={handleLeadDeleted}
        />
      ) : null}
    </div>
  );
});
