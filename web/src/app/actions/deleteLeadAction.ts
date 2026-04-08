"use server";

import { revalidatePath } from "next/cache";
import { canManageRoles } from "@/lib/roleAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

/**
 * Permanently delete a lead. Restricted to account owners (same as Role Applier).
 */
export async function deleteLeadAction(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const id = leadId?.trim();
  if (!id) return { ok: false, error: "Invalid lead." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can delete leads." };
  }

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/pipeline-command-center");
  return { ok: true };
}
