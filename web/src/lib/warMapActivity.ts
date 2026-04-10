import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";

export type WarMapActivityType = "interested" | "demo_sent" | "deal_closed";

export type WarMapLeadRow = {
  id?: string | null;
  company_name?: string | null;
  status?: string | null;
  phone?: string | null;
  website?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  last_activity_at?: string | null;
  demo_site_sent?: boolean | null;
};

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** Latest activity instant for 24h window filtering (prefers squad-streak stamp, then Postgres updated_at, then created). */
export function warMapLeadActivityTimeMs(row: WarMapLeadRow): number {
  const candidates = [row.last_activity_at, row.updated_at, row.created_at].map((s) =>
    s ? Date.parse(String(s)) : NaN,
  );
  const valid = candidates.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return 0;
  return Math.max(...valid);
}

/**
 * Map a lead row to a War Room pin type. Demo-sent (blue) wins over Interested (green) when both apply.
 * Excludes “Not interested”. Deal / pending-close shows gold.
 */
export function mapLeadRowToWarMapActivityType(row: WarMapLeadRow): WarMapActivityType | null {
  const s = normalizeStatus(row.status);
  if (s === "not interested") return null;

  if (s === "pending close" || s.includes("pending close") || s.includes("deal closed")) {
    return "deal_closed";
  }

  const demoOn = isDemoSiteFeatureEnabled() && row.demo_site_sent === true;
  if (demoOn) return "demo_sent";

  if (s === "interested") return "interested";

  return null;
}

export function warMapLeadStillEligible(row: WarMapLeadRow, cutoffMs: number): boolean {
  return warMapLeadActivityTimeMs(row) >= cutoffMs;
}
