"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  DAILY_BRIEFING_REFRESH_EVENT,
  formatLocalCalendarDay,
  getTeamDayNotesDateColumn,
  getTeamDayNotesTable,
  TEAM_CALENDAR_DAY_NOTE_BODY,
  teamCalendarDayNotesSelectList,
} from "@/lib/teamDayNotes";

/**
 * Slim full-width strip: today’s team day note (same table/columns as Team calendar).
 */
export function DailyBriefingBanner() {
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    const day = formatLocalCalendarDay(new Date());
    const dateCol = getTeamDayNotesDateColumn();
    const notesTable = getTeamDayNotesTable();
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from(notesTable as "team_calendar_day_notes")
        .select(teamCalendarDayNotesSelectList())
        .eq(dateCol, day)
        .maybeSingle();

      if (error) {
        setBody(null);
        return;
      }
      const row = data as Record<string, unknown> | null;
      const text = row?.[TEAM_CALENDAR_DAY_NOTE_BODY];
      setBody(typeof text === "string" && text.trim().length > 0 ? text.trim() : null);
    } catch {
      setBody(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchToday();
  }, [fetchToday]);

  useEffect(() => {
    const onRefresh = () => void fetchToday();
    window.addEventListener(DAILY_BRIEFING_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DAILY_BRIEFING_REFRESH_EVENT, onRefresh);
  }, [fetchToday]);

  const todayLabel = formatLocalCalendarDay(new Date());

  return (
    <div className="mb-6 w-full border border-emerald-900/40 bg-[#141414] px-4 py-2 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-500">Daily briefing</span>
          <span className="font-mono text-[10px] text-zinc-600">{todayLabel}</span>
        </div>
        {loading ? (
          <span className="text-[11px] text-zinc-600" aria-live="polite">
            …
          </span>
        ) : body ? (
          <>
            <span className="hidden text-zinc-700 sm:inline" aria-hidden>
              |
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-emerald-500">{body}</p>
          </>
        ) : (
          <p className="text-xs text-zinc-600">
            No note for today — add one in <span className="text-zinc-500">Team calendar</span>.
          </p>
        )}
      </div>
    </div>
  );
}
