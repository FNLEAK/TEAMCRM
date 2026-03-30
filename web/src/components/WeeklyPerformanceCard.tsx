"use client";

import { TeamMemberAvatar } from "@/components/TeamMemberAvatar";
import { displayProfessionalName } from "@/lib/profileDisplay";
import type { TeamProfile } from "@/lib/leadTypes";

export type WeeklyApptRank = {
  userId: string;
  count: number;
  previousWeekCount: number;
};

function TrendGlyph({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25"
        title="Up vs last week"
        aria-hidden
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M6 2.5v7M6 2.5L3 5.5M6 2.5l3 3"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-500/12 text-rose-300 ring-1 ring-rose-400/22"
        title="Down vs last week"
        aria-hidden
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M6 9.5v-7M6 9.5L3 6.5M6 9.5l3-3"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-500/15 text-zinc-500 ring-1 ring-zinc-500/20"
      title="Same as last week"
      aria-hidden
    >
      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2.5 6h7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function WeeklyPerformanceCard({
  ranks,
  profileMap,
  currentUserId,
  teamMemberColorOrder,
}: {
  ranks: WeeklyApptRank[];
  profileMap: Record<string, TeamProfile>;
  currentUserId: string;
  teamMemberColorOrder: string[];
}) {
  const max = ranks.reduce((m, r) => Math.max(m, r.count), 0) || 1;

  return (
    <aside className="crm-leaderboard-glass relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] ring-1 ring-white/10">
      <div className="relative border-b border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Leaderboard</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Weekly performance</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          Appt Set with a date this week (Mon–Sun UTC) · trend vs last week
        </p>
      </div>
      <div className="relative flex flex-1 flex-col gap-1 px-3 py-3">
        {ranks.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-zinc-500">No appointments logged this week yet.</p>
        ) : (
          ranks.map((row, i) => {
            const name = displayProfessionalName(row.userId, profileMap[row.userId]);
            const isYou = row.userId === currentUserId;
            const pct = Math.round((row.count / max) * 100);
            const trend: "up" | "down" | "flat" =
              row.count > row.previousWeekCount ? "up" : row.count < row.previousWeekCount ? "down" : "flat";
            return (
              <div
                key={row.userId}
                className={`crm-leaderboard-row relative overflow-hidden rounded-lg border px-3 py-2.5 transition duration-200 ${
                  isYou
                    ? "border-emerald-900/50 bg-emerald-950/30"
                    : "border-white/10 bg-[#111111]"
                }`}
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400/20 via-emerald-500/10 to-transparent opacity-80"
                  style={{ width: `${Math.max(pct, row.count > 0 ? 8 : 0)}%` }}
                />
                <div className="relative flex items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      i === 0
                        ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/35"
                        : i === 1
                          ? "bg-zinc-300/12 text-zinc-100 ring-1 ring-zinc-400/25"
                          : i === 2
                            ? "bg-orange-900/35 text-orange-100 ring-1 ring-orange-700/30"
                            : "bg-zinc-800/60 text-zinc-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <TrendGlyph trend={trend} />
                  <TeamMemberAvatar
                    userId={row.userId}
                    profile={profileMap[row.userId]}
                    teamMemberColorOrder={teamMemberColorOrder}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-zinc-50">
                      <span className="truncate">{name}</span>
                      {isYou ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Appt set</p>
                  </div>
                  <span className="shrink-0 text-xl font-semibold tabular-nums text-emerald-200/95">{row.count}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
