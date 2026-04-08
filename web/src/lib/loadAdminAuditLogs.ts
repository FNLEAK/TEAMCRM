import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProfilesByIds } from "@/lib/profileSelect";
import { teamProfileFromDb, type TeamProfile } from "@/lib/leadTypes";
import type { CrmAuditLogRow } from "@/lib/adminAuditTypes";

/** Match auth user / profile UUIDs in audit JSON (not every random uuid field). */
const USER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function addUuidIfUserLike(set: Set<string>, v: unknown): void {
  if (typeof v !== "string") return;
  if (USER_UUID_RE.test(v)) set.add(v);
}

/** Scan `details` for user ids so Admin Logs can show names instead of raw UUIDs. */
export function collectAuditRelatedUserIds(rows: CrmAuditLogRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.actor_id) out.add(r.actor_id);
    const d = r.details;
    if (!d || typeof d !== "object") continue;
    const rec = d as Record<string, unknown>;

    const scanPair = (v: unknown) => {
      if (v == null) return;
      if (typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        addUuidIfUserLike(out, o.from);
        addUuidIfUserLike(out, o.to);
      }
    };

    scanPair(rec.claimed_by);
    scanPair(rec.appt_scheduled_by);

    for (const key of ["claimed_by", "appt_scheduled_by", "requested_by"]) {
      const v = rec[key];
      if (typeof v === "string") addUuidIfUserLike(out, v);
    }
  }
  return [...out];
}

export type ClosedDealAuditRow = {
  id: string;
  lead_id: string;
  amount: number;
  approval_status: string;
  created_at: string;
  requested_by: string;
};

export async function loadAdminAuditLogs(supabase: SupabaseClient): Promise<{
  rows: CrmAuditLogRow[];
  error: string | null;
  tableMissing: boolean;
}> {
  const { data, error } = await supabase
    .from("crm_admin_audit_log")
    .select("id, created_at, actor_id, action, lead_id, company_name, details")
    .order("created_at", { ascending: false })
    .limit(350);

  if (error) {
    const msg = error.message ?? "";
    const missing =
      msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      error.code === "42P01" ||
      error.code === "PGRST205";
    return { rows: [], error: missing ? null : msg, tableMissing: missing };
  }

  return { rows: (data ?? []) as CrmAuditLogRow[], error: null, tableMissing: false };
}

export async function loadActorProfiles(
  supabase: SupabaseClient,
  actorIds: string[],
): Promise<Record<string, TeamProfile>> {
  const uniq = [...new Set(actorIds.filter(Boolean))];
  if (uniq.length === 0) return {};
  const { data, error } = await fetchProfilesByIds(supabase, uniq);
  if (error || !data?.length) return {};
  const map: Record<string, TeamProfile> = {};
  for (const p of data) {
    const id = p.id as string;
    map[id] = teamProfileFromDb({
      id,
      first_name: p.first_name ?? null,
      full_name: p.full_name ?? null,
      avatar_initials: p.avatar_initials ?? null,
      email: p.email ?? null,
    });
  }
  return map;
}

/** Fallback when audit table not migrated — surface recent deal requests from closed_deals. */
export async function loadRecentClosedDealsForAdmin(supabase: SupabaseClient): Promise<{
  rows: ClosedDealAuditRow[];
  error: string | null;
}> {
  const q = await supabase
    .from("closed_deals")
    .select("id, lead_id, amount, approval_status, created_at, requested_by")
    .order("created_at", { ascending: false })
    .limit(40);
  if (q.error) {
    const msg = q.error.message ?? "";
    if (msg.includes("does not exist") || msg.includes("schema cache")) {
      return { rows: [], error: null };
    }
    return { rows: [], error: msg };
  }
  return { rows: (q.data ?? []) as ClosedDealAuditRow[], error: null };
}
