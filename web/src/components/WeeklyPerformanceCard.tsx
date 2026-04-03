"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { HelpMarker } from "@/components/HelpMarker";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { displayProfessionalName } from "@/lib/profileDisplay";
import type { TeamProfile } from "@/lib/leadTypes";

export type WeeklyApptRank = {
  userId: string;
  count: number;
  previousWeekCount: number;
};

function TrendGlyph({
  trend,
  tone,
}: {
  trend: "up" | "down" | "flat";
  tone: "gold" | "emerald" | "yellow" | "orange" | "red" | "neutral";
}) {
  const toneClass =
    tone === "gold"
      ? "bg-yellow-500/16 text-yellow-100 ring-yellow-300/35"
      : tone === "emerald"
        ? "bg-emerald-500/16 text-emerald-100 ring-emerald-300/35"
        : tone === "yellow"
          ? "bg-yellow-500/16 text-yellow-100 ring-yellow-300/35"
          : tone === "orange"
            ? "bg-orange-500/16 text-orange-100 ring-orange-300/35"
            : tone === "red"
              ? "bg-red-500/16 text-red-100 ring-red-300/35"
              : "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30";

  if (trend === "up") {
    return (
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${toneClass}`}
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
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${toneClass}`}
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
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${toneClass}`}
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
  const router = useRouter();
  const leaderboardRefreshTimerRef = useRef<number | null>(null);
  const activeMax = ranks.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  const [weeklyReward, setWeeklyReward] = useState<string>("");
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const { isMobileShell: layoutMobileShell } = useDeskLayout();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;

    const scheduleLeaderboardRefresh = () => {
      if (leaderboardRefreshTimerRef.current != null) {
        window.clearTimeout(leaderboardRefreshTimerRef.current);
      }
      leaderboardRefreshTimerRef.current = window.setTimeout(() => {
        leaderboardRefreshTimerRef.current = null;
        router.refresh();
      }, 400);
    };

    const loadWeeklyReward = async () => {
      const byKey = await (supabase as any)
        .from("crm_settings")
        .select("key, value")
        .eq("key", "weekly_reward")
        .maybeSingle();
      if (!byKey.error && byKey.data) {
        if (mounted) setWeeklyReward(String(byKey.data.value ?? ""));
        return;
      }
      const byAlt = await (supabase as any)
        .from("crm_settings")
        .select("setting_key, setting_value")
        .eq("setting_key", "weekly_reward")
        .maybeSingle();
      if (!byAlt.error && byAlt.data && mounted) {
        setWeeklyReward(String(byAlt.data.setting_value ?? ""));
      }
    };

    void loadWeeklyReward();

    const rewardChannel = supabase
      .channel("weekly-reward-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_settings" },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          const prev = payload.old as Record<string, unknown> | undefined;
          const key =
            String(next?.key ?? next?.setting_key ?? prev?.key ?? prev?.setting_key ?? "").trim();
          if (key !== "weekly_reward") return;
          const raw = next?.value ?? next?.setting_value ?? prev?.value ?? prev?.setting_value ?? "";
          setWeeklyReward(String(raw ?? ""));
        },
      )
      .subscribe();

    const dealsChannel = supabase
      .channel("leaderboard-closed-deals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "closed_deals" },
        () => scheduleLeaderboardRefresh(),
      )
      .subscribe();

    return () => {
      mounted = false;
      if (leaderboardRefreshTimerRef.current != null) {
        window.clearTimeout(leaderboardRefreshTimerRef.current);
        leaderboardRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(rewardChannel);
      void supabase.removeChannel(dealsChannel);
    };
  }, [router]);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 7;
    const rotateX = (0.5 - py) * 7;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => {
    setIsHovering(false);
    setTilt({ x: 0, y: 0 });
  };

  return (
    <aside
      className={clsx(
        "crm-leaderboard-glass relative flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-transparent bg-[radial-gradient(130%_100%_at_10%_0%,rgba(34,211,238,0.1),transparent_56%),radial-gradient(120%_95%_at_90%_8%,rgba(167,139,250,0.09),transparent_62%),linear-gradient(180deg,#090b12_0%,#080a10_100%)] shadow-[0_20px_56px_-40px_rgba(34,211,238,0.38)]",
        layoutMobileShell
          ? "@min-[560px]:min-h-[520px] @min-[560px]:rounded-[28px]"
          : "min-[560px]:min-h-[520px] min-[560px]:rounded-[28px]",
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${isHovering ? -3 : 0}px)`,
        transition: isHovering ? "transform 90ms linear, box-shadow 220ms ease" : "transform 300ms ease, box-shadow 260ms ease",
      }}
    >
      <HelpMarker
        accent="crimson"
        className="right-3 top-3 z-40"
        popupSide="right"
        text="WEEKLY RACE: Counts come from closed_deals rows that an owner has approved during the current UTC week (Monday 00:00 UTC through the following Monday, exclusive).
RANKING: Each approved close is credited to the teammate who requested it (requested_by). Pending closes do not count until approved.
REWARDS: Top performers are eligible for weekly bonuses and prizes. Keep the hustle high to stay at #1!"
      />
      <div
        className={clsx(
          "relative border-b border-cyan-300/12 bg-[linear-gradient(95deg,rgba(34,211,238,0.06)_0%,rgba(99,102,241,0.03)_45%,rgba(167,139,250,0.06)_100%)] px-4 py-4",
          layoutMobileShell ? "@md:px-6 @md:py-5" : "md:px-6 md:py-5",
        )}
      >
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-300/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.7)]">
            Leaderboard
          </p>
        </div>
        <h2
          className={clsx(
            "mt-1 text-xl font-semibold tracking-tight text-white [text-shadow:0_5px_16px_rgba(34,211,238,0.18)]",
            layoutMobileShell
              ? "@min-[400px]:text-3xl @min-[560px]:text-[2.2rem]"
              : "min-[400px]:text-3xl min-[560px]:text-[2.2rem]",
          )}
        >
          Weekly performance
        </h2>
        <div
          className={clsx(
            "mt-3 flex max-w-full flex-col gap-2 rounded-xl border border-emerald-300/35 bg-gradient-to-r from-emerald-500/20 via-emerald-400/14 to-cyan-500/12 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_-10px_rgba(16,185,129,0.7)]",
            layoutMobileShell
              ? "@min-[420px]:inline-flex @min-[420px]:flex-row @min-[420px]:items-center"
              : "min-[420px]:inline-flex min-[420px]:flex-row min-[420px]:items-center",
          )}
        >
          <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-100/90">Prize</span>
          <p
            className={clsx(
              "min-w-0 break-words text-base font-extrabold leading-snug text-emerald-200 [text-shadow:0_0_18px_rgba(16,185,129,0.5)]",
              layoutMobileShell
                ? "@min-[420px]:truncate @min-[560px]:text-[1.45rem] @min-[560px]:leading-none"
                : "min-[420px]:truncate min-[560px]:text-[1.45rem] min-[560px]:leading-none",
            )}
          >
            {weeklyReward || "Set weekly reward in Admin panel"}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-cyan-300/28 bg-cyan-500/[0.1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
            Closed deals
          </span>
          <span className="rounded-md border border-violet-300/28 bg-violet-500/[0.1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-100">
            Weekly leaderboard
          </span>
          <span className="text-sm font-medium text-zinc-300/90">Top closers shown in real time</span>
        </div>
      </div>
      <div className="relative flex flex-1 flex-col gap-2 bg-[radial-gradient(120%_90%_at_0%_100%,rgba(34,211,238,0.07),transparent_62%),radial-gradient(120%_90%_at_100%_100%,rgba(167,139,250,0.07),transparent_66%),linear-gradient(180deg,rgba(9,11,18,0.45)_0%,rgba(6,8,14,0.78)_100%)] px-4 py-4">
        {ranks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(9,14,24,0.75),rgba(8,10,18,0.85))] px-5 py-10 text-center">
            <p className="text-sm font-medium text-zinc-200">No approved closes this week yet</p>
            <p className="max-w-[280px] text-xs leading-relaxed text-zinc-500">
              When a teammate requests a close and an owner approves it, their total updates here automatically—no manual
              leaderboard setup. Weeks use Monday–Sunday in UTC (same as the dashboard query).
            </p>
          </div>
        ) : null}
        {ranks.map((row, i) => {
            const label = displayProfessionalName(row.userId, profileMap[row.userId]);
            const isYou = row.userId === currentUserId;
            const pct = Math.round((row.count / activeMax) * 100);
            const trend: "up" | "down" | "flat" =
              row.count > row.previousWeekCount ? "up" : row.count < row.previousWeekCount ? "down" : "flat";
            const tone: "gold" | "emerald" | "yellow" | "orange" | "red" | "neutral" =
              i === 0 ? "gold" : i === 1 ? "emerald" : i === 2 ? "yellow" : i === 3 ? "orange" : i >= 4 ? "red" : "neutral";
            return (
              <div
                key={row.userId}
                className={`crm-leaderboard-row relative overflow-hidden rounded-2xl border px-4 py-3 transition duration-200 ${
                  i === 0
                    ? "border-yellow-300/80 bg-[linear-gradient(110deg,rgba(120,84,12,0.7)_0%,rgba(245,186,56,0.26)_38%,rgba(130,88,12,0.62)_70%,rgba(20,16,12,0.9)_100%)] shadow-[inset_0_1px_0_rgba(255,245,200,0.45),0_0_28px_-12px_rgba(250,204,21,0.85)]"
                    : i === 1
                      ? "border-emerald-400/55 bg-[linear-gradient(135deg,rgba(8,34,24,0.75),rgba(6,14,16,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_24px_-16px_rgba(16,185,129,0.7)]"
                      : i === 2
                        ? "border-yellow-300/50 bg-[linear-gradient(135deg,rgba(48,35,8,0.72),rgba(10,12,16,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_24px_-16px_rgba(250,204,21,0.65)]"
                        : i === 3
                          ? "border-orange-400/70 bg-[linear-gradient(135deg,rgba(82,34,6,0.86),rgba(16,10,7,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_30px_-16px_rgba(251,146,60,0.85)]"
                          : i >= 4
                            ? "border-red-500/70 bg-[linear-gradient(135deg,rgba(72,10,16,0.88),rgba(16,8,10,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_30px_-16px_rgba(239,68,68,0.8)]"
                            : isYou
                              ? "border-emerald-400/30 bg-emerald-950/35"
                              : "border-cyan-400/18 bg-[linear-gradient(135deg,rgba(9,14,24,0.88),rgba(8,10,18,0.82))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_24px_-22px_rgba(34,211,238,0.45)]"
                }`}
              >
                {i === 0 ? (
                  <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-yellow-300/65 bg-yellow-300/16 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-50 shadow-[0_0_12px_-4px_rgba(250,204,21,0.9)]">
                    #1 Winner 🏆
                  </div>
                ) : null}
                {i === 0 ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-yellow-100/24 to-transparent [animation:leaderShine_2.8s_ease-in-out_infinite]"
                  />
                ) : null}
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r opacity-90 ${
                    i === 0
                      ? "from-yellow-300/40 via-amber-200/22 to-transparent"
                      : i === 1
                        ? "from-emerald-300/24 via-emerald-300/12 to-transparent"
                        : i === 2
                          ? "from-yellow-300/22 via-yellow-300/10 to-transparent"
                          : i === 3
                            ? "from-orange-300/38 via-orange-300/18 to-transparent"
                            : i >= 4
                              ? "from-red-400/36 via-red-400/18 to-transparent"
                              : "from-cyan-400/24 via-emerald-400/14 to-transparent"
                  }`}
                  style={{ width: `${Math.max(pct, row.count > 0 ? 8 : 0)}%` }}
                />
                <div className="relative flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      i === 0
                        ? "bg-yellow-400/28 text-yellow-50 ring-1 ring-yellow-200/45"
                        : i === 1
                          ? "bg-emerald-500/28 text-emerald-100 ring-1 ring-emerald-300/45"
                          : i === 2
                            ? "bg-yellow-500/28 text-yellow-100 ring-1 ring-yellow-300/45"
                            : i === 3
                              ? "bg-orange-500/28 text-orange-100 ring-1 ring-orange-300/45"
                              : "bg-red-500/28 text-red-100 ring-1 ring-red-300/45"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <TrendGlyph trend={trend} tone={tone} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-base font-semibold text-zinc-50">
                      <span className="truncate">{label}</span>
                      {isYou ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                      i === 0
                        ? "text-yellow-100/90"
                          : i === 1
                            ? "text-emerald-100/75"
                            : i === 2
                              ? "text-yellow-100/75"
                              : i === 3
                                ? "text-orange-100/90"
                                : "text-red-100/85"
                      }`}
                    >
                      Closed deals
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-2xl font-bold tabular-nums ${
                      i === 0
                        ? "text-yellow-100"
                        : i === 1
                          ? "text-emerald-200"
                          : i === 2
                            ? "text-yellow-200"
                            : i === 3
                              ? "text-orange-200"
                              : i >= 4
                                ? "text-red-200"
                                : "text-emerald-200"
                    }`}
                  >
                    {row.count}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </aside>
  );
}

