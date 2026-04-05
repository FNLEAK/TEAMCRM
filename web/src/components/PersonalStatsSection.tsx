"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  LEAD_STATUSES,
  NON_CANONICAL_STAGE_KEY,
  pipelineStageDisplayLabel,
} from "@/lib/leadTypes";
import { utcCalendarWeekBounds } from "@/lib/utcDayBounds";
import { HelpMarker } from "@/components/HelpMarker";

type Row = { id: string; status: string | null; appt_date: string | null };
type TrendPoint = { dayLabel: string; ymd: string; count: number };

function weeklyApptGoal(): number {
  const raw = process.env.NEXT_PUBLIC_WEEKLY_APPT_GOAL;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 8;
}

function computeRows(rows: Row[], trendDays: 7 | 14 | 30 = 14) {
  const totalAssigned = rows.length;
  const apptSetCount = rows.filter((r) => (r.status ?? "").trim() === "Appt Set").length;
  const closingPct =
    totalAssigned === 0 ? 0 : Math.round((apptSetCount / totalAssigned) * 1000) / 10;

  const byStatus = new Map<string, number>();
  for (const s of LEAD_STATUSES) byStatus.set(s, 0);
  byStatus.set(NON_CANONICAL_STAGE_KEY, 0);
  const known = new Set<string>([...LEAD_STATUSES]);
  for (const r of rows) {
    const raw = (r.status ?? "").trim();
    if (!raw) continue;
    const key = known.has(raw) ? raw : NON_CANONICAL_STAGE_KEY;
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }

  const { weekStartIso, weekEndExclusiveIso } = utcCalendarWeekBounds();
  const ws = weekStartIso.slice(0, 10);
  const we = weekEndExclusiveIso.slice(0, 10);
  let apptsThisWeek = 0;
  for (const r of rows) {
    if ((r.status ?? "").trim() !== "Appt Set") continue;
    const ad = (r.appt_date ?? "").slice(0, 10);
    if (!ad) continue;
    if (ad >= ws && ad < we) apptsThisWeek += 1;
  }

  const goal = weeklyApptGoal();
  const weekProgress = goal === 0 ? 0 : Math.min(1, apptsThisWeek / goal);
  const closedRatio = totalAssigned === 0 ? 0 : Math.min(1, apptSetCount / totalAssigned);

  const today = new Date();
  const trendPoints: TrendPoint[] = [];
  const prevTrendPoints: TrendPoint[] = [];
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if ((r.status ?? "").trim() !== "Appt Set") continue;
    const key = (r.appt_date ?? "").slice(0, 10);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const ymd = d.toISOString().slice(0, 10);
    trendPoints.push({
      ymd,
      dayLabel: d.toLocaleDateString(undefined, { weekday: "short" }),
      count: byDay.get(ymd) ?? 0,
    });
  }
  for (let i = trendDays * 2 - 1; i >= trendDays; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const ymd = d.toISOString().slice(0, 10);
    prevTrendPoints.push({
      ymd,
      dayLabel: d.toLocaleDateString(undefined, { weekday: "short" }),
      count: byDay.get(ymd) ?? 0,
    });
  }

  const currentTotal = trendPoints.reduce((sum, p) => sum + p.count, 0);
  const previousTotal = prevTrendPoints.reduce((sum, p) => sum + p.count, 0);
  const bestDay = trendPoints.reduce((a, b) => (b.count > a.count ? b : a), trendPoints[0] ?? { dayLabel: "—", ymd: "", count: 0 });
  const avgPerDay = trendPoints.length ? currentTotal / trendPoints.length : 0;

  return {
    totalAssigned,
    apptSetCount,
    closingPct,
    closedRatio,
    byStatus,
    apptsThisWeek,
    goal,
    weekProgress,
    trendPoints,
    prevTrendPoints,
    currentTotal,
    previousTotal,
    bestDay,
    avgPerDay,
  };
}

/** Neon cyan radial ring — value 0–100 */
function ClosingRateRing({ value }: { value: number }) {
  const gradId = useId().replace(/:/g, "");
  const r = 52;
  const stroke = 8;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const dash = (pct / 100) * c;

  return (
    <div className="relative mx-auto flex h-[190px] w-[190px] items-center justify-center">
      <svg className="h-full w-full -rotate-90 drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={`url(#cyanRing-${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
        <defs>
          <linearGradient id={`cyanRing-${gradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-bold tabular-nums text-cyan-300">{pct.toFixed(0)}%</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">closing</span>
      </div>
    </div>
  );
}

const BAR_PALETTE = [
  "from-rose-600/90 to-red-500/80",
  "from-emerald-500/90 to-lime-400/80",
  "from-rose-500/80 to-amber-500/70",
  "from-emerald-600/85 to-green-400/75",
  "from-rose-700/80 to-pink-500/70",
];

const ACTIVITY_ORDER = [...LEAD_STATUSES, NON_CANONICAL_STAGE_KEY] as const;

function ActivityBars({ byStatus }: { byStatus: Map<string, number> }) {
  const entries = ACTIVITY_ORDER.map((s) => ({ status: s, count: byStatus.get(s) ?? 0 }));
  const max = Math.max(1, ...entries.map((e) => e.count));

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(({ status, count }, i) => (
        <div key={status}>
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="font-medium text-zinc-300">{pipelineStageDisplayLabel(status)}</span>
            <span className="tabular-nums text-zinc-500">{count}</span>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/[0.12]">
            <div
              className={clsx(
                "h-full rounded-full bg-gradient-to-r shadow-[0_0_12px_-2px_rgba(34,197,94,0.35)]",
                BAR_PALETTE[i % BAR_PALETTE.length],
              )}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MomentumChart({ points, previousPoints }: { points: TrendPoint[]; previousPoints: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count), ...previousPoints.map((p) => p.count));
  const width = 680;
  const height = 170;
  const padX = 18;
  const padY = 18;
  const step = (width - padX * 2) / Math.max(1, points.length - 1);
  const chartH = height - padY * 2;
  const coords = points.map((p, i) => {
    const x = padX + i * step;
    const y = padY + chartH - (p.count / max) * chartH;
    return { x, y, ...p };
  });
  const prevCoords = previousPoints.map((p, i) => {
    const x = padX + i * step;
    const y = padY + chartH - (p.count / max) * chartH;
    return { x, y, ...p };
  });
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const prevPolyline = prevCoords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="momentum-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((k) => {
          const y = padY + chartH - chartH * k;
          return <line key={k} x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
        })}
        <polyline
          fill="none"
          stroke="rgba(148,163,184,0.45)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 5"
          points={prevPolyline}
        />
        <polyline fill="none" stroke="url(#momentum-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polyline} />
        {coords.map((c) => (
          <circle key={c.ymd} cx={c.x} cy={c.y} r="3.2" fill="#22d3ee" />
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-7 gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
    </div>
  );
}

export function PersonalStatsSection({ userId }: { userId: string }) {
  const hasClaimedBy = process.env.NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY !== "false";
  const showLiveBadge = hasClaimedBy;
  const [rows, setRows] = useState<Row[]>([]);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!hasClaimedBy) {
      setLoading(false);
      setRows([]);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { data, error: qErr } = await supabase
      .from("leads")
      .select("id,status,appt_date")
      .eq("claimed_by", userId);
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setError(null);
      setRows((data as Row[] | null) ?? []);
    }
    setLoading(false);
  }, [hasClaimedBy, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasClaimedBy) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`personal-stats-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => void load(), 350);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [hasClaimedBy, userId, load]);

  const metrics = useMemo(() => computeRows(rows, trendDays), [rows, trendDays]);

  return (
    <section
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-b from-cyan-500/[0.04] via-[#0b0c0f]/95 to-[#0b0c0f]/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_40px_-24px_rgba(34,211,238,0.65)] ring-1 ring-cyan-300/12 @md:p-7",
      )}
    >
      {showLiveBadge ? (
        <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            Live sync
          </span>
        </div>
      ) : null}

      <p className="max-w-3xl pr-24 text-sm text-zinc-300/85">
        Metrics use leads where <code className="text-zinc-400">claimed_by</code> is your user id — not the full team
        book.
      </p>

      {!hasClaimedBy ? (
        <p className="mt-6 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          Add a <code className="text-amber-100">claimed_by</code> column (see profiles-and-claimed.sql). Personal Stats
          stays hidden while <code className="text-amber-100">NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY=false</code>.
        </p>
      ) : null}

      {hasClaimedBy && error ? (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      ) : null}

      {hasClaimedBy && loading ? (
        <p className="mt-8 text-sm text-zinc-500">Loading your stats…</p>
      ) : null}

      {hasClaimedBy && !loading && !error ? (
        <div className="mt-7 space-y-6">
          <div className="grid grid-cols-1 gap-4 @md:grid-cols-3">
            <div className="rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/[0.15] to-cyan-500/[0.04] px-4 py-3 shadow-[0_0_22px_-12px_rgba(34,211,238,0.8)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/85">Assigned leads</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-cyan-100">{metrics.totalAssigned}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.16] to-emerald-500/[0.04] px-4 py-3 shadow-[0_0_22px_-12px_rgba(16,185,129,0.8)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/85">Appt set</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-200">{metrics.apptSetCount}</p>
            </div>
            <div className="rounded-xl border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.16] to-violet-500/[0.04] px-4 py-3 shadow-[0_0_22px_-12px_rgba(167,139,250,0.8)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/85">Booked ratio</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-violet-100">{Math.round(metrics.closedRatio * 100)}%</p>
            </div>
          </div>

          <div className="relative rounded-xl border border-cyan-300/20 bg-gradient-to-b from-cyan-500/[0.06] to-black/45 p-6 ring-1 ring-cyan-500/20 shadow-[0_0_28px_-18px_rgba(34,211,238,0.9)]">
            <HelpMarker
              accent="crimson"
              text="Momentum graph: last 14 days of appointments set. Use this to quickly spot consistency and recent lift."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Weekly momentum</p>
                <p className="mt-1 text-xs text-zinc-400">Appointments trend with previous-period overlay</p>
              </div>
              <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-1">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setTrendDays(d as 7 | 14 | 30)}
                    className={clsx(
                      "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                      trendDays === d ? "bg-cyan-500/20 text-cyan-100" : "text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 @md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Current period</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-cyan-100">{metrics.currentTotal}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Previous period</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-zinc-200">{metrics.previousTotal}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Best day / avg</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-200">
                  {metrics.bestDay.count} <span className="text-sm text-zinc-400">· {metrics.avgPerDay.toFixed(1)}</span>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <MomentumChart points={metrics.trendPoints} previousPoints={metrics.prevTrendPoints} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
          <div className="relative rounded-xl border border-cyan-300/20 bg-gradient-to-b from-cyan-500/[0.06] to-black/45 p-6 ring-1 ring-cyan-500/25 shadow-[0_0_24px_-16px_rgba(34,211,238,0.9)]">
            <HelpMarker
              accent="crimson"
              text="Conversion Rate: Percentage of your leads that have moved from NEW to APPT SET."
            />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">My closing rate</p>
            <p className="mt-1 text-xs leading-snug text-zinc-500">
              Appt Set ÷ your assigned leads × 100
            </p>
            <ClosingRateRing value={metrics.closingPct} />
            <p className="mt-2 text-center text-sm text-zinc-400">
              <span className="font-medium text-emerald-400/90">{metrics.apptSetCount}</span> appt set ·{" "}
              <span className="text-zinc-400">{metrics.totalAssigned}</span> assigned
            </p>
          </div>

          <div className="relative rounded-xl border border-violet-300/20 bg-gradient-to-b from-violet-500/[0.07] to-black/45 p-6 ring-1 ring-violet-500/20 shadow-[0_0_24px_-16px_rgba(167,139,250,0.9)]">
            <HelpMarker
              accent="crimson"
              text="Conversion Rate: Percentage of your leads that have moved from NEW to APPT SET."
            />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/80">Activity breakdown</p>
            <p className="mt-1 text-xs text-zinc-500">Status mix on your book</p>
            <div className="mt-4">
              <ActivityBars byStatus={metrics.byStatus} />
            </div>
          </div>

          <div className="relative rounded-xl border border-emerald-300/20 bg-gradient-to-b from-emerald-500/[0.07] to-black/45 p-6 ring-1 ring-emerald-500/20 shadow-[0_0_24px_-16px_rgba(16,185,129,0.9)]">
            <HelpMarker
              accent="crimson"
              text="Appt Set Status: Only use this when a firm date/time has been agreed upon. This will trigger the calendar scheduler."
            />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/80">Weekly goal</p>
            <p className="mt-1 text-xs text-zinc-500">
              Appt Set with date this week · goal {metrics.goal} (
              <code className="text-zinc-500">NEXT_PUBLIC_WEEKLY_APPT_GOAL</code>)
            </p>
            <div className="mt-7">
              <div className="flex justify-between text-base">
                <span className="font-semibold tabular-nums text-emerald-400">{metrics.apptsThisWeek}</span>
                <span className="text-zinc-400">/ {metrics.goal}</span>
              </div>
              <div className="mt-3 h-5 overflow-hidden rounded-full bg-zinc-900 ring-1 ring-white/[0.14]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-emerald-500 shadow-[0_0_20px_-4px_rgba(34,197,94,0.55)] transition-[width] duration-700 ease-out"
                  style={{ width: `${metrics.weekProgress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                {Math.round(metrics.weekProgress * 100)}% of weekly appointment target
              </p>
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </section>
  );
}
