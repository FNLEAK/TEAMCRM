import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamProfile } from "@/lib/leadTypes";
import {
  mergeTeamRoleLabelIntoProfile,
  needsTeamRoleNameFallback,
  type TeamRoleDisplay,
} from "@/lib/profileDisplay";
import { readableEmailLocalPart } from "@/lib/readableEmailLocal";

/** Single source of truth for `profiles` selects (keeps server + client in sync with your schema). */
export const PROFILE_COLUMNS_FULL = "id, first_name, full_name, avatar_initials, email" as const;
export const PROFILE_COLUMNS_CORE = "id, first_name, full_name" as const;

export type ProfileRow = {
  id: string;
  first_name?: string | null;
  full_name?: string | null;
  avatar_initials?: string | null;
  email?: string | null;
};

/** PostgREST / schema errors that mean a column is missing — retry without optional columns. */
export function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find") ||
    m.includes("42703")
  );
}

export async function fetchProfileById(supabase: SupabaseClient, id: string) {
  let r = await supabase.from("profiles").select(PROFILE_COLUMNS_FULL).eq("id", id).maybeSingle();
  if (r.error && isMissingColumnError(r.error.message)) {
    r = await supabase.from("profiles").select(PROFILE_COLUMNS_CORE).eq("id", id).maybeSingle();
  }
  return r;
}

export async function fetchProfilesByIds(supabase: SupabaseClient, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return { data: [] as ProfileRow[], error: null };
  const full = await supabase.from("profiles").select(PROFILE_COLUMNS_FULL).in("id", uniq);
  if (full.error && isMissingColumnError(full.error.message)) {
    const core = await supabase.from("profiles").select(PROFILE_COLUMNS_CORE).in("id", uniq);
    return { data: (core.data ?? []) as ProfileRow[], error: core.error };
  }
  return { data: (full.data ?? []) as ProfileRow[], error: full.error };
}

/** Labels from `team_roles` when `profiles` has no display name (Claimed by, etc.). */
export async function fetchTeamRoleDisplayByUserIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Record<string, TeamRoleDisplay>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return {};
  const { data, error } = await (supabase as any)
    .from("team_roles")
    .select("user_id, account_name, account_email")
    .in("user_id", uniq);
  if (error || !Array.isArray(data) || data.length === 0) return {};
  const out: Record<string, TeamRoleDisplay> = {};
  for (const row of data as { user_id?: string; account_name?: string | null; account_email?: string | null }[]) {
    const uid = row.user_id;
    if (!uid) continue;
    const acc = String(row.account_name ?? "").trim();
    const em = String(row.account_email ?? "").trim();
    const name = acc || (em ? readableEmailLocalPart(em) : "");
    if (name) out[uid] = { name, email: em || undefined };
  }
  return out;
}

/** Patch profiles in place using `team_roles` for any id that still lacks a real display name. */
export async function enrichProfileMapWithTeamRoles(
  supabase: SupabaseClient,
  map: Record<string, TeamProfile>,
  userIds: string[],
): Promise<void> {
  const need = [...new Set(userIds.filter(Boolean))].filter((id) => needsTeamRoleNameFallback(map[id]));
  if (need.length === 0) return;
  const labels = await fetchTeamRoleDisplayByUserIds(supabase, need);
  for (const id of need) {
    const role = labels[id];
    if (!role) continue;
    map[id] = mergeTeamRoleLabelIntoProfile(map[id], role);
  }
}
