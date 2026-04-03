/** Local calendar day as `YYYY-MM-DD` (matches team day note keys and calendar cells). */
export function formatLocalCalendarDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Dispatched on window after a successful Team day note save so the dashboard banner can refetch. */
export const DAILY_BRIEFING_REFRESH_EVENT = "crm-daily-briefing-refresh";

/** Supabase table for calendar day notes; override via env if you use a different table name. */
export function getTeamDayNotesTable(): string {
  return process.env.NEXT_PUBLIC_TEAM_DAY_NOTES_TABLE ?? "team_calendar_day_notes";
}

/**
 * Column used as the calendar-day key (`YYYY-MM-DD`). Default `day`; set
 * `NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN=date` if your table uses `date` instead.
 * Restart `next dev` after changing this — Next inlines `NEXT_PUBLIC_*` at build time.
 */
export function getTeamDayNotesDateColumn(): string {
  const raw = process.env.NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN?.trim();
  return raw && raw.length > 0 ? raw : "day";
}

/**
 * Team calendar / daily briefing note text column — always **`body`** in PostgREST (never `content`).
 */
export const TEAM_CALENDAR_DAY_NOTE_BODY = "body" as const;

/** Columns selected when loading or saving a day row (all real columns; text is `body`). */
export function teamCalendarDayNotesSelectList(): string {
  const d = getTeamDayNotesDateColumn();
  return `${d}, ${TEAM_CALENDAR_DAY_NOTE_BODY}, updated_at, updated_by`;
}

/** PostgREST `onConflict` target for upserts — must match the primary key / unique column name. */
export function getTeamDayNotesConflictColumn(): string {
  return getTeamDayNotesDateColumn();
}
