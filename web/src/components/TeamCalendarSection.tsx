"use client";

import dynamic from "next/dynamic";
import type { TeamProfile } from "@/lib/leadTypes";

const TeamCalendarInner = dynamic(() => import("./TeamCalendarInner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-emerald-950/20 bg-zinc-950/70 px-5 py-16 text-center text-sm text-zinc-500">
      Loading calendar…
    </div>
  ),
});

type TeamCalendarSectionProps = {
  userId: string;
  onOpenLeadById: (leadId: string) => void;
  /** First five user ids = fixed heatmap colors in Team schedule (see `NEXT_PUBLIC_CALENDAR_TEAM_USER_IDS`). */
  teamMemberColorOrder: string[];
  profileMap: Record<string, TeamProfile>;
  /** Increment (e.g. after saving an appointment) to refetch events for the visible range. */
  calendarRefreshKey: number;
};

export function TeamCalendarSection({
  userId,
  onOpenLeadById,
  teamMemberColorOrder,
  profileMap,
  calendarRefreshKey,
}: TeamCalendarSectionProps) {
  return (
    <section className="overflow-visible rounded-xl border border-cyan-300/15 bg-[radial-gradient(120%_80%_at_10%_0%,rgba(34,211,238,0.1),transparent_55%),radial-gradient(100%_65%_at_90%_10%,rgba(167,139,250,0.1),transparent_62%),linear-gradient(180deg,#090b11_0%,#080a10_100%)] ring-1 ring-white/10 shadow-[0_20px_60px_-36px_rgba(34,211,238,0.55)]">
      <TeamCalendarInner
        userId={userId}
        onOpenLeadById={onOpenLeadById}
        teamMemberColorOrder={teamMemberColorOrder}
        profileMap={profileMap}
        calendarRefreshKey={calendarRefreshKey}
      />
    </section>
  );
}
