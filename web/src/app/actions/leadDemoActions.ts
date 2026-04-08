"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function revalidateLeadSurfaces() {
  revalidatePath("/");
  revalidatePath("/pipeline-command-center");
}

/**
 * Toggle whether the customer demo was sent; when `sent` is true, stamps `demo_sent_at` to now (UTC).
 */
export async function setLeadDemoSentAction(
  leadId: string,
  sent: boolean,
): Promise<{ ok: boolean; error?: string; demo_sent_at?: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const demo_sent_at = sent ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("leads")
    .update({ demo_sent_status: sent, demo_sent_at })
    .eq("id", leadId);

  if (error) return { ok: false, error: error.message };
  revalidateLeadSurfaces();
  return { ok: true, demo_sent_at };
}

/** Pin (or clear) the demo URL shown on the customer share page. */
export async function pinLeadSelectedDemoAction(
  leadId: string,
  selected_demo_url: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase.from("leads").update({ selected_demo_url }).eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidateLeadSurfaces();
  return { ok: true };
}
