export type CrmAuditAction =
  | "lead_created"
  | "lead_updated"
  | "lead_deleted"
  | "note_added"
  | "deal_request";

export type CrmAuditLogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: CrmAuditAction | string;
  lead_id: string | null;
  company_name: string | null;
  details: Record<string, unknown>;
};
