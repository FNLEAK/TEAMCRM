"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  GitBranch,
  Layers,
  Shield,
  Sparkles,
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
    return (
      <div className="mt-1.5 text-sm text-zinc-200">
        <p className="text-zinc-500">
          Note on <span className="font-medium text-white">{company}</span>
        </p>
        {preview ? (
          <p className="mt-1 rounded-lg border border-violet-500/15 bg-violet-500/[0.06] px-2 py-1.5 text-xs leading-relaxed text-zinc-300">
            “{clipText(preview, 130)}”
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

  return (
    <div className="min-h-svh bg-[var(--color-canvas,#030304)]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
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
                  <ul className="space-y-1.5">
                    {items.map((row) => {
                      const actorId = row.actor_id;
                      const actorName = actorId
                        ? displayProfessionalName(actorId, actors[actorId])
                        : "System";
                      const t = new Date(row.created_at);
                      const timeStr = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                      return (
                        <li
                          key={row.id}
                          className="group rounded-xl border border-white/[0.06] bg-gradient-to-br from-[#0c0e12] to-[#08090b] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-500/20"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    actionStyle(row.action),
                                  )}
                                >
                                  {actionLabel(row.action)}
                                </span>
                                <span className="text-[11px] tabular-nums text-zinc-500">{timeStr}</span>
                              </div>
                              <AuditEventBody row={row} actors={actors} />
                              {row.lead_id ? (
                                <p className="mt-1 text-[10px] text-zinc-600" title={row.lead_id}>
                                  Lead ref{" "}
                                  <span className="font-mono text-zinc-500">{shortLeadRef(row.lead_id)}</span>
                                  <span className="sr-only">Full id: {row.lead_id}</span>
                                </p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Actor</p>
                              <p className="mt-0.5 max-w-[10rem] truncate text-sm font-medium text-emerald-200/90">
                                {actorName}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-cyan-500/[0.07] to-transparent px-4 py-4">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/80">
                <ClipboardList className="h-4 w-4" aria-hidden />
                What we capture
              </h3>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-400">
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
                      <span className="font-mono text-[10px] text-zinc-500">{d.created_at.slice(0, 16)}</span>
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
