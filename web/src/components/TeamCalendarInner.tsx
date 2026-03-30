"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { DatesSetArg, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { TeamMemberAvatar } from "@/components/TeamMemberAvatar";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { schedulerColorClass } from "@/lib/calendarSchedulerColors";
import { getLeadSelectColumns } from "@/lib/leadSelectColumns";
import {
  DAILY_BRIEFING_REFRESH_EVENT,
  formatLocalCalendarDay,
  getTeamDayNotesDateColumn,
  getTeamDayNotesTable,
  TEAM_CALENDAR_DAY_NOTE_BODY,
  teamCalendarDayNotesSelectList,
} from "@/lib/teamDayNotes";
import { calendarEventTitle } from "@/lib/profileDisplay";
import {
  teamProfileFromDb,
  teamProfileFromSchedulerEmbed,
  type LeadRow,
  type TeamProfile,
} from "@/lib/leadTypes";
import { fetchProfilesByIds } from "@/lib/profileSelect";

type ScheduleScope = "my" | "team";

/** Compare UUIDs regardless of hyphen casing (PostgREST / JS can differ slightly in shape). */
function uuidKey(s: string): string {
  return s.replace(/-/g, "").toLowerCase();
}

function formatBriefingHeading(dayStr: string): string {
  const [y, mo, d] = dayStr.split("-").map(Number);
  if (!y || !mo || !d) return dayStr;
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Full PostgREST / Postgres error text for debugging Policy vs FK vs other issues. */
function formatPostgrestError(err: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  const parts = [err.message];
  if (err.code) parts.push(`code ${err.code}`);
  if (err.details) parts.push(`details: ${err.details}`);
  if (err.hint) parts.push(`hint: ${err.hint}`);
  return parts.join(" · ");
}

type TeamCalendarInnerProps = {
  userId: string;
  onOpenLeadById: (leadId: string) => void;
  teamMemberColorOrder: string[];
  profileMap: Record<string, TeamProfile>;
  calendarRefreshKey: number;
};

function makeCalendarEventContent(
  profileMap: Record<string, TeamProfile>,
  authUserId: string,
  teamMemberColorOrder: readonly string[],
) {
  return function CalendarEventPillInner(arg: EventContentArg) {
    const schedulerId = (arg.event.extendedProps.schedulerId as string | null | undefined) ?? null;
    const isMyScope = Boolean(arg.event.extendedProps.isMyScope);
    const avatarUserId = schedulerId || authUserId;
    const fromLead = arg.event.extendedProps.schedulerProfile as TeamProfile | undefined;
    const profile =
      fromLead ??
      (schedulerId ? profileMap[schedulerId] : profileMap[authUserId]);
    return (
      <div className="crm-cal-pill-inner flex min-w-0 items-center gap-1.5">
        <TeamMemberAvatar
          userId={avatarUserId}
          profile={profile}
          teamMemberColorOrder={teamMemberColorOrder}
          variant={isMyScope ? "my" : "team"}
          className="!h-5 !w-5 !text-[8px]"
        />
        <span className="truncate font-medium">{arg.event.title}</span>
      </div>
    );
  };
}

export default function TeamCalendarInner({
  userId,
  onOpenLeadById,
  teamMemberColorOrder,
  profileMap,
  calendarRefreshKey,
}: TeamCalendarInnerProps) {
  const notesTable = useMemo(() => getTeamDayNotesTable(), []);
  const colorOrder = useMemo(() => teamMemberColorOrder ?? [], [teamMemberColorOrder]);

  const profileMapRef = useRef(profileMap);
  profileMapRef.current = profileMap;
  const [calendarProfileExtras, setCalendarProfileExtras] = useState<Record<string, TeamProfile>>({});
  const calendarProfileExtrasRef = useRef(calendarProfileExtras);
  calendarProfileExtrasRef.current = calendarProfileExtras;

  const mergedProfileMap = useMemo(
    () => ({ ...calendarProfileExtras, ...profileMap }),
    [calendarProfileExtras, profileMap],
  );
  const mergedProfileMapRef = useRef(mergedProfileMap);
  mergedProfileMapRef.current = mergedProfileMap;

  const calendarEventContent = useMemo(
    () => makeCalendarEventContent(mergedProfileMap, userId, colorOrder),
    [mergedProfileMap, userId, colorOrder],
  );
  const visibleRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const [scope, setScope] = useState<ScheduleScope>("my");
  const [events, setEvents] = useState<EventInput[]>([]);
  const [teamDayDensity, setTeamDayDensity] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [noteDay, setNoteDay] = useState(() => formatLocalCalendarDay(new Date()));
  const [noteBody, setNoteBody] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [noteSaveOk, setNoteSaveOk] = useState(false);
  const [noteToast, setNoteToast] = useState<string | null>(null);
  const noteToastTimerRef = useRef<number | null>(null);

  const showNoteErrorToast = useCallback((message: string) => {
    if (noteToastTimerRef.current != null) window.clearTimeout(noteToastTimerRef.current);
    setNoteToast(message);
    noteToastTimerRef.current = window.setTimeout(() => {
      setNoteToast(null);
      noteToastTimerRef.current = null;
    }, 10000);
  }, []);

  const loadNotesForDay = useCallback(
    async (day: string, options?: { mustFindRow?: boolean }): Promise<boolean> => {
      setNoteLoading(true);
      setNoteErr(null);
      const dateCol = getTeamDayNotesDateColumn();
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from(notesTable as "team_calendar_day_notes")
          .select(teamCalendarDayNotesSelectList())
          .eq(dateCol, day)
          .maybeSingle();
        if (error) {
          setNoteErr(
            `${error.message} — table "${notesTable}": use column "${TEAM_CALENDAR_DAY_NOTE_BODY}" for text and "${dateCol}" for the day key (or set NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN).`,
          );
          if (!options?.mustFindRow) setNoteBody("");
          return false;
        }
        const row = data as Record<string, unknown> | null;
        if (options?.mustFindRow && row == null) {
          const msg = `Saved but no row is visible for ${day} — write may have succeeded but SELECT returned nothing (check RLS read policy on "${notesTable}" for column "${dateCol}").`;
          setNoteErr(msg);
          showNoteErrorToast(msg);
          return false;
        }
        const text = row?.[TEAM_CALENDAR_DAY_NOTE_BODY];
        setNoteBody(typeof text === "string" ? text : "");
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setNoteErr(`Daily briefing load failed: ${msg}`);
        if (!options?.mustFindRow) setNoteBody("");
        return false;
      } finally {
        setNoteLoading(false);
      }
    },
    [notesTable, showNoteErrorToast],
  );

  useEffect(() => {
    setNoteSaveOk(false);
    void loadNotesForDay(noteDay);
  }, [noteDay, loadNotesForDay]);

  useEffect(() => {
    if (!noteSaveOk) return;
    const t = window.setTimeout(() => setNoteSaveOk(false), 2800);
    return () => window.clearTimeout(t);
  }, [noteSaveOk]);

  const fetchAppointments = useCallback(
    async (start: Date, end: Date) => {
      setLoading(true);
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: userData } = await supabase.auth.getUser();
      const authUid = (
        sessionData.session?.user?.id ??
        userData.user?.id ??
        userId
      ).trim();
      const meKey = uuidKey(authUid);
      const hasClaimedCol = process.env.NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY === "true";

      const { data, error } = await supabase
        .from("leads")
        .select(getLeadSelectColumns())
        .not("appt_date", "is", null)
        .gte("appt_date", start.toISOString())
        .lt("appt_date", end.toISOString());

      setLoading(false);
      if (error) {
        console.error("[CRM] calendar fetch:", error);
        setEvents([]);
        return;
      }

      let rows: LeadRow[] = Array.isArray(data) ? (data as unknown as LeadRow[]) : [];
      if (scope === "my") {
        rows = rows.filter((r) => {
          const sid = r.appt_scheduled_by;
          if (sid != null && String(sid).trim() !== "") {
            if (uuidKey(String(sid)) === meKey) return true;
          }
          // Legacy rows: no scheduler recorded; still show on My schedule if this user claimed the lead.
          if (hasClaimedCol && r.claimed_by != null && String(r.claimed_by).trim() !== "") {
            const noSched = sid == null || String(sid).trim() === "";
            if (noSched && uuidKey(String(r.claimed_by)) === meKey) return true;
          }
          return false;
        });
        setTeamDayDensity({});
      } else {
        const density: Record<string, number> = {};
        for (const r of rows) {
          if (!r.appt_date) continue;
          const key = formatLocalCalendarDay(new Date(r.appt_date as string));
          density[key] = (density[key] ?? 0) + 1;
        }
        setTeamDayDensity(density);
      }

      setEvents(
        rows.map((r) => {
          const isMyScope = scope === "my";
          const sch = r.appt_scheduled_by ?? null;
          const schedProf =
            teamProfileFromSchedulerEmbed(sch, r.scheduler_profile ?? null) ??
            (sch ? mergedProfileMapRef.current[sch] : undefined);
          const teamClass = isMyScope
            ? "crm-cal-event-my"
            : `crm-cal-event-team ${schedulerColorClass(sch, colorOrder)}`;
          const company = r.company_name?.trim() || "Lead";
          return {
            id: r.id,
            title: calendarEventTitle(schedProf, company),
            start: r.appt_date as string,
            extendedProps: {
              leadId: r.id,
              schedulerId: sch,
              isMyScope,
              schedulerProfile: teamProfileFromSchedulerEmbed(sch, r.scheduler_profile ?? null),
            },
            classNames: ["crm-cal-pill-event", teamClass],
          };
        }),
      );

      const schedulerIds = [
        ...new Set(
          rows.map((r) => r.appt_scheduled_by).filter((id): id is string => Boolean(id)),
        ),
      ];
      const missing = schedulerIds.filter(
        (id) => !profileMapRef.current[id] && !calendarProfileExtrasRef.current[id],
      );
      if (missing.length > 0) {
        const { data, error } = await fetchProfilesByIds(supabase, missing);
        if (!error && data?.length) {
          setCalendarProfileExtras((prev) => {
            const next = { ...prev };
            for (const row of data) {
              const id = row.id as string;
              next[id] = teamProfileFromDb({
                id,
                first_name: row.first_name ?? null,
                full_name: row.full_name ?? null,
                avatar_initials: row.avatar_initials ?? null,
              });
            }
            return next;
          });
        }
      }
    },
    [colorOrder, scope, userId],
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      visibleRangeRef.current = { start: arg.start, end: arg.end };
      void fetchAppointments(arg.start, arg.end);
    },
    [fetchAppointments],
  );

  useEffect(() => {
    const r = visibleRangeRef.current;
    if (!r) return;
    void fetchAppointments(r.start, r.end);
  }, [calendarRefreshKey, scope, fetchAppointments]);

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const leadId = info.event.extendedProps.leadId as string | undefined;
      if (leadId) onOpenLeadById(leadId);
    },
    [onOpenLeadById],
  );

  const handleDateClick = useCallback((arg: { date: Date }) => {
    setNoteDay(formatLocalCalendarDay(arg.date));
  }, []);

  /**
   * Team day notes: no `.upsert()`.
   * 1) UPDATE where the date column (NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN, default `day`) = selected `noteDay`.
   * 2) If 0 rows updated, INSERT a row for that day.
   * 3) On success, `loadNotesForDay(noteDay)` reloads `body` from the DB into the textarea.
   */
  const saveDayNote = useCallback(async () => {
    setNoteSaving(true);
    setNoteErr(null);
    setNoteSaveOk(false);

    const dateCol = getTeamDayNotesDateColumn();
    const table = notesTable as "team_calendar_day_notes";
    const now = new Date().toISOString();

    /** Only show "Saved" after reload confirms the row exists (avoids false success when RLS blocks SELECT). */
    const finishSuccess = async () => {
      const ok = await loadNotesForDay(noteDay, { mustFindRow: true });
      if (ok) {
        setNoteSaveOk(true);
        window.dispatchEvent(new CustomEvent(DAILY_BRIEFING_REFRESH_EVENT));
      }
    };

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const authUid = authData.user?.id?.trim() ?? null;
      if (!authUid) {
        const msg = formatPostgrestError({
          message: authErr?.message ?? "No authenticated user — cannot set updated_by (FK to auth.users).",
        });
        setNoteErr(msg);
        showNoteErrorToast(msg);
        return;
      }

      const payload = {
        [TEAM_CALENDAR_DAY_NOTE_BODY]: noteBody,
        updated_at: now,
        updated_by: authUid,
      };

      const { data: updatedRows, error: updateErr } = await supabase
        .from(table)
        .update(payload)
        .eq(dateCol, noteDay)
        .select(teamCalendarDayNotesSelectList());

      if (updateErr) {
        const full = formatPostgrestError(updateErr);
        setNoteErr(full);
        showNoteErrorToast(full);
        return;
      }

      if (updatedRows && updatedRows.length > 0) {
        await finishSuccess();
        return;
      }

      const insertRow: Record<string, string | null> = {
        [dateCol]: noteDay,
        [TEAM_CALENDAR_DAY_NOTE_BODY]: noteBody,
        updated_at: now,
        updated_by: authUid,
      };

      const { data: insertedRows, error: insertErr } = await supabase
        .from(table)
        .insert(insertRow)
        .select(teamCalendarDayNotesSelectList());

      if (insertErr) {
        const code = (insertErr as { code?: string }).code;
        const dup = code === "23505" || /duplicate|unique/i.test(insertErr.message);
        if (dup) {
          const { data: retryRows, error: retryErr } = await supabase
            .from(table)
            .update(payload)
            .eq(dateCol, noteDay)
            .select(teamCalendarDayNotesSelectList());
          if (retryErr) {
            const full = formatPostgrestError(retryErr);
            setNoteErr(full);
            showNoteErrorToast(full);
            return;
          }
          if (!retryRows?.length) {
            const full =
              "UPDATE after duplicate key returned 0 rows — check date column / RLS UPDATE policy (lookup uses NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN).";
            setNoteErr(full);
            showNoteErrorToast(full);
            return;
          }
          await finishSuccess();
          return;
        }
        const full = formatPostgrestError(insertErr);
        setNoteErr(full);
        showNoteErrorToast(full);
        return;
      }

      if (!insertedRows?.length) {
        const full =
          "INSERT returned no rows — check INSERT policy and that RETURNING is allowed (RLS WITH CHECK).";
        setNoteErr(full);
        showNoteErrorToast(full);
        return;
      }

      await finishSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const full = `Save failed: ${msg}`;
      setNoteErr(full);
      showNoteErrorToast(full);
    } finally {
      setNoteSaving(false);
    }
  }, [loadNotesForDay, noteBody, noteDay, notesTable, showNoteErrorToast]);

  const dayCellClassNames = useCallback(
    (arg: { date: Date }) => {
      if (scope !== "team") return [];
      const ymd = formatLocalCalendarDay(arg.date);
      const n = teamDayDensity[ymd] ?? 0;
      if (n >= 6) return ["crm-cal-day-density-high"];
      if (n >= 3) return ["crm-cal-day-density-mid"];
      if (n >= 1) return ["crm-cal-day-density-low"];
      return [];
    },
    [scope, teamDayDensity],
  );

  return (
    <div className={`crm-calendar-shell text-zinc-100 ${scope === "team" ? "crm-cal-team-heat" : ""}`}>
      <div className="crm-cal-glass-header flex flex-col items-stretch gap-3 border-b border-white/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-200">Team calendar</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Appointments by date · select an event to open the lead · select a day to edit the shared note below
          </p>
        </div>
        <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-end">
          <div className="inline-flex items-center rounded-md border border-white/10 bg-[#0a0a0a] p-0.5">
            <button
              type="button"
              onClick={() => setScope("my")}
              className={`rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                scope === "my"
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              My schedule
            </button>
            <button
              type="button"
              onClick={() => setScope("team")}
              className={`rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                scope === "team"
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Team schedule
            </button>
          </div>
        </div>
      </div>

      <div className="px-2 py-4 sm:px-4">
        {loading ? (
          <p className="mb-2 text-center text-xs text-zinc-500" aria-live="polite">
            Loading appointments…
          </p>
        ) : null}
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          height="auto"
          editable={false}
          dayMaxEvents={3}
          moreLinkClick="popover"
          moreLinkContent={(arg) => `+${arg.num} more`}
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          eventContent={calendarEventContent}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          dayCellClassNames={dayCellClassNames}
        />
      </div>

      <div className="crm-daily-briefing border-t border-white/[0.08] px-5 py-6">
        <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/40 via-[#0c0c0e] to-[#09090b] p-5 shadow-[0_20px_60px_-24px_rgba(16,185,129,0.2)] ring-1 ring-white/[0.06] backdrop-blur-md">
          <div className="flex flex-col gap-1 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-400/90">
                Team day note
              </p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">
                {formatBriefingHeading(noteDay)}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                One shared note per date for the whole team. The text you edit here is saved to the database for this day
                only—select another date on the calendar to view or change that day’s note.
              </p>
            </div>
            <span className="rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1 font-mono text-[11px] text-zinc-400">
              {noteDay}
            </span>
          </div>
          {noteErr ? (
            <p className="mt-4 rounded-lg border border-rose-500/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {noteErr}
            </p>
          ) : null}
          <textarea
            value={noteBody}
            disabled={noteLoading}
            onChange={(e) => setNoteBody(e.target.value.slice(0, 2000))}
            rows={5}
            maxLength={2000}
            placeholder="Enter the team note for this date…"
            className="mt-4 w-full resize-none rounded-xl border border-white/[0.08] bg-black/35 px-4 py-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 shadow-inner shadow-black/40 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] text-zinc-600">{noteBody.length}/2000</span>
            <div className="flex items-center gap-3">
              {noteSaveOk ? (
                <span className="text-xs font-medium text-emerald-400" role="status" aria-live="polite">
                  Saved
                </span>
              ) : null}
              <button
                type="button"
                disabled={noteSaving || noteLoading}
                onClick={() => void saveDayNote()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-emerald-950 shadow-[0_0_24px_-8px_rgba(52,211,153,0.6)] transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {noteSaving ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>
          {noteLoading ? <p className="mt-3 text-xs text-zinc-500">Loading note…</p> : null}
        </div>
      </div>

      {noteToast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[70] max-w-lg -translate-x-1/2 whitespace-pre-wrap break-words rounded-xl border border-rose-500/40 bg-rose-950/95 px-4 py-3 text-left text-sm font-medium text-rose-100 shadow-lg"
          role="alert"
        >
          {noteToast}
        </div>
      ) : null}
    </div>
  );
}
