"use server";

import { revalidatePath } from "next/cache";
import { canManageRoles } from "@/lib/roleAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const MAX_BATCH = 500;

/**
 * Permanently delete many leads. Same authorization as {@link deleteLeadAction} (account owners only).
 */
export async function deleteLeadsBulkAction(
  leadIds: string[],
): Promise<{ ok: boolean; error?: string; deleted?: number }> {
  const ids = [...new Set(leadIds.map((id) => id?.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "No leads selected." };
  if (ids.length > MAX_BATCH) {
    return { ok: false, error: `Select at most ${MAX_BATCH} leads per request.` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can delete leads." };
  }

  const { error } = await supabase.from("leads").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/pipeline-command-center");
  return { ok: true, deleted: ids.length };
}
