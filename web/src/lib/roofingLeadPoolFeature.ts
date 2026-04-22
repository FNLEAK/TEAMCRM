/** Opt-in `leads.is_roofing_lead` — see `web/supabase/leads-roofing-pool.sql`. */
export function isRoofingLeadPoolEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
