/** UTC midnight bounds for “appointments today” (matches `page.tsx` server query). */
export function utcCalendarDayBounds(): { dayStr: string; nextDayStr: string } {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const dayStr = todayUtc.toISOString().slice(0, 10);
  const tomorrowUtc = new Date(todayUtc);
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
  const nextDayStr = tomorrowUtc.toISOString().slice(0, 10);
  return { dayStr, nextDayStr };
}

function utcMondayWeekContainingUtcDate(d: Date): { monday: Date; nextMonday: Date } {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const monday = new Date(utc);
  monday.setUTCDate(utc.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return { monday, nextMonday };
}

/** Monday 00:00 UTC through next Monday 00:00 UTC (exclusive end), for weekly stats. */
export function utcCalendarWeekBounds(): { weekStartIso: string; weekEndExclusiveIso: string } {
  const { monday, nextMonday } = utcMondayWeekContainingUtcDate(new Date());
  return {
    weekStartIso: monday.toISOString(),
    weekEndExclusiveIso: nextMonday.toISOString(),
  };
}

/** Previous ISO week (Mon–Sun UTC) immediately before the current one. */
export function utcPreviousCalendarWeekBounds(): { weekStartIso: string; weekEndExclusiveIso: string } {
  const { monday } = utcMondayWeekContainingUtcDate(new Date());
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevNextMonday = new Date(prevMonday);
  prevNextMonday.setUTCDate(prevMonday.getUTCDate() + 7);
  return {
    weekStartIso: prevMonday.toISOString(),
    weekEndExclusiveIso: prevNextMonday.toISOString(),
  };
}
