/**
 * Opt-in vertical tab — see `web/supabase/leads-roofing-pool.sql`.
 * After you run `web/supabase/leads-crm-pool.sql`, set `NEXT_PUBLIC_LEADS_USE_CRM_POOL=true` so
 * filters use `crm_pool` (main vs roofing vs future hvac). Until then, the app uses `is_roofing_lead` only.
 */
export function isRoofingLeadPoolEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LEADS_HAS_ROOFING_POOL?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** When true, `crm_pool` is selected and filtered; requires `web/supabase/leads-crm-pool.sql` applied. */
export function isCrmPoolColumnEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LEADS_USE_CRM_POOL?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * PostgREST `.or()` for main Command when `crm_pool` is not enabled yet: not in roofing pool.
 */
export const MAIN_POOL_ROOFING_LEAD_FILTER = "is_roofing_lead.is.null,is_roofing_lead.eq.false" as const;
