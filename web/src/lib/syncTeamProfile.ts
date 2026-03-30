import type { SupabaseClient } from "@supabase/supabase-js";
import { initialsFromFullName } from "@/lib/leadTypes";

/**
 * Upserts `public.profiles` from the current session so favorites / claims show names to the team.
 * Safe to call after login, sign-up, or starring a lead.
 */
export async function upsertTeamProfileFromSession(supabase: SupabaseClient): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const first =
    typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
  const fullMeta =
    typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  const nameMeta = typeof meta?.name === "string" ? meta.name.trim() : "";

  const fullName =
    fullMeta ||
    first ||
    nameMeta ||
    user.email?.split("@")[0] ||
    "User";

  const initials = initialsFromFullName(fullName).slice(0, 3);

  const row: Record<string, unknown> = {
    id: user.id,
    full_name: fullName,
    avatar_initials: initials,
    updated_at: new Date().toISOString(),
  };
  if (first) {
    row.first_name = first;
  }

  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "id" });

  if (error) {
    console.warn("[CRM] profiles upsert skipped — run supabase/profiles-and-claimed.sql and check RLS:", error.message);
  }
}
