"use server";

import { revalidatePath } from "next/cache";
import { isDemoBuildClaimFeatureEnabled } from "@/lib/demoBuildClaimFeature";
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

/** Owners only — same as demo URL / build claim (internal demo ops). */
export async function setDemoSiteSentAction(
  leadId: string,
  sent: boolean,
): Promise<{ ok: boolean; error?: string; demo_site_sent_at?: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can update demo sent status." };
  }

  const demo_site_sent_at = sent ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("leads")
    .update({ demo_site_sent: sent, demo_site_sent_at })
    .eq("id", leadId);

  if (error) return { ok: false, error: error.message };
  revalidateCrm();
  return { ok: true, demo_site_sent_at };
}

/** Owners only. Sets you as the person building this lead’s demo; fails if another owner already claimed. */
export async function claimDemoBuildAction(leadId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isDemoBuildClaimFeatureEnabled()) {
    return {
      ok: false,
      error:
        "Demo build coordination is off. Run `web/supabase/leads-demo-build-claim.sql` in Supabase, then set NEXT_PUBLIC_LEADS_HAS_DEMO_BUILD_CLAIM=true.",
    };
  }
  const id = leadId?.trim();
  if (!id) return { ok: false, error: "Invalid lead." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can claim demo work." };
  }

  const { data: row, error: selErr } = await supabase
    .from("leads")
    .select("demo_build_claimed_by")
    .eq("id", id)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };
  if (!row) return { ok: false, error: "Lead not found." };

  const cur = (row as { demo_build_claimed_by?: string | null }).demo_build_claimed_by?.trim() || null;
  if (cur && cur !== user.id) {
    return { ok: false, error: "Another owner is already building this demo." };
  }
  if (cur === user.id) {
    revalidateCrm();
    return { ok: true };
  }

  const claimedAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("leads")
    .update({ demo_build_claimed_by: user.id, demo_build_claimed_at: claimedAt })
    .eq("id", id)
    .is("demo_build_claimed_by", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated?.length) {
    return { ok: false, error: "Another owner just claimed this demo — refresh and try again." };
  }
  revalidateCrm();
  return { ok: true };
}

/** Owners only. Clears the demo-build lock (claimer or partner owner — avoids stuck locks). */
export async function releaseDemoBuildAction(leadId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isDemoBuildClaimFeatureEnabled()) {
    return {
      ok: false,
      error:
        "Demo build coordination is off. Run `web/supabase/leads-demo-build-claim.sql` in Supabase, then set NEXT_PUBLIC_LEADS_HAS_DEMO_BUILD_CLAIM=true.",
    };
  }
  const id = leadId?.trim();
  if (!id) return { ok: false, error: "Invalid lead." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return { ok: false, error: "Only account owners can release a demo build lock." };
  }

  const { error } = await supabase
    .from("leads")
    .update({ demo_build_claimed_by: null, demo_build_claimed_at: null })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidateCrm();
  return { ok: true };
}
