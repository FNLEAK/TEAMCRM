"use client";

import { useMemo, useState } from "react";
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

function formatAuditSummary(row: CrmAuditLogRow): string {
  const { action, details, company_name: co } = row;
  const company = co?.trim() || "Untitled lead";

  if (action === "lead_created") {
    const st = details?.status != null ? String(details.status) : "";
    return `Added lead · ${company}${st ? ` · status ${st}` : ""}`;
  }
  if (action === "lead_deleted") {
    return `Deleted lead · ${company}`;
  }
  if (action === "note_added") {
    const preview = details?.preview != null ? String(details.preview) : "";
    return `Note on ${company}${preview ? ` · “${preview.slice(0, 90)}${preview.length > 90 ? "…" : ""}”` : ""}`;
  }
  if (action === "deal_request") {
    const amt = details?.amount != null ? Number(details.amount) : null;
    const st = details?.approval_status != null ? String(details.approval_status) : "";
    const amtStr =
      amt != null && Number.isFinite(amt)
        ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amt)
        : "";
    return `Close / deal request · ${company}${amtStr ? ` · ${amtStr}` : ""}${st ? ` · ${st}` : ""}`;
  }
  if (action === "lead_updated") {
    const parts: string[] = [];
    const d = details ?? {};
    const pushChange = (label: string, key: string) => {
      const v = d[key] as { from?: unknown; to?: unknown } | undefined;
      if (v && (v.from !== undefined || v.to !== undefined)) {
        parts.push(`${label}: ${String(v.from ?? "—")} → ${String(v.to ?? "—")}`);
      }
    };
    pushChange("Status", "status");
    pushChange("Claimed by", "claimed_by");
    pushChange("Appointment", "appt_date");
    pushChange("Company", "company_name");
    pushChange("Scheduler", "appt_scheduled_by");
    pushChange("Import file", "import_filename");
    if (parts.length === 0) {
      return `Updated ${company}`;
    }
    return `${company} · ${parts.join(" · ")}`;
  }
  return `${action} · ${company}`;
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
          <div className="space-y-8">
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
                      const t = new Date(row.created_at);
                      const timeStr = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                      return (
                        <li
                          key={row.id}
                          className="group rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#0c0e12] to-[#08090b] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-500/20"
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
                              <p className="mt-2 text-sm leading-relaxed text-zinc-200">{formatAuditSummary(row)}</p>
                              {row.lead_id ? (
                                <p className="mt-1 font-mono text-[10px] text-zinc-600">Lead id · {row.lead_id}</p>
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
                  New leads, edits to status, claim, schedule, imports
                </li>
                <li className="flex gap-2">
                  <span className="text-violet-400">●</span>
                  Notes added on a lead (preview only)
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">●</span>
                  Lead deletions
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400">●</span>
                  Deal / close requests with amount
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
