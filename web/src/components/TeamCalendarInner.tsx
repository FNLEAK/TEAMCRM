"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfMonth, startOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { FullScreenCalendar, type CalendarData, type Event as CalendarEvent } from "@/components/ui/fullscreen-calendar";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
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
import { HelpMarker } from "@/components/HelpMarker";
import { upsertTeamProfileFromSession } from "@/lib/syncTeamProfile";
import { canManageRoles } from "@/lib/roleAccess";

type ScheduleScope = "my" | "team";

/** Compare UUIDs regardless of hyphen casing (PostgREST / JS can differ slightly in shape). */
function uuidKey(s: string): string {
  return s.replace(/-/g, "").toLowerCase();
}

/**
 * “My schedule” = you scheduled it, claimed it (no scheduler on file), or you last touched the lead
 * (covers FK-stripped `appt_scheduled_by` + activity trigger).
 */
function leadMatchesMySchedule(r: LeadRow, identityKeys: Set<string>): boolean {
  const sid = r.appt_scheduled_by;
  if (sid != null && String(sid).trim() !== "") {
    if (identityKeys.has(uuidKey(String(sid)))) return true;
  }
  const noSched = sid == null || String(sid).trim() === "";
  if (!noSched) return false;
  const claimed = r.claimed_by;
  if (claimed != null && String(claimed).trim() !== "" && identityKeys.has(uuidKey(String(claimed)))) {
    return true;
  }
  const lastAct = r.last_activity_by;
  if (lastAct != null && String(lastAct).trim() !== "" && identityKeys.has(uuidKey(String(lastAct)))) {
    return true;
  }
  return false;
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

type CalendarAppointment = {
  eventId: number;
  leadId: string;
  day: Date;
  name: string;
  time: string;
  datetime: string;
};

export default function TeamCalendarInner({
  userId,
  onOpenLeadById,
  teamMemberColorOrder: _teamMemberColorOrder,
  profileMap,
  calendarRefreshKey,
}: TeamCalendarInnerProps) {
  const notesTable = useMemo(() => getTeamDayNotesTable(), []);

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

  const currentMonthRef = useRef<Date>(startOfMonth(new Date()));
  const [scope, setScope] = useState<ScheduleScope>("my");
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteDay, setNoteDay] = useState(() => formatLocalCalendarDay(new Date()));
  const [noteBody, setNoteBody] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [noteSaveOk, setNoteSaveOk] = useState(false);
  const [noteToast, setNoteToast] = useState<string | null>(null);
  const noteToastTimerRef = useRef<number | null>(null);
  /** `null` = still resolving; only owners see/edit the shared team day note UI. */
  const [canEditTeamDayNote, setCanEditTeamDayNote] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ok = await canManageRoles(supabase, userId, user?.email ?? null);
      if (!cancelled) setCanEditTeamDayNote(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    if (canEditTeamDayNote !== true) return;
    setNoteSaveOk(false);
    void loadNotesForDay(noteDay);
  }, [noteDay, loadNotesForDay, canEditTeamDayNote]);

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
      const authUid = (sessionData.session?.user?.id ?? userData.user?.id ?? "").trim();
      const identityKeys = new Set(
        [authUid, userId]
          .map((v) => String(v ?? "").trim())
          .filter(Boolean)
          .map((v) => uuidKey(v)),
      );
      const { data, error } = await supabase
        .from("leads")
        .select(getLeadSelectColumns())
        .not("appt_date", "is", null)
        .gte("appt_date", start.toISOString())
        .lt("appt_date", end.toISOString());

      setLoading(false);
      if (error) {
        console.error("[CRM] calendar fetch:", error);
        setAppointments([]);
        return;
      }

      let rows: LeadRow[] = Array.isArray(data) ? (data as unknown as LeadRow[]) : [];
      if (scope === "my") {
        rows = rows.filter((r) => leadMatchesMySchedule(r, identityKeys));
      }

      setAppointments(
        rows
          .filter((r) => Boolean(r.appt_date))
          .map((r, idx) => {
            const sch = r.appt_scheduled_by ?? null;
            const schedProf =
              teamProfileFromSchedulerEmbed(sch, r.scheduler_profile ?? null) ??
              (sch ? mergedProfileMapRef.current[sch] : undefined);
            const company = r.company_name?.trim() || "Lead";
            const dt = new Date(r.appt_date as string);
            return {
              eventId: idx + 1,
              leadId: r.id,
              day: dt,
              name: calendarEventTitle(schedProf, company),
              time: dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
              datetime: dt.toISOString(),
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
    [scope, userId],
  );

  useEffect(() => {
    const month = currentMonthRef.current;
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    // Pad range so UTC-stored `appt_date` values still match the visible local month (KPI vs calendar skew).
    const MS_DAY = 86400000;
    const startPad = new Date(start.getTime() - MS_DAY * 2);
    const endPad = new Date(end.getTime() + MS_DAY * 2);
    void fetchAppointments(startPad, endPad);
  }, [calendarRefreshKey, scope, fetchAppointments]);

  /**
   * Team day notes: no `.upsert()`.
   * 1) UPDATE where the date column (NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN, default `day`) = selected `noteDay`.
   * 2) If 0 rows updated, INSERT a row for that day.
   * 3) On success, `loadNotesForDay(noteDay)` reloads `body` from the DB into the textarea.
   */
  const saveDayNote = useCallback(async () => {
    if (canEditTeamDayNote !== true) return;
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

      await upsertTeamProfileFromSession(supabase);

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
  }, [canEditTeamDayNote, loadNotesForDay, noteBody, noteDay, notesTable, showNoteErrorToast]);

  const calendarData = useMemo<CalendarData[]>(() => {
    const grouped = new Map<string, CalendarData>();
    for (const appt of appointments) {
      const key = formatLocalCalendarDay(appt.day);
      if (!grouped.has(key)) {
        grouped.set(key, {
          day: new Date(appt.day.getFullYear(), appt.day.getMonth(), appt.day.getDate()),
          events: [],
        });
      }
      grouped.get(key)!.events.push({
        id: appt.eventId,
        name: appt.name,
        time: appt.time,
        datetime: appt.datetime,
        leadId: appt.leadId,
      });
    }
    return Array.from(grouped.values());
  }, [appointments]);

  const handleCalendarDaySelect = useCallback((day: Date) => {
    setNoteDay(formatLocalCalendarDay(day));
  }, []);

  const handleCalendarEventSelect = useCallback(
    (event: CalendarEvent) => {
      if (event.leadId) onOpenLeadById(event.leadId);
    },
    [onOpenLeadById],
  );

  const handleCalendarMonthChange = useCallback(
    (monthStart: Date) => {
      currentMonthRef.current = startOfMonth(monthStart);
      const start = startOfWeek(startOfMonth(monthStart));
      const end = endOfWeek(endOfMonth(monthStart));
      void fetchAppointments(start, end);
    },
    [fetchAppointments],
  );

  return (
    <div
      className={`relative @container min-w-0 crm-calendar-shell text-zinc-100 ${scope === "team" ? "crm-cal-team-heat" : ""}`}
    >
      <HelpMarker
        accent="crimson"
        className="right-3 top-3 z-40"
        text="SHARED SCHEDULE: This calendar displays all booked appointments.
TOGGLE: Use 'MY SCHEDULE' to see only the appointments you set, or 'TEAM SCHEDULE' to see the full company workload.
ACTION: Click any event on the calendar to instantly open that lead's details."
      />
      <div className="crm-cal-glass-header relative z-0 flex flex-col items-stretch gap-3 border-b border-cyan-300/12 bg-[linear-gradient(90deg,rgba(34,211,238,0.07)_0%,rgba(99,102,241,0.04)_48%,rgba(167,139,250,0.07)_100%)] px-4 py-3 @md:flex-row @md:items-center @md:justify-between @md:px-5">
        <div className="min-w-0 flex-1">
          <div className="inline-flex w-full max-w-none flex-col gap-1 rounded-lg border border-transparent bg-[linear-gradient(145deg,rgba(15,23,42,0.78),rgba(3,7,18,0.7))] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18),0_12px_30px_-24px_rgba(34,211,238,0.5)] backdrop-blur-sm @md:max-w-[58rem] @md:inline-flex @md:w-auto">
            <h2 className="text-base font-semibold tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.75)]">
              Team calendar
            </h2>
            <p className="text-sm text-zinc-200/90 [text-shadow:0_2px_18px_rgba(0,0,0,0.75)]">
              Appointments by date · select an event to open the lead · select a day to edit the shared note below
            </p>
          </div>
        </div>
        <div className="relative z-10 flex w-full shrink-0 @md:w-auto">
          <div className="flex w-full rounded-md border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,12,22,0.95),rgba(10,10,18,0.92))] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_-20px_rgba(34,211,238,0.45)] @md:inline-flex @md:w-auto">
            <button
              type="button"
              onClick={() => setScope("my")}
              className={`flex-1 rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition @md:flex-none ${
                scope === "my"
                  ? "bg-gradient-to-r from-cyan-200 to-emerald-200 text-zinc-900 shadow-[0_0_18px_-8px_rgba(34,211,238,0.8)]"
                  : "text-zinc-300/85 hover:bg-cyan-500/[0.08] hover:text-white"
              }`}
            >
              My schedule
            </button>
            <button
              type="button"
              onClick={() => setScope("team")}
              className={`flex-1 rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition @md:flex-none ${
                scope === "team"
                  ? "bg-gradient-to-r from-cyan-200 to-emerald-200 text-zinc-900 shadow-[0_0_18px_-8px_rgba(34,211,238,0.8)]"
                  : "text-zinc-300/85 hover:bg-cyan-500/[0.08] hover:text-white"
              }`}
            >
              Team schedule
            </button>
          </div>
        </div>
      </div>

      <div className="px-2 py-3 @md:px-4 @md:py-4">
        {loading ? (
          <p className="mb-2 text-center text-xs text-zinc-500" aria-live="polite">
            Loading appointments…
          </p>
        ) : null}
        <FullScreenCalendar
          data={calendarData}
          onSelectDay={handleCalendarDaySelect}
          onSelectEvent={handleCalendarEventSelect}
          onMonthChange={handleCalendarMonthChange}
        />
      </div>

      {canEditTeamDayNote === true ? (
        <div className="crm-daily-briefing border-t border-white/[0.08] px-5 py-6">
          <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/40 via-[#0c0c0e] to-[#09090b] p-5 shadow-[0_20px_60px_-24px_rgba(16,185,129,0.2)] ring-1 ring-white/[0.06] backdrop-blur-md">
            <div className="flex flex-col gap-1 border-b border-white/[0.06] pb-4 @md:flex-row @md:items-end @md:justify-between">
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
      ) : null}

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
