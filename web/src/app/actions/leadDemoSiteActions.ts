"use server";

import { revalidatePath } from "next/cache";
import { canManageRoles } from "@/lib/roleAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function revalidateCrm() {
  revalidatePath("/");
  revalidatePath("/pipeline-command-center");
}

/** Owners only (same rule as Role Applier / Admin Panel). */
export async function setDemoSiteUrlAction(
  leadId: string,
  url: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can set the demo site link." };
  }

  const trimmed = typeof url === "string" ? url.trim() : "";
  const nextUrl = trimmed.length > 0 ? trimmed : null;

  const { error } = await supabase.from("leads").update({ demo_site_url: nextUrl }).eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidateCrm();
  return { ok: true };
}

/** Any signed-in teammate with normal `leads` update access. */
export async function setDemoSiteSentAction(
  leadId: string,
  sent: boolean,
): Promise<{ ok: boolean; error?: string; demo_site_sent_at?: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const demo_site_sent_at = sent ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("leads")
    .update({ demo_site_sent: sent, demo_site_sent_at })
    .eq("id", leadId);

  if (error) return { ok: false, error: error.message };
  revalidateCrm();
  return { ok: true, demo_site_sent_at };
}
