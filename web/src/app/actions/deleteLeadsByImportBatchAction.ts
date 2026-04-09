"use server";

import { revalidatePath } from "next/cache";
import { canManageRoles } from "@/lib/roleAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

/**
 * Deletes all leads sharing an import batch. Same privilege as single-lead delete — account owners only.
 */
export async function deleteLeadsByImportBatchAction(
  importBatchId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = importBatchId?.trim();
  if (!id) return { ok: false, error: "Invalid import batch." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can delete leads." };
  }

  const { error } = await supabase.from("leads").delete().eq("import_batch_id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/pipeline-command-center");
  return { ok: true };
}
