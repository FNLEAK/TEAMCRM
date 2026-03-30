import type { SupabaseClient } from "@supabase/supabase-js";

/** Single source of truth for `profiles` selects (keeps server + client in sync with your schema). */
export const PROFILE_COLUMNS_FULL = "id, first_name, full_name, avatar_initials" as const;
export const PROFILE_COLUMNS_CORE = "id, first_name, full_name" as const;

export type ProfileRow = {
  id: string;
  first_name?: string | null;
  full_name?: string | null;
  avatar_initials?: string | null;
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
