import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRecentImportBatches, type ImportBatchRow } from "@/lib/importBatchHistory";
import { fetchProfilesByIds } from "@/lib/profileSelect";
import { LEAD_STATUSES, teamProfileFromDb } from "@/lib/leadTypes";
import { utcCalendarDayBounds, utcCalendarWeekBounds, utcPreviousCalendarWeekBounds } from "@/lib/utcDayBounds";

export type StatusCountRow = { status: string; count: number };

export type OpsCoverageData = {
  totalLeads: number;
  appointmentsToday: number;
  apptSetLeads: number;
  notInterestedLeads: number;
  importBatches: ImportBatchRow[];
  importRpcError: string | null;
};

export type SquadStreakRow = {
  userId: string;
  displayName: string;
  thisWeekAppts: number;
  prevWeekAppts: number;
  streakLabel: string;
};

export type SearchSourcesData = {
  importBatches: ImportBatchRow[];
  importError: string | null;
  statusCounts: StatusCountRow[];
  claimedByTop: { userId: string; label: string; count: number }[];
};

/** Count leads per canonical status (same strings as `LEAD_STATUSES` + “Other”). */
export async function fetchStatusDistribution(
  supabase: SupabaseClient,
): Promise<{ rows: StatusCountRow[]; otherCount: number; error: string | null }> {
  const rows: StatusCountRow[] = [];
  let err: string | null = null;

  for (const status of LEAD_STATUSES) {
    const { count, error } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    if (error) {
      err = error.message;
      break;
    }
    rows.push({ status, count: count ?? 0 });
  }

  const knownTotal = rows.reduce((a, r) => a + r.count, 0);
  const { count: allCount, error: allErr } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });
  if (allErr) {
    return { rows, otherCount: 0, error: allErr.message };
  }
  const otherCount = Math.max(0, (allCount ?? 0) - knownTotal);

  return { rows, otherCount, error: err };
}

export async function fetchOpsCoverage(supabase: SupabaseClient): Promise<{
  data: OpsCoverageData;
  error: string | null;
}> {
  const { dayStr, nextDayStr } = utcCalendarDayBounds();

  const [{ count: totalLeads = 0 }, apptToday, apptSet, notInterested, batches] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("appt_date", dayStr)
      .lt("appt_date", nextDayStr),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "Appt Set"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "Not Interested"),
    fetchRecentImportBatches(supabase, 8),
  ]);

  const apptErr = apptToday.error;
  if (apptErr) {
    console.warn("[demo] appt_date filter:", apptErr.message);
  }

  return {
    data: {
      totalLeads: totalLeads ?? 0,
      appointmentsToday: apptToday.count ?? 0,
      apptSetLeads: apptSet.count ?? 0,
      notInterestedLeads: notInterested.count ?? 0,
      importBatches: batches.rows,
      importRpcError: batches.error,
    },
    error: null,
  };
}

export async function fetchSquadStreaks(supabase: SupabaseClient): Promise<{
  rows: SquadStreakRow[];
  error: string | null;
}> {
  const { weekStartIso, weekEndExclusiveIso } = utcCalendarWeekBounds();
  const { weekStartIso: prevWeekStart, weekEndExclusiveIso: prevWeekEndEx } = utcPreviousCalendarWeekBounds();

  const [weekRes, prevRes] = await Promise.all([
    supabase
      .from("leads")
      .select("appt_scheduled_by")
      .eq("status", "Appt Set")
      .not("appt_scheduled_by", "is", null)
      .gte("appt_date", weekStartIso)
      .lt("appt_date", weekEndExclusiveIso),
    supabase
      .from("leads")
      .select("appt_scheduled_by")
      .eq("status", "Appt Set")
      .not("appt_scheduled_by", "is", null)
      .gte("appt_date", prevWeekStart)
      .lt("appt_date", prevWeekEndEx),
  ]);

  if (weekRes.error) return { rows: [], error: weekRes.error.message };
  if (prevRes.error) return { rows: [], error: prevRes.error.message };

  const thisWeek = new Map<string, number>();
  const prevWeek = new Map<string, number>();

  for (const row of weekRes.data ?? []) {
    const id = (row as { appt_scheduled_by?: string | null }).appt_scheduled_by;
    if (id) thisWeek.set(id, (thisWeek.get(id) ?? 0) + 1);
  }
  for (const row of prevRes.data ?? []) {
    const id = (row as { appt_scheduled_by?: string | null }).appt_scheduled_by;
    if (id) prevWeek.set(id, (prevWeek.get(id) ?? 0) + 1);
  }

  const allIds = new Set([...thisWeek.keys(), ...prevWeek.keys()]);
  const { data: profs, error: pErr } = await fetchProfilesByIds(supabase, [...allIds]);
  if (pErr) {
    console.warn("[demo] profiles for squad:", pErr.message);
  }
  const profileMap = new Map((profs ?? []).map((p) => [p.id, teamProfileFromDb(p)]));

  const rows: SquadStreakRow[] = [...allIds].map((userId) => {
    const t = thisWeek.get(userId) ?? 0;
    const p = prevWeek.get(userId) ?? 0;
    const prof = profileMap.get(userId);
    let streakLabel = "—";
    if (t > 0 && p > 0) streakLabel = "On streak (2+ wks with appts)";
    else if (t > 0) streakLabel = "Active this week";
    else if (p > 0) streakLabel = "Cooled off (last week only)";
    return {
      userId,
      displayName: prof?.fullName || prof?.label || userId.slice(0, 8),
      thisWeekAppts: t,
      prevWeekAppts: p,
      streakLabel,
    };
  });

  rows.sort((a, b) => b.thisWeekAppts - a.thisWeekAppts || b.prevWeekAppts - a.prevWeekAppts);

  return { rows, error: null };
}

export async function fetchSearchSourcesSnapshot(supabase: SupabaseClient): Promise<{
  data: SearchSourcesData;
  error: string | null;
}> {
  const batches = await fetchRecentImportBatches(supabase, 15);

  const statusRows = await fetchStatusDistribution(supabase);

  const hasClaimed = process.env.NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY === "true";
  let claimedByTop: SearchSourcesData["claimedByTop"] = [];

  if (hasClaimed) {
    const { data: claimedRows, error: cErr } = await supabase
      .from("leads")
      .select("claimed_by")
      .not("claimed_by", "is", null)
      .limit(8000);
    if (!cErr && claimedRows) {
      const counts = new Map<string, number>();
      for (const r of claimedRows as { claimed_by?: string | null }[]) {
        const id = r.claimed_by;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      const { data: profs } = await fetchProfilesByIds(
        supabase,
        top.map(([id]) => id),
      );
      const pmap = new Map((profs ?? []).map((p) => [p.id, teamProfileFromDb(p)]));
      claimedByTop = top.map(([userId, count]) => ({
        userId,
        count,
        label: pmap.get(userId)?.fullName || pmap.get(userId)?.label || userId.slice(0, 8),
      }));
    }
  }

  return {
    data: {
      importBatches: batches.rows,
      importError: batches.error,
      statusCounts: statusRows.rows,
      claimedByTop,
    },
    error: statusRows.error,
  };
}

/** Squad arena: weekly appt leaderboard + profile count (same Supabase patterns as Command home). */
export async function fetchArenaSnapshot(supabase: SupabaseClient): Promise<{
  squadRows: SquadStreakRow[];
  profileCount: number;
  error: string | null;
}> {
  const [{ rows, error }, { count: profileCount, error: pcErr }] = await Promise.all([
    fetchSquadStreaks(supabase),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);
  if (pcErr) {
    return { squadRows: rows, profileCount: 0, error: pcErr.message };
  }
  return { squadRows: rows, profileCount: profileCount ?? 0, error };
}
