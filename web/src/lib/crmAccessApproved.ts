import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerApprovalGateEnabled } from "@/lib/crmRouteGuards";
import type { Database } from "@/lib/database.types";
import { isOwnerEmail } from "@/lib/ownerRoleGate";

/** True when the user may use CRM APIs (mirrors middleware when the gate is enabled). */
export async function isUserCrmAccessApproved(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | undefined,
): Promise<boolean> {
  if (!ownerApprovalGateEnabled()) return true;
  if (isOwnerEmail(email)) return true;
  const { data: row, error } = await supabase
    .from("team_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) return false;
  return row.role === "team" || row.role === "owner";
}
