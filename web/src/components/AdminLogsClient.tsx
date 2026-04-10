"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  GitBranch,
  Layers,
  MessageSquare,
  Shield,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { displayProfessionalName } from "@/lib/profileDisplay";
import type { TeamProfile } from "@/lib/leadTypes";
import type { CrmAuditLogRow } from "@/lib/adminAuditTypes";
import type { ClosedDealAuditRow } from "@/lib/loadAdminAuditLogs";

type FilterKey = "all" | "leads" | "notes" | "deals";

/** Same pattern as loadAdminAuditLogs — resolve profile UUIDs in audit payloads. */
const USER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shortLeadRef(id: string): string {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Full date + time for each stream card (local timezone). */
function formatStreamCardDateTime(iso: string): { dateStr: string; timeStr: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dateStr: "—", timeStr: "" };
  return {
    dateStr: d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    timeStr: d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

/** Single line for note preview footers — date + time together. */
function formatStreamNoteTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function displayAuditValue(raw: unknown, actors: Record<string, TeamProfile>): string {
  if (raw == null || raw === "null") return "—";
  const s = String(raw).trim();
  if (!s) return "—";
  if (USER_UUID_RE.test(s)) {
    return displayProfessionalName(s, actors[s]);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }
  return clipText(s, 56);
}

const FILTER_DEF: { id: FilterKey; label: string; match: (a: string) => boolean }[] = [
  { id: "all", label: "All activity", match: () => true },
  {
    id: "leads",
    label: "Leads & pipeline",
    match: (a) => a === "lead_created" || a === "lead_updated" || a === "lead_deleted",
  },
  { id: "notes", label: "Notes", match: (a) => a === "note_added" },
  { id: "deals", label: "Deal requests", match: (a) => a === "deal_request" },
];

type ChangeRow = { label: string; from: string; to: string };

function buildLeadUpdateChanges(d: Record<string, unknown>, actors: Record<string, TeamProfile>): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const push = (label: string, key: string) => {
    const v = d[key] as { from?: unknown; to?: unknown } | undefined;
    if (!v || (v.from === undefined && v.to === undefined)) return;
    rows.push({
      label,
      from: displayAuditValue(v.from, actors),
      to: displayAuditValue(v.to, actors),
    });
  };
  push("Status", "status");
  push("Claim", "claimed_by");
  push("Appointment", "appt_date");
  push("Company", "company_name");
  push("Phone", "phone");
  push("Website", "website");
  push("Scheduler", "appt_scheduled_by");
  push("Import file", "import_filename");
  return rows;
}

function AuditEventBody({
  row,
  actors,
}: {
  row: CrmAuditLogRow;
  actors: Record<string, TeamProfile>;
}): ReactNode {
  const { action, details, company_name: co } = row;
  const company = co?.trim() || "Untitled lead";
  const d = (details ?? {}) as Record<string, unknown>;

  if (action === "lead_created") {
    const st = d.status != null ? String(d.status) : "";
    return (
      <div className="mt-1.5 space-y-1 text-sm text-zinc-200">
        <p>
          <span className="text-zinc-500">Added</span>{" "}
          <span className="font-medium text-white">{company}</span>
          {st ? (
            <>
              {" "}
              <span className="text-zinc-500">· status</span>{" "}
              <span className="text-emerald-200/90">{st}</span>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  if (action === "lead_deleted") {
    const lastClaim = d.claimed_by != null ? displayAuditValue(d.claimed_by, actors) : null;
    return (
      <div className="mt-1.5 space-y-1 text-sm text-zinc-200">
        <p>
          <span className="text-rose-300/90">Removed</span>{" "}
          <span className="font-medium text-white">{company}</span>
        </p>
        {lastClaim && lastClaim !== "—" ? (
          <p className="text-xs text-zinc-500">
            Last claim: <span className="text-zinc-300">{lastClaim}</span>
          </p>
        ) : null}
      </div>
    );
  }

  if (action === "note_added") {
    const preview = d.preview != null ? String(d.preview) : "";
    const noteWhen = formatStreamNoteTimestamp(row.created_at);
    return (
      <div className="mt-1.5 text-sm text-zinc-200">
        <p className="text-zinc-500">
          Note on <span className="font-medium text-white">{company}</span>
        </p>
        {preview ? (
          <div className="mt-2 rounded-lg border border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-2">
            <p className="text-[13px] leading-relaxed text-zinc-200">“{clipText(preview, 130)}”</p>
            {noteWhen ? (
              <p className="mt-2 border-t border-violet-500/25 pt-2 text-[11px] font-semibold tabular-nums text-violet-200/95">
                {noteWhen}
              </p>
            ) : null}
          </div>
        ) : noteWhen ? (
          <p className="mt-2 rounded-lg border border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-2 text-[11px] font-semibold tabular-nums text-violet-200/95">
            {noteWhen}
          </p>
        ) : null}
      </div>
    );
  }

  if (action === "deal_request") {
    const amt = d.amount != null ? Number(d.amount) : null;
    const st = d.approval_status != null ? String(d.approval_status) : "";
    const amtStr =
      amt != null && Number.isFinite(amt)
        ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amt)
        : "";
    return (
      <div className="mt-1.5 space-y-1 text-sm text-zinc-200">
        <p className="font-medium text-white">{company}</p>
        <p className="text-xs text-zinc-400">
          {amtStr ? <span className="text-amber-200/90">{amtStr}</span> : null}
          {amtStr && st ? <span className="text-zinc-600"> · </span> : null}
          {st ? <span className="capitalize">{st}</span> : null}
        </p>
      </div>
    );
  }

  if (action === "lead_updated") {
    const changes = buildLeadUpdateChanges(d, actors);
    if (changes.length === 0) {
      return <p className="mt-1.5 text-sm text-zinc-400">Updated {company}</p>;
    }
    const visibleChanges = changes.slice(0, 2);
    const hiddenCount = Math.max(0, changes.length - visibleChanges.length);
    return (
      <div className="mt-1.5 space-y-1.5">
        <p className="text-sm font-medium text-white">{company}</p>
        <ul className="space-y-1.5">
          {visibleChanges.map((c) => (
            <li
              key={c.label}
              className="flex flex-col gap-0.5 rounded-lg border border-white/[0.05] bg-black/25 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2"
            >
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                {c.label}
              </span>
              <div className="min-w-0 text-xs leading-snug">
                <span className="text-zinc-500">{c.from}</span>
                <span className="mx-2 text-zinc-600">→</span>
                <span className="font-medium text-zinc-100">{c.to}</span>
              </div>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <p className="text-[11px] text-zinc-500">+{hiddenCount} more change{hiddenCount === 1 ? "" : "s"}</p>
        ) : null}
      </div>
    );
  }

  return (
    <p className="mt-2 text-sm text-zinc-300">
      {action} · {company}
    </p>
  );
}

function actionStyle(action: string): string {
  switch (action) {
    case "lead_created":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-100";
    case "lead_updated":
      return "border-cyan-500/35 bg-cyan-500/10 text-cyan-100";
    case "lead_deleted":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100";
    case "note_added":
      return "border-violet-500/35 bg-violet-500/10 text-violet-100";
    case "deal_request":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-zinc-600/50 bg-zinc-900/50 text-zinc-200";
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case "lead_created":
      return "Created";
    case "lead_updated":
      return "Updated";
    case "lead_deleted":
      return "Deleted";
    case "note_added":
      return "Note";
    case "deal_request":
      return "Deal";
    default:
      return action;
  }
}

function statusPillTone(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "interested") return "border-emerald-400/45 bg-emerald-500/20 text-emerald-200";
  if (s === "demo sent") return "border-sky-400/45 bg-sky-500/20 text-sky-200";
  if (s.includes("deal") || s.includes("closed")) return "border-amber-400/50 bg-amber-500/20 text-amber-100";
  if (s === "new") return "border-zinc-400/35 bg-zinc-500/15 text-zinc-200";
  return "border-cyan-400/35 bg-cyan-500/15 text-cyan-200";
}

function prettyStatus(status: string): string {
  return status.trim().replace(/\s+/g, " ").toUpperCase();
}

export function AdminLogsClient({
  logs,
  actors,
  tableMissing,
  fallbackDeals,
}: {
  logs: CrmAuditLogRow[];
  actors: Record<string, TeamProfile>;
  tableMissing: boolean;
  fallbackDeals: ClosedDealAuditRow[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const def = FILTER_DEF.find((f) => f.id === filter);
    const m = def?.match ?? (() => true);
    return logs.filter((r) => m(r.action));
  }, [logs, filter]);

  const byDay = useMemo(() => {
    const map = new Map<string, CrmAuditLogRow[]>();
    for (const r of filtered) {
      const day = r.created_at.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
    return keys.map((k) => ({ day: k, items: map.get(k)! }));
  }, [filtered]);

  const pulseSeries = useMemo(() => {
    const buckets = new Array(12).fill(0);
    if (filtered.length === 0) return buckets;
    for (let i = 0; i < filtered.length; i += 1) {
      const idx = i % buckets.length;
      buckets[idx] += 1;
    }
    return buckets;
  }, [filtered]);

  return (
    <div className="min-h-svh bg-[var(--color-canvas,#030304)]">
      <div className="fixed inset-0 bg-black/35 backdrop-blur-[10px]" />
      <div className="relative mx-auto mt-[4.5vh] h-[86vh] w-[min(94vw,1700px)] overflow-hidden rounded-3xl border border-cyan-400/35 bg-[#050505]/92 p-4 shadow-[0_0_10px_rgba(34,211,238,0.28),0_28px_80px_-38px_rgba(0,0,0,0.95)]">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-emerald-300"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to CRM
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/35 bg-emerald-500/10 shadow-[0_0_28px_-10px_rgba(52,211,153,0.55)]">
                <Shield className="h-5 w-5 text-emerald-300" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Admin logs</h1>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Owner-only audit trail — leads, statuses, notes, deletions, and deal requests.
                </p>
              </div>
            </div>
          </div>
        </div>

        {tableMissing ? (
          <div className="mb-8 rounded-2xl border border-amber-500/35 bg-amber-500/[0.07] px-5 py-4 text-sm text-amber-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <p className="flex items-start gap-2 font-semibold">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              Enable full logging in Supabase
            </p>
            <p className="mt-2 leading-relaxed text-amber-100/85">
              Run <code className="rounded bg-black/30 px-1.5 py-0.5 text-amber-50">web/supabase/crm-admin-audit-log.sql</code>{" "}
              in the SQL Editor (after <code className="rounded bg-black/30 px-1.5 py-0.5">team-roles.sql</code> and{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5">crm-engine.sql</code>). Then refresh this page — new
              activity will appear automatically.
            </p>
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-[#0a0c10]/90 p-2 ring-1 ring-cyan-500/10">
          {FILTER_DEF.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition",
                filter === f.id
                  ? "bg-gradient-to-r from-cyan-500/25 to-emerald-500/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-cyan-400/35"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid h-[calc(100%-8.5rem)] gap-5 lg:grid-cols-[minmax(170px,220px)_1fr_minmax(300px,380px)]">
          <aside className="rounded-2xl border border-cyan-400/25 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(5,5,5,0.9))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100">Activity Pulse</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {pulseSeries.map((v, idx) => {
                const h = 6 + (v % 9) * 5;
                return (
                  <div
                    key={idx}
                    className="w-2.5 rounded-sm bg-gradient-to-t from-cyan-500/25 to-emerald-300/70 shadow-[0_0_10px_-4px_rgba(34,211,238,0.75)]"
                    style={{ height: `${h}px` }}
                  />
                );
              })}
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-black/35 p-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">System Health</p>
              <p className="mt-1 text-xs font-semibold text-zinc-200">Realtime stream synchronized</p>
            </div>
          </aside>

          <div className="min-h-0 rounded-2xl border border-cyan-400/20 bg-black/30 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100">Tactical Stream</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{filtered.length} events</p>
            </div>
            <div className="max-h-full space-y-4 overflow-y-auto pr-1">
            {byDay.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 px-6 py-16 text-center">
                <Layers className="mx-auto h-10 w-10 text-zinc-600" aria-hidden />
                <p className="mt-3 text-sm font-medium text-zinc-400">No events match this filter yet.</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {tableMissing
                    ? "After you run the SQL migration, activity will stream in here."
                    : "Team activity will show up as people work leads."}
                </p>
              </div>
            ) : (
              byDay.map(({ day, items }) => (
                <section key={day}>
                  <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <GitBranch className="h-3.5 w-3.5 text-emerald-500/70" aria-hidden />
                    {new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </h2>
                  <ul className="space-y-2">
                    {items.map((row) => {
                      const actorId = row.actor_id;
                      const actorName = actorId
                        ? displayProfessionalName(actorId, actors[actorId])
                        : "System";
                      const { dateStr: cardDateStr, timeStr: cardTimeStr } = formatStreamCardDateTime(row.created_at);
                      const d = (row.details ?? {}) as Record<string, unknown>;
                      const statusDelta = d.status as { from?: unknown; to?: unknown } | undefined;
                      const fromStatus = statusDelta?.from ? String(statusDelta.from) : null;
                      const toStatus = statusDelta?.to ? String(statusDelta.to) : null;
                      const isDealLike = row.action === "deal_request";
                      return (
                        <motion.li
                          key={row.id}
                          layout
                          initial={{ opacity: 0, y: -26 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 180, damping: 20, mass: 0.8 }}
                          className={clsx(
                            "group rounded-xl border px-3 py-3 backdrop-blur-md transition",
                            "border-cyan-400/30 bg-[#050505]/85 shadow-[0_0_10px_rgba(34,211,238,0.25)]",
                            isDealLike && "shadow-[0_0_14px_rgba(250,204,21,0.26)]",
                          )}
                        >
                          <div className="mb-3 border-b border-white/[0.08] pb-3">
                            <p className="text-[13px] font-semibold leading-snug text-zinc-50">{cardDateStr}</p>
                            {cardTimeStr ? (
                              <p className="mt-1 text-sm font-semibold tabular-nums text-cyan-200/95">{cardTimeStr}</p>
                            ) : null}
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="min-w-[7.5rem] shrink-0">
                              <p className="inline-flex rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200 shadow-[0_0_10px_-5px_rgba(34,211,238,0.8)]">
                                {actorName}
                              </p>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{row.company_name || "Untitled lead"}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {row.action === "lead_created" ? (
                                  <>
                                    <span className={clsx("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold", statusPillTone("new"))}>
                                      NEW
                                    </span>
                                    {toStatus ? (
                                      <>
                                        <span className="text-cyan-300/70">-&gt;</span>
                                        <span className={clsx("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold", statusPillTone(toStatus))}>
                                          {prettyStatus(toStatus)}
                                        </span>
                                      </>
                                    ) : null}
                                  </>
                                ) : row.action === "lead_updated" && fromStatus && toStatus ? (
                                  <>
                                    <span className={clsx("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold", statusPillTone(fromStatus))}>
                                      {prettyStatus(fromStatus)}
                                    </span>
                                    <span className="text-cyan-300/70">-&gt;</span>
                                    <span className={clsx("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold", statusPillTone(toStatus))}>
                                      {prettyStatus(toStatus)}
                                    </span>
                                  </>
                                ) : row.action === "deal_request" ? (
                                  <span className={clsx("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold", statusPillTone("deal closed"))}>
                                    DEAL
                                  </span>
                                ) : (
                                  <span
                                    className={clsx(
                                      "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                      actionStyle(row.action),
                                    )}
                                  >
                                    {actionLabel(row.action)}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2">
                                <AuditEventBody row={row} actors={actors} />
                              </div>
                              <div className="mt-2 text-[11px] text-zinc-500">
                                Ref:{" "}
                                <span className="font-mono text-zinc-400">
                                  {row.lead_id ? shortLeadRef(row.lead_id) : "n/a"}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    actionStyle(row.action),
                                  )}
                                >
                                  {actionLabel(row.action)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
            </div>
          </div>

          <aside className="space-y-4 min-h-0 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.09] via-black/40 to-black/50 px-4 py-4 backdrop-blur-xl">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/80">
                <Zap className="h-4 w-4 text-cyan-300" aria-hidden />
                What we capture
              </h3>
              <ul className="mt-3 space-y-3 text-xs leading-relaxed text-zinc-300">
                <li className="flex gap-2">
                  <span className="text-emerald-400">●</span>
                  Lead creates + key updates (status, claim, schedule, imports)
                </li>
                <li className="flex gap-2">
                  <span className="text-violet-400">●</span>
                  Notes (short preview)
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">●</span>
                  Lead deletions
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400">●</span>
                  Deal requests + amount
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.06] via-black/40 to-black/50 px-4 py-4 backdrop-blur-xl">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/80">
                <ClipboardList className="h-4 w-4 text-cyan-300" aria-hidden />
                System overview
              </h3>
              <ul className="mt-3 space-y-3 text-xs leading-relaxed text-zinc-300">
                <li>
                  <p className="font-semibold uppercase tracking-[0.12em] text-zinc-100">Realtime syncing</p>
                  <p>Supabase streams audit rows instantly to all operators.</p>
                </li>
                <li>
                  <p className="font-semibold uppercase tracking-[0.12em] text-zinc-100">Area code mapping</p>
                  <p>Lead geography feeds the tactical map and region intelligence.</p>
                </li>
                <li>
                  <p className="font-semibold uppercase tracking-[0.12em] text-zinc-100">Secure auditing</p>
                  <p>Immutable timeline preserves actor, status transitions, and metadata.</p>
                </li>
              </ul>
            </div>

            {tableMissing && fallbackDeals.length > 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0c] px-4 py-4">
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                  <FileText className="h-4 w-4 text-amber-400/80" aria-hidden />
                  Recent deal requests
                </h3>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  Live feed from <code className="text-zinc-400">closed_deals</code> until audit SQL is installed.
                </p>
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs text-zinc-300">
                  {fallbackDeals.map((d) => (
                    <li key={d.id} className="rounded-lg border border-white/[0.05] bg-black/30 px-2 py-1.5">
                      <span className="block text-[11px] font-semibold tabular-nums text-zinc-300">
                        {formatStreamNoteTimestamp(d.created_at) || d.created_at.slice(0, 16)}
                      </span>
                      <span className="mt-0.5 block">
                        {new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
                          Number(d.amount),
                        )}{" "}
                        · {d.approval_status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
