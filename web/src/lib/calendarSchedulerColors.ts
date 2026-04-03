/**
 * Team schedule: first five UUIDs in `teamMemberOrder` get fixed slots (crm-cal-sch-0 … 4).
 * Set `NEXT_PUBLIC_CALENDAR_TEAM_USER_IDS=id1,id2,...` so colors never shuffle when the roster is stable.
 * Everyone else gets a deterministic accent bucket (sch-5…7).
 */
const TEAM_COLOR_SLOTS = 5;

/** Stable color index 0–7 (matches calendar event classes) for avatar rings. */
export function schedulerTeamColorIndex(
  userId: string | null | undefined,
  teamMemberOrder: readonly string[] | undefined,
): number {
  if (!userId || typeof userId !== "string") return -1;
  const order = teamMemberOrder ?? [];
  const idx = order.indexOf(userId);
  if (idx !== -1 && idx < TEAM_COLOR_SLOTS) return idx;
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return 5 + (h % 3);
}

/** CSS class for a small avatar circle (see globals `.crm-team-avatar-*`). */
export function schedulerTeamAvatarClass(
  userId: string | null | undefined,
  teamMemberOrder: readonly string[] | undefined,
): string {
  const n = schedulerTeamColorIndex(userId, teamMemberOrder);
  if (n < 0) return "crm-team-avatar-unassigned";
  return `crm-team-avatar-${n}`;
}

export function schedulerColorClass(
  schedulerId: string | null | undefined,
  teamMemberOrder: readonly string[] | undefined,
): string {
  if (!schedulerId || typeof schedulerId !== "string") return "crm-cal-sch-unassigned";
  const order = teamMemberOrder ?? [];
  const idx = order.indexOf(schedulerId);
  if (idx !== -1 && idx < TEAM_COLOR_SLOTS) {
    return `crm-cal-sch-${idx}`;
  }
  let h = 0;
  for (let i = 0; i < schedulerId.length; i++) {
    h = (h * 31 + schedulerId.charCodeAt(i)) >>> 0;
  }
  return `crm-cal-sch-${5 + (h % 3)}`;
}
