"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type MouseEvent,
} from "react";
import { buildTelHref, displayLeadPhone } from "@/lib/phone";
import { calendarSchedulerInitialLetter, displayProfessionalName } from "@/lib/profileDisplay";
import {
  isApptLeadLockedForViewer,
  isFavoritedBy,
  isLeadHighPriority,
  isNewLeadStatus,
  normalizeFavoritedIds,
  parseLeadStatusFilterParam,
  type LeadRow,
  type TeamProfile,
  PAGE_SIZE,
} from "@/lib/leadTypes";

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
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-amber-400 transition hover:border-amber-500/35 hover:bg-amber-500/10"
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
    <span className="crm-claimed-badge inline-flex max-w-[min(280px,100%)] items-center gap-1.5 rounded-full border border-rose-400/40 bg-gradient-to-r from-rose-500/20 to-fuchsia-600/15 px-2.5 py-1 text-[10px] font-semibold leading-tight text-rose-100 shadow-[0_0_20px_-4px_rgba(244,63,94,0.55)]">
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

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-zinc-600">—</span>;
  }
  const low = status.trim().toLowerCase();
  const isAppt = low === "appt set";
  const isPendingClose = low === "pending close";
  const isClaimed = low === "claimed";
  const isNotInterested = low === "not interested";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isAppt
          ? "crm-status-pill-appt-set bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/40"
          : isPendingClose
            ? "bg-amber-500/18 text-amber-100 ring-1 ring-amber-400/55 shadow-[0_0_14px_-4px_rgba(251,191,36,0.65)]"
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

export const LeadsTableSection = memo(function LeadsTableSection({
  leads,
  mergedProfileMap,
  userId,
  hasSearch,
  searchQuery,
  favoritesOnly,
  statusFilter,
  page,
  totalPages,
  hrefPrev,
  hrefNext,
  onRowClick,
  onToggleFavorite,
  canBulkDelete,
  bulkDeleteSelected,
  onToggleBulkDeleteSelect,
  onSelectAllVisibleForBulkDelete,
  onDeselectAllVisibleForBulkDelete,
}: {
  leads: LeadRow[];
  mergedProfileMap: Record<string, TeamProfile>;
  userId: string;
  hasSearch: boolean;
  searchQuery: string;
  favoritesOnly: boolean;
  statusFilter: string;
  page: number;
  totalPages: number;
  hrefPrev: string;
  hrefNext: string;
  onRowClick: (row: LeadRow) => void;
  onToggleFavorite: (e: MouseEvent<Element>, row: LeadRow) => void | Promise<void>;
  canBulkDelete: boolean;
  bulkDeleteSelected: Set<string>;
  onToggleBulkDeleteSelect: (id: string) => void;
  onSelectAllVisibleForBulkDelete: () => void;
  onDeselectAllVisibleForBulkDelete: () => void;
}) {
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const selectedOnPage = useMemo(
    () => leads.filter((l) => bulkDeleteSelected.has(l.id)).length,
    [leads, bulkDeleteSelected],
  );

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el || !canBulkDelete) return;
    el.indeterminate = leads.length > 0 && selectedOnPage > 0 && selectedOnPage < leads.length;
  }, [canBulkDelete, leads.length, selectedOnPage]);

  const colCount = canBulkDelete ? 6 : 5;
  const statusParsed = parseLeadStatusFilterParam(statusFilter);

  return (
    <>
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] max-md:overflow-y-visible md:max-h-[58vh] md:overflow-y-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {canBulkDelete ? (
                <th className="sticky top-0 z-10 w-11 border-b border-white/[0.08] bg-[#090b10] px-2 py-2.5 text-center font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <span className="sr-only">Select rows</span>
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-zinc-500 bg-zinc-900 text-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                    checked={leads.length > 0 && selectedOnPage === leads.length}
                    onChange={(e) => {
                      if (e.target.checked) onSelectAllVisibleForBulkDelete();
                      else onDeselectAllVisibleForBulkDelete();
                    }}
                    aria-label={
                      selectedOnPage === leads.length ? "Deselect all leads on this page" : "Select all leads on this page"
                    }
                  />
                </th>
              ) : null}
              <th className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#090b10] px-4 py-2.5 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                Company
              </th>
              <th className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#090b10] px-4 py-2.5 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                Phone
              </th>
              <th className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#090b10] px-4 py-2.5 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                Website
              </th>
              <th className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#090b10] px-4 py-2.5 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                Status
              </th>
              <th className="sticky top-0 z-10 w-[4.5rem] border-b border-white/[0.08] bg-[#090b10] px-4 py-2.5 text-center font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                Team
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-300/[0.08]">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-5 py-20 text-center text-sm text-zinc-500">
                  {hasSearch
                    ? `No companies match “${searchQuery}”.`
                    : statusParsed
                      ? `No leads with status “${statusParsed}” on this page${favoritesOnly ? " (favorites only)" : ""}.`
                      : `No leads on this page${favoritesOnly ? " (favorites only)" : ""}.`}
                </td>
              </tr>
            ) : (
              leads.map((row) => {
                const phoneLabel = displayLeadPhone(row.phone);
                const telHref = row.phone ? buildTelHref(row.phone) : null;
                const apptLocked = isApptLeadLockedForViewer(row, userId);
                const isPendingClose = (row.status ?? "").trim().toLowerCase() === "pending close";
                const highPri = isLeadHighPriority(row);
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick(row)}
                    title={
                      apptLocked
                        ? "Appointment set by a teammate — opening the drawer is view-only for pipeline & schedule"
                        : highPri
                          ? "High priority — visible to the whole team"
                          : undefined
                    }
                    className={clsx(
                      "cursor-pointer transition-colors hover:bg-white/[0.03]",
                      isPendingClose &&
                        "shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)] bg-amber-500/[0.04] hover:bg-amber-500/[0.08]",
                      highPri &&
                        !isPendingClose &&
                        "shadow-[inset_0_0_0_1px_rgba(248,113,113,0.4)] bg-rose-500/[0.06] hover:bg-rose-500/[0.1]",
                      apptLocked && "opacity-[0.42] saturate-50 hover:bg-zinc-900/40",
                    )}
                  >
                    {canBulkDelete ? (
                      <td
                        className="px-2 py-2 align-middle"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-zinc-500 bg-zinc-900 text-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                          checked={bulkDeleteSelected.has(row.id)}
                          onChange={() => onToggleBulkDeleteSelect(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${row.company_name ?? "lead"}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-2 align-top font-medium text-zinc-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.company_name ?? "—"}</span>
                        {highPri ? (
                          <span className="inline-flex items-center rounded-md border border-rose-400/45 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-100">
                            Priority
                          </span>
                        ) : null}
                        {row.claimed_by && !isNewLeadStatus(row.status) ? (
                          <ClaimedByBadge
                            name={displayProfessionalName(
                              row.claimed_by,
                              mergedProfileMap[row.claimed_by],
                            )}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      {phoneLabel && telHref ? (
                        <a
                          href={telHref}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-zinc-200 hover:text-cyan-200 hover:underline"
                        >
                          {phoneLabel}
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="max-w-[190px] truncate px-4 py-2 align-top">
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
                          className="text-zinc-300/90 hover:text-cyan-200 hover:underline"
                        >
                          {row.website}
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-2 text-center align-top">
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

      <footer className="flex flex-col gap-2 border-t border-cyan-300/15 bg-cyan-500/[0.03] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-cyan-100/70">
          Page {page} of {totalPages} · {PAGE_SIZE} per page · click a row for drawer
          {canBulkDelete ? " · owners: filter by status, select rows, delete in bulk" : ""}
        </p>
        <div className="flex gap-2">
          <PaginationLink disabled={page <= 1} href={hrefPrev} label="Previous" />
          <PaginationLink disabled={page >= totalPages} href={hrefNext} label="Next" />
        </div>
      </footer>
    </>
  );
});
