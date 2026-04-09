"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import clsx from "clsx";
import { isDemoBuildClaimFeatureEnabled } from "@/lib/demoBuildClaimFeature";
import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";
import {
  demoBuildClaimedByUserId,
  hasDemoSiteUrl,
  isLeadHighPriority,
  LEAD_STATUSES,
  NON_CANONICAL_STAGE_KEY,
  pipelineStageDisplayLabel,
} from "@/lib/leadTypes";
import {
  loadCommandCenterPayload,
  loadSquadStreakMetrics,
  pipelineAttributionUserId,
  type CommandCenterLead,
  type CommandCenterPayload,
} from "@/lib/commandCenterData";

const CC_LEAD_REALTIME_KEYS = [
  "company_name",
  "phone",
  "website",
  "status",
  "notes",
  "appt_date",
  "claimed_by",
  "appt_scheduled_by",
  "last_activity_by",
  "import_filename",
  "created_at",
  "is_high_priority",
  "demo_site_url",
  "demo_site_sent",
  "demo_site_sent_at",
  "demo_build_claimed_by",
  "demo_build_claimed_at",
] as const satisfies readonly (keyof CommandCenterLead)[];

function patchCommandCenterLeadFromRealtime(lead: CommandCenterLead, raw: Record<string, unknown>): CommandCenterLead {
  const next: CommandCenterLead = { ...lead };
  for (const k of CC_LEAD_REALTIME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) {
      (next as Record<string, unknown>)[k] = raw[k];
    }
  }
  return next;
}
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ensureSupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";
import { HelpMarker } from "@/components/HelpMarker";
import { UiSelect } from "@/components/UiSelect";
import { useDeskLayout } from "@/components/DeskLayoutContext";

const KANBAN_COLUMNS = [...LEAD_STATUSES, NON_CANONICAL_STAGE_KEY] as const;

const STAGE_CARD_STYLE: Record<string, string> = {
  New: "border-emerald-500/35 bg-emerald-500/10 shadow-[0_0_32px_-12px_rgba(52,211,153,0.35)]",
  Called: "border-cyan-500/35 bg-cyan-500/10 shadow-[0_0_32px_-12px_rgba(34,211,238,0.25)]",
  Interested: "border-violet-500/35 bg-violet-500/10 shadow-[0_0_32px_-12px_rgba(167,139,250,0.3)]",
  "Appt Set": "border-amber-500/35 bg-amber-500/10 shadow-[0_0_32px_-12px_rgba(251,191,36,0.25)]",
  "Pending Close": "border-amber-300/50 bg-amber-500/12 shadow-[0_0_34px_-10px_rgba(251,191,36,0.45)]",
  "Not Interested": "border-rose-500/35 bg-rose-500/10 shadow-[0_0_32px_-12px_rgba(251,113,133,0.25)]",
  [NON_CANONICAL_STAGE_KEY]:
    "border-slate-500/40 bg-slate-500/10 shadow-[0_0_24px_-12px_rgba(148,163,184,0.2)]",
};

const KANBAN_COLUMN_STYLE: Record<string, { shell: string; topLine: string; heading: string; empty: string; card: string }> = {
  New: {
    shell: "border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(52,211,153,0.8)]",
    topLine: "via-emerald-300/50",
    heading: "text-emerald-100/80",
    empty: "border-emerald-300/20 from-emerald-500/[0.07]",
    card: "hover:border-emerald-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(52,211,153,0.7)]",
  },
  Called: {
    shell: "border-cyan-400/20 bg-gradient-to-b from-cyan-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(34,211,238,0.8)]",
    topLine: "via-cyan-300/50",
    heading: "text-cyan-100/80",
    empty: "border-cyan-300/20 from-cyan-500/[0.07]",
    card: "hover:border-cyan-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(34,211,238,0.7)]",
  },
  Interested: {
    shell: "border-violet-400/20 bg-gradient-to-b from-violet-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(167,139,250,0.8)]",
    topLine: "via-violet-300/50",
    heading: "text-violet-100/80",
    empty: "border-violet-300/20 from-violet-500/[0.07]",
    card: "hover:border-violet-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(167,139,250,0.7)]",
  },
  "Appt Set": {
    shell: "border-amber-400/20 bg-gradient-to-b from-amber-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(251,191,36,0.8)]",
    topLine: "via-amber-300/50",
    heading: "text-amber-100/80",
    empty: "border-amber-300/20 from-amber-500/[0.07]",
    card: "hover:border-amber-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(251,191,36,0.7)]",
  },
  "Pending Close": {
    shell: "border-amber-300/25 bg-gradient-to-b from-amber-500/[0.09] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_30px_-18px_rgba(251,191,36,0.85)]",
    topLine: "via-amber-200/55",
    heading: "text-amber-100/85",
    empty: "border-amber-300/22 from-amber-500/[0.08]",
    card: "hover:border-amber-300/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_-10px_rgba(251,191,36,0.75)]",
  },
  "Not Interested": {
    shell: "border-rose-400/20 bg-gradient-to-b from-rose-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(251,113,133,0.8)]",
    topLine: "via-rose-300/50",
    heading: "text-rose-100/80",
    empty: "border-rose-300/20 from-rose-500/[0.07]",
    card: "hover:border-rose-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(251,113,133,0.7)]",
  },
  [NON_CANONICAL_STAGE_KEY]: {
    shell: "border-slate-400/20 bg-gradient-to-b from-slate-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_24px_-18px_rgba(148,163,184,0.8)]",
    topLine: "via-slate-300/45",
    heading: "text-slate-100/75",
    empty: "border-slate-300/20 from-slate-500/[0.06]",
    card: "hover:border-slate-300/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_16px_-10px_rgba(148,163,184,0.6)]",
  },
};

function columnKey(lead: CommandCenterLead): (typeof KANBAN_COLUMNS)[number] {
  const s = (lead.status ?? "").trim();
  if ((LEAD_STATUSES as readonly string[]).includes(s)) {
    return s as (typeof KANBAN_COLUMNS)[number];
  }
  return NON_CANONICAL_STAGE_KEY;
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

export function PipelineCommandCenter({
  initial,
  userId,
}: {
  initial: CommandCenterPayload;
  userId: string;
}) {
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [source, setSource] = useState<string>("all");

  const [cc, setCc] = useState(initial);

  useEffect(() => {
    setCc(initial);
  }, [initial]);

  const { leads, profileLabels, ownerRoles, metrics, stageCounts } = cc;
  const { isMobileShell: layoutMobileShell } = useDeskLayout();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const bumpStreak = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void (async () => {
          const next = await loadSquadStreakMetrics(supabase, userId);
          if (!cancelled) {
            setCc((prev) => ({
              ...prev,
              metrics: {
                ...prev.metrics,
                squadStreakDays: next.squadStreakDays,
                streakProgress: next.streakProgress,
              },
            }));
          }
        })();
      }, 100);
    };

    const ch = supabase
      .channel(`pipeline-cmd-streak-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_activity", filter: `user_id=eq.${userId}` },
        bumpStreak,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const uid = (payload.new as { last_activity_by?: string | null })?.last_activity_by;
          if (uid === userId) bumpStreak();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          const uid = (payload.new as { last_activity_by?: string | null })?.last_activity_by;
          if (uid === userId) bumpStreak();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        (payload) => {
          const uid = (payload.new as { user_id?: string | null })?.user_id;
          if (uid === userId) bumpStreak();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments" },
        (payload) => {
          const uid = (payload.new as { user_id?: string | null })?.user_id;
          if (uid === userId) bumpStreak();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub: { ch: ReturnType<typeof supabase.channel> | null } = { ch: null };

    const reloadPayload = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void (async () => {
          await ensureSupabaseRealtimeAuth(supabase);
          const { data, error } = await loadCommandCenterPayload(supabase, userId);
          if (!cancelled && !error && data) setCc(data);
        })();
      }, 450);
    };

    void (async () => {
      await ensureSupabaseRealtimeAuth(supabase);
      if (cancelled) return;
      sub.ch = supabase
        .channel(`pipeline-cmd-leads-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
          if (payload.eventType === "UPDATE" && payload.new && typeof payload.new === "object") {
            const row = payload.new as Record<string, unknown> & { id?: string };
            const id = typeof row.id === "string" ? row.id : null;
            if (id) {
              setCc((prev) => {
                if (!prev.leads.some((l) => l.id === id)) return prev;
                return {
                  ...prev,
                  leads: prev.leads.map((l) =>
                    l.id === id ? patchCommandCenterLeadFromRealtime(l, row) : l,
                  ),
                };
              });
            }
          }
          reloadPayload();
        })
        .subscribe();
    })();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      authSubscription.unsubscribe();
      if (sub.ch) void supabase.removeChannel(sub.ch);
    };
  }, [userId]);

  const ownerOptions = useMemo(() => {
    const roleById = new Map<string, "owner" | "team" | "both">();

    for (const l of leads) {
      const claimed = l.claimed_by?.trim();
      const scheduler = l.appt_scheduled_by?.trim();
      const lastAct = l.last_activity_by?.trim();

      if (claimed) {
        roleById.set(
          claimed,
          roleById.get(claimed) === "team" ? "both" : "owner",
        );
      }

      if (scheduler) {
        roleById.set(
          scheduler,
          roleById.get(scheduler) === "owner" ? "both" : "team",
        );
      }

      if (lastAct && lastAct !== claimed && lastAct !== scheduler) {
        roleById.set(lastAct, roleById.get(lastAct) === "owner" ? "both" : "team");
      }
    }

    return [...roleById.entries()]
      .map(([id, role]) => ({
        id,
        role: ownerRoles[id] ?? role,
      }))
      .sort((a, b) => (profileLabels[a.id] ?? a.id).localeCompare(profileLabels[b.id] ?? b.id));
  }, [leads, profileLabels, ownerRoles]);

  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      if (l.import_filename?.trim()) s.add(l.import_filename.trim());
      else s.add("Manual / quick add");
    }
    return [...s].sort();
  }, [leads]);

  const ownerFilterOptions = useMemo(
    () => [
      { value: "all", label: "All owners" },
      ...ownerOptions.map(({ id, role }) => ({
        value: id,
        label: `${profileLabels[id] ?? id.slice(0, 8)} (${
          role === "owner" ? "Owner" : role === "team" ? "Team" : "Owner/Team"
        })`,
      })),
    ],
    [ownerOptions, profileLabels],
  );

  const stageFilterOptions = useMemo(
    () => [
      { value: "all", label: "All stages" },
      ...KANBAN_COLUMNS.map((k) => ({ value: k, label: pipelineStageDisplayLabel(k) })),
    ],
    [],
  );

  const sourceFilterOptions = useMemo(
    () => [
      { value: "all", label: "All sources" },
      ...sourceOptions.map((s) => ({ value: s, label: s })),
    ],
    [sourceOptions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (q) {
        const blob = [
          l.company_name ?? "",
          l.phone ?? "",
          l.notes ?? "",
          l.website ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (owner !== "all") {
        if (pipelineAttributionUserId(l) !== owner) return false;
      }
      if (stageFilter !== "all") {
        if (stageFilter === NON_CANONICAL_STAGE_KEY) {
          if (columnKey(l) !== NON_CANONICAL_STAGE_KEY) return false;
        } else if ((l.status ?? "").trim() !== stageFilter) {
          return false;
        }
      }
      if (source !== "all") {
        const src = l.import_filename?.trim() ? l.import_filename.trim() : "Manual / quick add";
        if (src !== source) return false;
      }
      return true;
    });
  }, [leads, search, owner, stageFilter, source]);

  const byColumn = useMemo(() => {
    const m = new Map<string, CommandCenterLead[]>();
    for (const k of KANBAN_COLUMNS) m.set(k, []);
    for (const l of filtered) {
      const k = columnKey(l);
      m.get(k)!.push(l);
    }
    for (const k of KANBAN_COLUMNS) {
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
  }, [filtered]);

  const searchHref = (company: string) => {
    const q = encodeURIComponent(company.trim() || "");
    return q ? `/?q=${q}` : "/";
  };

  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (!id) return;
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  return (
    <div
      className={clsx(
        "flex min-w-0 flex-col gap-6 pb-20 text-slate-200",
        layoutMobileShell ? "@md:gap-10 @md:pb-16" : "md:gap-10 md:pb-16",
      )}
    >
      <header
        className={clsx(
          "rounded-2xl border border-cyan-300/15 bg-gradient-to-b from-cyan-500/[0.06] via-[#0b0c0f]/95 to-[#0b0c0f]/95 px-4 py-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(34,211,238,0.65)]",
          layoutMobileShell ? "@md:px-6 @md:py-8" : "md:px-6 md:py-8",
        )}
      >
        <p
          className={clsx(
            "text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75",
            layoutMobileShell ? "@md:text-[10px] @md:tracking-[0.28em]" : "md:text-[10px] md:tracking-[0.28em]",
          )}
        >
          Revenue operations · lead-to-close
        </p>
        <h1
          className={clsx(
            "mt-2 font-sans text-2xl font-semibold tracking-tight text-white",
            layoutMobileShell
              ? "@md:mt-3 @md:text-3xl @lg:text-[2.35rem]"
              : "md:mt-3 md:text-3xl lg:text-[2.35rem]",
          )}
        >
          Performance KPI Header
        </h1>
        <p
          className={clsx(
            "mx-auto mt-2 max-w-4xl text-sm leading-relaxed text-slate-300/90",
            layoutMobileShell
              ? "@md:mt-3 @md:text-base @md:text-slate-300/85"
              : "md:mt-3 md:text-base md:text-slate-300/85",
          )}
        >
          Unified view of accounts, meetings, and attribution — live from Supabase. Drag-free Kanban for
          triage; open the lead list for full drawer + realtime.
        </p>
      </header>

      {/* Top metrics — single column until lg so phone / tablet portrait stay readable */}
      <section
        id="ops-metrics"
        className={clsx(
          "scroll-mt-6 grid grid-cols-1 gap-3",
          layoutMobileShell ? "@md:grid-cols-3 @md:gap-4" : "md:grid-cols-3 md:gap-4",
        )}
      >
        <HoverTiltCard
          className={clsx(
            "relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.08] via-[#0b0c0f]/90 to-[#0b0c0f]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(34,211,238,0.75)]",
            layoutMobileShell ? "@md:rounded-xl @md:p-5" : "md:rounded-xl md:p-5",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
          <HelpMarker
            accent="crimson"
            text="ACTIVE LEADS: This is the total number of live prospects you are currently working. It automatically excludes anyone marked as 'Not Interested' to keep your focus on the money."
          />
          <div
            className={clsx(
              "flex items-start justify-between gap-3 pr-7",
              layoutMobileShell ? "@md:items-center @md:pr-8" : "md:items-center md:pr-8",
            )}
          >
            <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Open pipeline</p>
            <span className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
              Active
            </span>
          </div>
          <p
            className={clsx(
              "mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white",
              layoutMobileShell ? "@md:mt-2 @md:text-4xl" : "md:mt-2 md:text-4xl",
            )}
          >
            {metrics.openPipelineDisplay}
          </p>
          <p
            className={clsx(
              "mt-2 text-[13px] leading-snug text-slate-300/85",
              layoutMobileShell
                ? "@md:mt-1 @md:text-xs @md:text-slate-300/80"
                : "md:mt-1 md:text-xs md:text-slate-300/80",
            )}
          >
            {metrics.openPipelineSub}
          </p>
        </HoverTiltCard>
        <HoverTiltCard
          className={clsx(
            "relative overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.08] via-[#0b0c0f]/90 to-[#0b0c0f]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(167,139,250,0.75)]",
            layoutMobileShell ? "@md:rounded-xl @md:p-5" : "md:rounded-xl md:p-5",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
          <HelpMarker
            accent="crimson"
            text="WEEKLY GOAL: This tracks every appointment you have successfully locked in for the current week. It shows your immediate progress toward your weekly target."
          />
          <div
            className={clsx(
              "flex items-start justify-between gap-3 pr-7",
              layoutMobileShell ? "@md:items-center @md:pr-8" : "md:items-center md:pr-8",
            )}
          >
            <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/80">Appointments</p>
            <span className="shrink-0 rounded-full border border-violet-300/25 bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
              Weekly
            </span>
          </div>
          <p
            className={clsx(
              "mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white",
              layoutMobileShell ? "@md:mt-2 @md:text-4xl" : "md:mt-2 md:text-4xl",
            )}
          >
            {metrics.appointmentsToday}
          </p>
          <p
            className={clsx(
              "mt-2 text-[13px] leading-snug text-slate-300/85",
              layoutMobileShell
                ? "@md:mt-1 @md:text-xs @md:text-slate-300/80"
                : "md:mt-1 md:text-xs md:text-slate-300/80",
            )}
          >
            {metrics.apptsHeldThisWeek} held this week (Appt Set) · {metrics.apptsNext7Days} in next 7 days
          </p>
        </HoverTiltCard>
        <HoverTiltCard
          className={clsx(
            "relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.08] via-[#0b0c0f]/90 to-[#0b0c0f]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(16,185,129,0.75)]",
            layoutMobileShell ? "@md:rounded-xl @md:p-5" : "md:rounded-xl md:p-5",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
          <HelpMarker
            accent="crimson"
            text="YOUR EFFICIENCY: This percentage compares your 'Interested' and 'Appt Set' leads against your total active list. Higher percentage = Higher quality work."
          />
          <div
            className={clsx(
              "flex items-start justify-between gap-3 pr-7",
              layoutMobileShell ? "@md:items-center @md:pr-8" : "md:items-center md:pr-8",
            )}
          >
            <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Pipeline health</p>
            <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
              Quality
            </span>
          </div>
          <p
            className={clsx(
              "mt-3 text-3xl font-semibold tabular-nums tracking-tight text-emerald-300",
              layoutMobileShell ? "@md:mt-2 @md:text-4xl" : "md:mt-2 md:text-4xl",
            )}
          >
            {metrics.winRateDisplay}
          </p>
          <p
            className={clsx(
              "mt-2 text-[13px] leading-snug text-slate-300/85",
              layoutMobileShell
                ? "@md:mt-1 @md:text-xs @md:text-slate-300/80"
                : "md:mt-1 md:text-xs md:text-slate-300/80",
            )}
          >
            {metrics.winRateSub}
          </p>
        </HoverTiltCard>
      </section>

      {/* Squad streak */}
      <section
        id="squad-streak"
        className={clsx(
          "relative scroll-mt-6 rounded-2xl border border-transparent bg-[#0b0c0f]/80 p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)]",
          layoutMobileShell ? "@md:rounded-xl @md:p-5" : "md:rounded-xl md:p-5",
        )}
      >
        <HelpMarker
          accent="crimson"
          text="CONSISTENCY TRACKER: This shows how many days in a row you have logged activity (notes, calls, or status updates). Fill the bar to hit your 7-day target and unlock the streak bonus!"
        />
        <div
          className={clsx(
            "grid gap-3",
            layoutMobileShell ? "@md:grid-cols-[minmax(0,260px)_1fr]" : "md:grid-cols-[minmax(0,260px)_1fr]",
          )}
        >
          <HoverTiltCard
            className={clsx(
              "rounded-2xl border border-transparent bg-cyan-500/[0.05] p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2),0_0_30px_-18px_rgba(34,211,238,0.7)]",
              layoutMobileShell ? "@md:rounded-xl" : "md:rounded-xl",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Squad streak</p>
            <p className="mt-1 text-4xl font-semibold leading-none text-cyan-300">{metrics.squadStreakDays}d</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Consecutive UTC days with activity (notes, lead updates, appointments you touched)
            </p>
          </HoverTiltCard>

          <HoverTiltCard
            className={clsx(
              "rounded-2xl border border-transparent bg-violet-500/[0.04] p-4 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.2),0_0_36px_-20px_rgba(139,92,246,0.62)]",
              layoutMobileShell ? "@md:rounded-xl" : "md:rounded-xl",
            )}
            maxTilt={2.25}
            lift={0.5}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                Bonus track progress
              </p>
              <span className="rounded-full border border-violet-300/25 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                {(metrics.streakProgress * 100).toFixed(0)}%
              </span>
            </div>

            <div className="relative mt-3 h-4 overflow-hidden rounded-full border border-transparent bg-black/30 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)]">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:14.2857%_100%]" />
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-400 shadow-[0_0_18px_-4px_rgba(139,92,246,0.9)] transition-all duration-700"
                style={{ width: `${Math.round(metrics.streakProgress * 100)}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-500">
              <span>Day 0</span>
              <span>Day 3</span>
              <span>Day 5</span>
              <span className="text-amber-300/85">Day 7 target</span>
            </div>
          </HoverTiltCard>
        </div>
      </section>

      {/* Stage distribution */}
      <section id="stage-distribution" className="scroll-mt-6">
        <h2 className="text-sm font-semibold text-white">Stage distribution</h2>
        <p className="mt-1 text-xs text-slate-500">Volume by lifecycle stage (full book — not filtered)</p>
        <div
          className={clsx(
            "mt-4 grid grid-cols-1 gap-2.5",
            layoutMobileShell
              ? "@sm:grid-cols-2 @md:grid-cols-3 @md:gap-3 @xl:grid-cols-6"
              : "sm:grid-cols-2 md:grid-cols-3 md:gap-3 xl:grid-cols-6",
          )}
        >
          {stageCounts.map((s) => (
            <div
              key={s.status}
              className={clsx(
                "rounded-xl border px-2.5 py-2.5 text-center",
                layoutMobileShell ? "@sm:px-4 @sm:py-3" : "sm:px-4 sm:py-3",
                STAGE_CARD_STYLE[s.status] ?? STAGE_CARD_STYLE[NON_CANONICAL_STAGE_KEY],
              )}
            >
              <p
                className={clsx(
                  "text-[9px] font-extrabold uppercase leading-tight tracking-[0.1em] text-slate-200 [text-shadow:0_0_10px_rgba(148,163,184,0.25)]",
                  layoutMobileShell ? "@sm:text-[11px] @sm:tracking-[0.13em]" : "sm:text-[11px] sm:tracking-[0.13em]",
                )}
              >
                {pipelineStageDisplayLabel(s.status)}
              </p>
              <p
                className={clsx(
                  "mt-1.5 text-xl font-bold tabular-nums text-white",
                  layoutMobileShell ? "@sm:mt-2 @sm:text-2xl" : "sm:mt-2 sm:text-2xl",
                )}
              >
                {s.count}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Filters */}
      <section
        id="command-filters"
        className="relative scroll-mt-6 overflow-hidden rounded-xl border border-transparent bg-gradient-to-br from-cyan-500/[0.06] via-[#0b0c0f]/95 to-[#0b0c0f]/95 p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14),0_0_30px_-22px_rgba(34,211,238,0.65)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <HelpMarker
          accent="crimson"
          className="right-[10px] top-[10px]"
          text="QUICK FIND: Type any business name, phone number, or tag here to instantly filter the list. Use this to jump straight to a specific lead you're looking for.
TEAM FILTER: View leads assigned to specific teammates. Use 'All Owners' to see the full shared pool, or select your own name to focus on your personal queue.
PIPELINE STATUS: Filter by where a lead is in the process. Select 'Appt Set' to see your upcoming deals, or 'New' to find fresh prospects that haven't been called yet.
LEAD ORIGIN: Track where your leads came from. This helps you identify which marketing channels or manual imports are providing the best quality prospects."
        />
        <div
          className={clsx(
            "flex flex-col gap-3",
            layoutMobileShell
              ? "@lg:flex-row @lg:items-end @lg:gap-4"
              : "lg:flex-row lg:items-end lg:gap-4",
          )}
        >
          <label className="min-w-0 flex-1">
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
              Search
            </span>
            <input
              className="mt-1.5 w-full rounded-xl border border-transparent bg-black/45 px-3.5 py-2.5 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18),inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-slate-500 transition focus:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35),inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-1 focus:ring-cyan-400/25"
              placeholder="Account, contact, phone, tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className={clsx("w-full", layoutMobileShell ? "@lg:w-44" : "lg:w-44")}>
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
              Owner
            </span>
            <UiSelect
              className="mt-1.5 rounded-xl border-cyan-400/18 bg-black/45 shadow-inner shadow-black/40"
              value={owner}
              onChange={setOwner}
              options={ownerFilterOptions}
            />
          </label>
          <label className={clsx("w-full", layoutMobileShell ? "@lg:w-44" : "lg:w-44")}>
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
              Stage
            </span>
            <UiSelect
              className="mt-1.5 rounded-xl border-cyan-400/18 bg-black/45 shadow-inner shadow-black/40"
              value={stageFilter}
              onChange={setStageFilter}
              options={stageFilterOptions}
            />
          </label>
          <label className={clsx("w-full", layoutMobileShell ? "@lg:w-44" : "lg:w-44")}>
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
              Source
            </span>
            <UiSelect
              className="mt-1.5 rounded-xl border-cyan-400/18 bg-black/45 shadow-inner shadow-black/40"
              value={source}
              onChange={setSource}
              options={sourceFilterOptions}
            />
          </label>
          <p
            className={clsx(
              "shrink-0 text-right text-[11px] text-slate-300/85",
              layoutMobileShell ? "@lg:pb-2" : "lg:pb-2",
            )}
          >
            <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-0.5 font-semibold tracking-wide text-cyan-100/90">
              {filtered.length} of {leads.length} records
            </span>
          </p>
        </div>
      </section>

      {/* Kanban */}
      <section id="kanban-pipeline" className="scroll-mt-6">
        <div className={clsx("flex flex-col gap-1", layoutMobileShell ? "@sm:block" : "sm:block")}>
          <h2 className="text-sm font-semibold text-white">Kanban pipeline</h2>
          <p className={clsx("text-xs text-slate-500", layoutMobileShell ? "@sm:mt-1" : "sm:mt-1")}>
            Click a card to jump to the lead list with search.
          </p>
          <p
            className={clsx(
              "text-[11px] text-cyan-200/60",
              layoutMobileShell ? "@min-[780px]:hidden" : "min-[780px]:hidden",
            )}
          >
            Stages stack here — widen the panel (or use desktop layout) for the horizontal board.
          </p>
        </div>
        <div
          className={clsx(
            "board-scroll mt-4 overflow-x-hidden pb-2",
            layoutMobileShell ? "@min-[780px]:overflow-x-auto" : "min-[780px]:overflow-x-auto",
          )}
        >
          <div
            className={clsx(
              "flex w-full min-w-0 flex-col gap-4",
              layoutMobileShell
                ? "@min-[780px]:min-w-[1320px] @min-[780px]:flex-row @min-[780px]:gap-3"
                : "min-[780px]:min-w-[1320px] min-[780px]:flex-row min-[780px]:gap-3",
            )}
          >
            {KANBAN_COLUMNS.map((col) => {
              const cols = byColumn.get(col) ?? [];
              const stageStyle =
                KANBAN_COLUMN_STYLE[col] ?? KANBAN_COLUMN_STYLE[NON_CANONICAL_STAGE_KEY];
              return (
                <div
                  key={col}
                  className={clsx(
                    "relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl",
                    layoutMobileShell
                      ? "@min-[780px]:min-w-[185px] @min-[780px]:flex-1 @min-[780px]:shrink-0"
                      : "min-[780px]:min-w-[185px] min-[780px]:flex-1 min-[780px]:shrink-0",
                    stageStyle.shell,
                  )}
                >
                  <div
                    className={clsx(
                      "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
                      stageStyle.topLine,
                    )}
                  />
                  <div className="sticky top-0 z-10 border-b border-cyan-400/18 bg-[linear-gradient(180deg,rgba(20,25,37,0.96),rgba(15,20,30,0.94))] px-3 py-2.5 backdrop-blur">
                    <p
                      className={clsx(
                        "text-[11px] font-extrabold uppercase tracking-[0.16em] [text-shadow:0_0_12px_rgba(34,211,238,0.28)]",
                        stageStyle.heading,
                      )}
                    >
                      {pipelineStageDisplayLabel(col)}
                    </p>
                    <p className="mt-0.5 text-2xl font-extrabold leading-none tabular-nums text-cyan-100 [text-shadow:0_0_12px_rgba(34,211,238,0.32)]">
                      {cols.length}
                    </p>
                  </div>
                  <div
                    className={clsx(
                      /* Mobile: one vertical scroll (page) — avoids scroll traps on stacked stages */
                      "space-y-1.5 overflow-y-visible p-2 max-h-none",
                      layoutMobileShell
                        ? "@min-[780px]:max-h-[68vh] @min-[780px]:overflow-y-auto"
                        : "min-[780px]:max-h-[68vh] min-[780px]:overflow-y-auto",
                    )}
                  >
                    {cols.length === 0 ? (
                      <div
                        className={clsx(
                          "relative overflow-hidden rounded-lg border border-dashed border-cyan-400/22 bg-gradient-to-b via-[#101827]/85 to-[#0c1220]/85 px-3 py-6 text-center text-[11px] text-slate-200/65",
                          stageStyle.empty,
                        )}
                      >
                        <span className={clsx("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent", stageStyle.topLine)} />
                        <span className="font-medium tracking-wide">No leads here</span>
                      </div>
                    ) : null}
                    {cols.map((lead) => {
                      const oid = pipelineAttributionUserId(lead);
                      const ownerName = oid ? profileLabels[oid] ?? "—" : "Unassigned";
                      const hue = oid ? hashHue(oid) : 0;
                      const src = lead.import_filename?.trim() ? "Import" : "Manual";
                      const demoClaimUid = demoBuildClaimedByUserId(lead);
                      const demoBuilderLabel = demoClaimUid
                        ? profileLabels[demoClaimUid] ?? "Owner"
                        : null;
                      return (
                        <Link
                          key={lead.id}
                          href={searchHref(lead.company_name ?? "")}
                          className={clsx(
                            "relative block overflow-hidden rounded-lg border border-cyan-400/20 bg-gradient-to-b from-[#0f1422]/92 to-[#0a0e18]/92 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(34,211,238,0.12),0_10px_20px_-16px_rgba(0,0,0,0.9)] transition",
                            stageStyle.card,
                            (lead.status ?? "").trim().toLowerCase() === "pending close" &&
                              "border-amber-400/55 bg-amber-500/[0.08] shadow-[0_0_26px_-8px_rgba(251,191,36,0.75)]",
                          )}
                        >
                          <span className={clsx("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent", stageStyle.topLine)} />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-slate-100">
                                {lead.company_name ?? "Untitled"}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 truncate text-[12px] font-semibold text-slate-300">{lead.phone ?? "—"}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {isLeadHighPriority(lead) ? (
                              <span className="rounded-md border border-rose-400/45 bg-rose-500/22 px-2 py-0.5 text-[10px] font-bold text-rose-100">
                                Priority
                              </span>
                            ) : null}
                            <span className="rounded-md border border-cyan-400/22 bg-cyan-500/[0.08] px-2 py-0.5 text-[10px] font-bold text-cyan-100/95">
                              {(lead.status ?? "—").slice(0, 12)}
                            </span>
                            <span className="rounded-md border border-violet-300/35 bg-violet-500/18 px-2 py-0.5 text-[10px] font-bold text-violet-100">
                              {src}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                            <span className="shrink-0 text-[12px] font-bold text-slate-200">{formatRelative(lead.created_at)}</span>
                          </div>
                          {lead.notes ? (
                            <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">{lead.notes}</p>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
