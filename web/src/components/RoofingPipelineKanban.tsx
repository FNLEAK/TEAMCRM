"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { AlertTriangle, Clock } from "lucide-react";
import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { isDemoBuildClaimFeatureEnabled } from "@/lib/demoBuildClaimFeature";
import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";
import {
  demoBuildClaimedByUserId,
  hasDemoSiteUrl,
  isExtendedPipelineBoardStatus,
  isLeadHighPriority,
  NON_CANONICAL_STAGE_KEY,
  pipelineStageDisplayLabel,
  ROOFING_PIPELINE_BOARD_ORDER,
  type LeadRow,
} from "@/lib/leadTypes";
import { pipelineAttributionUserId, type CommandCenterLead } from "@/lib/commandCenterData";
import { PIPELINE_KANBAN_COLUMN_STYLE } from "@/lib/pipelineKanbanVisuals";
import { displayLeadPhone } from "@/lib/phone";

const PIPELINE_BOARD_COLUMNS = ROOFING_PIPELINE_BOARD_ORDER;

type BoardColumn = (typeof PIPELINE_BOARD_COLUMNS)[number];

function columnKeyForStatus(status: string | null | undefined): BoardColumn | typeof NON_CANONICAL_STAGE_KEY {
  const s = (status ?? "").trim();
  if (isExtendedPipelineBoardStatus(s)) return s as BoardColumn;
  return NON_CANONICAL_STAGE_KEY;
}

function boardColumnForLeadRow(lead: Pick<LeadRow, "status">): BoardColumn {
  const k = columnKeyForStatus(lead.status);
  if (k === NON_CANONICAL_STAGE_KEY) return "Appt Set";
  return k;
}

function isWebSourcePipelineLead(lead: Pick<LeadRow, "status">): boolean {
  return columnKeyForStatus(lead.status) === NON_CANONICAL_STAGE_KEY;
}

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 36) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const STALE_WARN_HOURS = 24;
const STALE_CRITICAL_HOURS = 48;

function stagnantHoursInStage(lead: LeadRow): number | null {
  const iso =
    (lead.created_at ?? "").trim() ||
    null;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function newOrCalledStaleLevel(col: string, hours: number | null): "warn" | "critical" | null {
  if (col !== "New" && col !== "Called") return null;
  if (hours == null) return null;
  if (hours >= STALE_CRITICAL_HOURS) return "critical";
  if (hours >= STALE_WARN_HOURS) return "warn";
  return null;
}

function HoverTiltCard({
  className,
  children,
  maxTilt = 7,
  lift = 2,
}: {
  className?: string;
  children: ReactNode;
  maxTilt?: number;
  lift?: number;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - py) * maxTilt, y: (px - 0.5) * maxTilt });
  };

  return (
    <div
      className={clsx("relative", className)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        setIsHovering(false);
        setTilt({ x: 0, y: 0 });
      }}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${isHovering ? -lift : 0}px)`,
        transition: isHovering ? "transform 90ms linear, box-shadow 220ms ease" : "transform 280ms ease, box-shadow 260ms ease",
      }}
    >
      {children}
    </div>
  );
}

const KANBAN_COLUMN_STYLE = PIPELINE_KANBAN_COLUMN_STYLE;

export function RoofingPipelineKanban({
  leads,
  profileLabels,
  onOpenLead,
}: {
  leads: LeadRow[];
  profileLabels: Record<string, string>;
  onOpenLead: (lead: LeadRow) => void;
}) {
  const byColumn = useMemo(() => {
    const m = new Map<BoardColumn, LeadRow[]>();
    for (const k of PIPELINE_BOARD_COLUMNS) m.set(k, []);
    for (const l of leads) {
      const k = boardColumnForLeadRow(l);
      m.get(k)!.push(l);
    }
    for (const k of PIPELINE_BOARD_COLUMNS) {
      m.get(k)!.sort((a, b) => {
        const pa = isLeadHighPriority(a) ? 1 : 0;
        const pb = isLeadHighPriority(b) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }
    return m;
  }, [leads]);

  return (
    <section className="mt-6 border-t border-white/[0.06] pt-6">
      <div className="mb-3 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-zinc-100">Roofing pipeline</h3>
        <p className="text-xs text-zinc-500">
          Same stages as Command, plus <span className="text-orange-200/80">Quotes</span>,{" "}
          <span className="text-lime-200/80">Estimates</span>, and <span className="text-sky-200/80">Inspections</span> for
          roofing jobs. Click a card to open the lead.
        </p>
      </div>
      <div className="board-scroll overflow-x-auto pb-2">
        <div className="flex min-w-[1720px] flex-row gap-3">
          {PIPELINE_BOARD_COLUMNS.map((col) => {
            const cols = byColumn.get(col) ?? [];
            const stageStyle = KANBAN_COLUMN_STYLE[col] ?? KANBAN_COLUMN_STYLE[NON_CANONICAL_STAGE_KEY];
            return (
              <div
                key={col}
                className={clsx(
                  "relative flex min-w-[185px] flex-1 shrink-0 flex-col overflow-hidden rounded-lg border border-[#222] bg-[#111]",
                )}
              >
                <div className="sticky top-0 z-10 border-b border-[#222] bg-[#111] px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em]", stageStyle.heading)}>
                      {col === "Appt Set" ? "Appt Set" : pipelineStageDisplayLabel(col)}
                    </p>
                    <span className="text-xs font-medium tabular-nums text-zinc-500">{cols.length}</span>
                  </div>
                  {col === "Appt Set" ? (
                    <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">Includes website bookings</p>
                  ) : null}
                </div>
                <div className="max-h-[68vh] space-y-1.5 overflow-y-auto p-2">
                  {cols.length === 0 ? (
                    <div
                      className={clsx(
                        "relative overflow-hidden rounded-lg border border-dashed border-cyan-400/22 bg-gradient-to-b via-[#101827]/85 to-[#0c1220]/85 px-3 py-6 text-center text-[11px] text-slate-200/65",
                        stageStyle.empty,
                      )}
                    >
                      <span
                        className={clsx(
                          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
                          stageStyle.topLine,
                        )}
                      />
                      <span className="font-medium tracking-wide">No leads here</span>
                    </div>
                  ) : null}
                  {cols.map((lead) => {
                    const oid = pipelineAttributionUserId(lead as CommandCenterLead);
                    const ownerName = oid ? profileLabels[oid] ?? "—" : "Unassigned";
                    const hue = oid ? hashHue(oid) : 0;
                    const src = lead.import_filename?.trim() ? "Import" : "Manual";
                    const demoClaimUid = demoBuildClaimedByUserId(lead);
                    const demoBuilderLabel = demoClaimUid ? profileLabels[demoClaimUid] ?? "Owner" : null;
                    const stagnantH = stagnantHoursInStage(lead);
                    const staleLevel = newOrCalledStaleLevel(col, stagnantH);
                    const staleTitle =
                      stagnantH != null
                        ? `In ${col} · ~${Math.floor(stagnantH)}h since created — prioritize follow-up`
                        : undefined;
                    const isWebLead = isWebSourcePipelineLead(lead);
                    return (
                      <motion.div
                        key={lead.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28 }}
                        className="min-w-0"
                      >
                        <HoverTiltCard>
                          <button
                            type="button"
                            title={staleLevel ? staleTitle : undefined}
                            onClick={() => onOpenLead(lead)}
                            className={clsx(
                              "group relative w-full overflow-hidden rounded-lg border border-[#222] bg-[#0c0c0c] px-2.5 py-2 text-left transition hover:border-zinc-600",
                              stageStyle.card,
                              (lead.status ?? "").trim().toLowerCase() === "pending close" &&
                                "border-amber-500/40 bg-amber-950/20",
                              staleLevel === "warn" &&
                                "border-amber-500/40 ring-1 ring-amber-500/25 shadow-[0_0_20px_-10px_rgba(245,158,11,0.35)]",
                              staleLevel === "critical" &&
                                "border-rose-500/45 ring-1 ring-rose-500/30 shadow-[0_0_22px_-8px_rgba(244,63,94,0.45)]",
                              isWebLead &&
                                "border-cyan-500/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.07),rgba(12,12,14,0.98))] shadow-[0_0_28px_-14px_rgba(34,211,238,0.25)]",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-slate-100">
                                  {lead.company_name ?? "Untitled"}
                                </span>
                              </div>
                            </div>
                            <p className="mt-1 truncate text-[12px] font-semibold text-slate-300">
                              {displayLeadPhone(lead.phone) || "—"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {staleLevel === "critical" ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded-md border border-rose-400/55 bg-rose-500/22 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-100"
                                  title={staleTitle}
                                >
                                  <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                                  Stale
                                </span>
                              ) : staleLevel === "warn" ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded-md border border-amber-400/50 bg-amber-500/18 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100"
                                  title={staleTitle}
                                >
                                  <Clock className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                                  Aging
                                </span>
                              ) : null}
                              {isLeadHighPriority(lead) ? (
                                <span className="rounded-md border border-rose-400/45 bg-rose-500/22 px-2 py-0.5 text-[10px] font-bold text-rose-100">
                                  Priority
                                </span>
                              ) : null}
                              <span className="rounded border border-[#333] bg-zinc-900/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
                                {(lead.status ?? "—").slice(0, 14)}
                              </span>
                              <span className="rounded border border-[#333] bg-zinc-900/80 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
                                {src}
                              </span>
                              {isWebLead ? (
                                <span className="rounded border border-cyan-500/35 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-200/90">
                                  Web
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                              <span
                                className={clsx(
                                  "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
                                  oid
                                    ? "border-cyan-300/45 bg-cyan-500/18 text-cyan-100"
                                    : "border-rose-300/45 bg-rose-500/16 text-rose-100",
                                )}
                                style={oid ? { color: `hsl(${hue}, 85%, 78%)` } : undefined}
                              >
                                {oid ? "Assigned" : "Unassigned"}
                              </span>
                              {col === "Interested" && isDemoSiteFeatureEnabled() ? (
                                hasDemoSiteUrl(lead) ? (
                                  <span className="inline-flex rounded-md border border-emerald-300/40 bg-emerald-500/14 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-100/95">
                                    Demo Done
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-md border border-amber-400/55 bg-amber-500/[0.07] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200/90">
                                    Demo Needs Done
                                  </span>
                                )
                              ) : null}
                              {col === "Interested" &&
                              isDemoSiteFeatureEnabled() &&
                              isDemoBuildClaimFeatureEnabled() &&
                              demoBuilderLabel ? (
                                <span
                                  className="inline-flex max-w-full rounded-md border border-sky-400/40 bg-sky-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-sky-100/90"
                                  title="Owner building this demo"
                                >
                                  <span className="truncate">Building: {demoBuilderLabel}</span>
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span
                                className="min-w-0 truncate text-[11px] font-semibold text-slate-300"
                                title={oid ? ownerName : undefined}
                              >
                                {oid ? ownerName : "—"}
                              </span>
                              <span className="shrink-0 text-[12px] font-bold text-slate-200">
                                {formatRelative(lead.created_at ?? null)}
                              </span>
                            </div>
                            {lead.notes ? (
                              <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">{lead.notes}</p>
                            ) : null}
                          </button>
                        </HoverTiltCard>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
