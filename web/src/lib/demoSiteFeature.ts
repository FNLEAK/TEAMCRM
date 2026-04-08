/** Opt-in demo site columns + drawer fields — see `web/supabase/leads-demo-site.sql`. */
export function isDemoSiteFeatureEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LEADS_HAS_DEMO_SITE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
