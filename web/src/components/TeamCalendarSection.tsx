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
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] ring-1 ring-white/10">
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
