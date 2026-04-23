import type { LeadRow } from "@/lib/leadTypes";

/**
 * Which CRM surface owns a lead row (`public.leads.crm_pool`).
 * - `main` — website / shared Command pool (unchanged behavior for those leads).
 * - `roofing` — Roofing Leads Management (`/roofing-leads`).
 * - `hvac` — reserved for a future HVAC tab; add route + nav when you enable it.
 *
 * Legacy `is_roofing_lead` is still written in sync for older migrations; new code should prefer `crm_pool`.
 */
export const CRM_POOL_MAIN = "main" as const;
export const CRM_POOL_ROOFING = "roofing" as const;
export const CRM_POOL_HVAC = "hvac" as const;

export type CrmPoolId = typeof CRM_POOL_MAIN | typeof CRM_POOL_ROOFING | typeof CRM_POOL_HVAC;

/** Values allowed in DB check constraint — extend here + in `web/supabase/leads-crm-pool.sql` when adding a vertical. */
export const CRM_POOL_IDS: readonly CrmPoolId[] = [CRM_POOL_MAIN, CRM_POOL_ROOFING, CRM_POOL_HVAC];

export function normalizeCrmPool(raw: string | null | undefined): CrmPoolId {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === CRM_POOL_ROOFING) return CRM_POOL_ROOFING;
  if (t === CRM_POOL_HVAC) return CRM_POOL_HVAC;
  if (t === CRM_POOL_MAIN) return CRM_POOL_MAIN;
  return CRM_POOL_MAIN;
}

/**
 * Effective pool for UI + realtime while `crm_pool` is rolling out: prefer column, then legacy boolean.
 */
export function resolveCrmPool(row: Pick<LeadRow, "crm_pool" | "is_roofing_lead">): CrmPoolId {
  const fromCol = normalizeCrmPool(row.crm_pool ?? undefined);
  if (fromCol !== CRM_POOL_MAIN) return fromCol;
  if (row.is_roofing_lead === true) return CRM_POOL_ROOFING;
  return CRM_POOL_MAIN;
}

export function isMainCrmPoolLead(row: Pick<LeadRow, "crm_pool" | "is_roofing_lead">): boolean {
  return resolveCrmPool(row) === CRM_POOL_MAIN;
}

export function isRoofingCrmPoolLead(row: Pick<LeadRow, "crm_pool" | "is_roofing_lead">): boolean {
  return resolveCrmPool(row) === CRM_POOL_ROOFING;
}

/** Realtime / partial payloads: derive pool before `crm_pool` exists on every row. */
export function crmPoolFromRealtimePayload(raw: Record<string, unknown>): CrmPoolId {
  const p = typeof raw.crm_pool === "string" ? raw.crm_pool : "";
  const n = normalizeCrmPool(p);
  if (n !== CRM_POOL_MAIN) return n;
  if (raw.is_roofing_lead === true) return CRM_POOL_ROOFING;
  return CRM_POOL_MAIN;
}
