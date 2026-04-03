import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "@/lib/ownerRoleGate";

export async function canManageRoles(
  supabase: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (isOwnerEmail(email)) return true;

  const { data, error } = await (supabase as any)
    .from("team_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return data?.role === "owner";
}
