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
    email: user.email?.trim().toLowerCase() ?? null,
    avatar_initials: initials,
    updated_at: new Date().toISOString(),
  };
  if (first) {
    row.first_name = first;
  }

  let { error } = await (supabase as any).from("profiles").upsert(row, { onConflict: "id" });
  if (error && String(error.message).toLowerCase().includes("email")) {
    const fallback = { ...row };
    delete fallback.email;
    ({ error } = await (supabase as any).from("profiles").upsert(fallback, { onConflict: "id" }));
  }

  if (error) {
    console.warn(
      "[CRM] profiles upsert skipped — run supabase/profiles-and-claimed.sql and check RLS:",
      error.message,
    );
  }
}

/**
 * Ensures every authenticated account has a default `team_roles` row (`team`).
 * Uses insert-ignore semantics so existing rows (including `owner`) are never overwritten.
 */
export async function ensureTeamRoleFromSession(supabase: SupabaseClient): Promise<void> {
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
  const email = user.email?.trim().toLowerCase() ?? null;
  const accountName =
    fullMeta ||
    first ||
    nameMeta ||
    (email ? email.split("@")[0] : "") ||
    "User";

  const { error } = await (supabase as any).from("team_roles").upsert(
    {
      user_id: user.id,
      role: "team",
      account_name: accountName,
      account_email: email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  if (error) {
    const m = error.message?.toLowerCase?.() ?? "";
    if (m.includes("does not exist") || m.includes("could not find")) {
      console.warn("[CRM] team_roles table missing — run web/supabase/team-roles.sql");
      return;
    }
    console.warn("[CRM] team role auto-register skipped:", error.message);
  }

  // Best effort refresh of display info for existing self team row.
  await (supabase as any)
    .from("team_roles")
    .update({
      account_name: accountName,
      account_email: email,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("role", "team");
}
