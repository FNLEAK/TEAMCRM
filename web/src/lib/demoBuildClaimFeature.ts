/**
 * Opt-in “who is building this demo” columns — requires `web/supabase/leads-demo-build-claim.sql` on Supabase.
 * Set `NEXT_PUBLIC_LEADS_HAS_DEMO_BUILD_CLAIM=true` after the migration (keep demo site flag on as needed).
 */
export function isDemoBuildClaimFeatureEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LEADS_HAS_DEMO_BUILD_CLAIM?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
