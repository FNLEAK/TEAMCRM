"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import {
  DAILY_BRIEFING_REFRESH_EVENT,
  formatLocalCalendarDay,
  getTeamDayNotesDateColumn,
  getTeamDayNotesTable,
  TEAM_CALENDAR_DAY_NOTE_BODY,
  teamCalendarDayNotesSelectList,
} from "@/lib/teamDayNotes";

/**
 * Full-width strip: today’s team day note (same table/columns as Team calendar).
 */
export function DailyBriefingBanner() {
  const { isMobileShell: layoutMobileShell } = useDeskLayout();
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
    <>
      <div
        className={clsx(
          "mb-5 w-full min-w-0 rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-[#121214] px-4 py-3 ring-1 ring-emerald-500/10",
          layoutMobileShell && "@container",
          layoutMobileShell
            ? "@md:mb-6 @md:bg-gradient-to-r @md:from-emerald-950/50 @md:via-[#141414] @md:to-[#141414] @md:px-5 @md:py-4 @md:shadow-[0_0_28px_-14px_rgba(16,185,129,0.25)] @lg:px-6 @lg:py-5"
            : "md:mb-6 md:bg-gradient-to-r md:from-emerald-950/50 md:via-[#141414] md:to-[#141414] md:px-5 md:py-4 md:shadow-[0_0_28px_-14px_rgba(16,185,129,0.25)] lg:px-6 lg:py-5",
        )}
      >
        <div
          className={clsx(
            "flex flex-col gap-3",
            layoutMobileShell
              ? "@md:flex-row @md:items-stretch @md:gap-0"
              : "md:flex-row md:items-stretch md:gap-0",
          )}
        >
          <div
            className={clsx(
              "flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5",
              layoutMobileShell
                ? "@md:flex-col @md:justify-center @md:border-r @md:border-emerald-500/25 @md:pr-4"
                : "md:flex-col md:justify-center md:border-r md:border-emerald-500/25 md:pr-4",
            )}
          >
            <span
              className={clsx(
                "text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500",
                layoutMobileShell ? "@md:text-[11px] @md:tracking-[0.2em]" : "md:text-[11px] md:tracking-[0.2em]",
              )}
            >
              Daily briefing
            </span>
            <span
              className={clsx(
                "font-mono text-[11px] text-zinc-500",
                layoutMobileShell ? "@md:text-xs" : "md:text-xs",
              )}
            >
              {todayLabel}
            </span>
          </div>
          <div className={clsx("min-w-0 flex-1", layoutMobileShell ? "@md:pl-4" : "md:pl-4")}>
            {loading ? (
              <span className="text-sm text-zinc-500" aria-live="polite">
                …
              </span>
            ) : body ? (
              <p
                className={clsx(
                  "break-words text-sm font-medium leading-relaxed text-emerald-300 [overflow-wrap:anywhere]",
                  layoutMobileShell
                    ? "@md:text-[15px] @md:leading-snug @lg:text-base"
                    : "md:text-[15px] md:leading-snug lg:text-base",
                )}
              >
                {body}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-zinc-500">
                No note for today — add one in <span className="text-zinc-400">Team calendar</span>.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
