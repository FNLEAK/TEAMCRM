import type { LeadRow } from "@/lib/leadTypes";

function mergeSchedulerProfile(prev: LeadRow, raw: Record<string, unknown>): LeadRow["scheduler_profile"] {
  if (Object.prototype.hasOwnProperty.call(raw, "scheduler_profile")) {
    return (raw.scheduler_profile as LeadRow["scheduler_profile"]) ?? null;
  }
  const newSid = raw.appt_scheduled_by;
  if (newSid !== undefined && (newSid as string | null) !== prev.appt_scheduled_by) {
    return undefined;
  }
  return prev.scheduler_profile;
}

/** Merge a Realtime `payload.new` row into the existing client row (handles json/array quirks). */
export function mergeLeadFromRealtime(prev: LeadRow, raw: Record<string, unknown>): LeadRow {
  const favRaw = raw.favorited_by;
  let favorited_by: LeadRow["favorited_by"] = prev.favorited_by;
  if (favRaw !== undefined) {
    if (Array.isArray(favRaw)) favorited_by = favRaw as string[];
    else if (typeof favRaw === "string") favorited_by = favRaw;
  }

  const appt_scheduled_by =
    raw.appt_scheduled_by === undefined
      ? prev.appt_scheduled_by
      : (raw.appt_scheduled_by as string | null);

  return {
    ...prev,
    ...raw,
    id: (raw.id as string) ?? prev.id,
    company_name: (raw.company_name as string | null | undefined) ?? prev.company_name,
    phone: (raw.phone as string | null | undefined) ?? prev.phone,
    website: (raw.website as string | null | undefined) ?? prev.website,
    status: (raw.status as string | null | undefined) ?? prev.status,
    notes: (raw.notes as string | null | undefined) ?? prev.notes,
    favorited_by,
    appt_date: (raw.appt_date as string | null | undefined) ?? prev.appt_date,
    appt_scheduled_by,
    scheduler_profile: mergeSchedulerProfile(prev, raw),
    claimed_by:
      raw.claimed_by === undefined ? prev.claimed_by : (raw.claimed_by as string | null),
    is_high_priority:
      raw.is_high_priority === undefined
        ? prev.is_high_priority
        : (raw.is_high_priority as boolean | null),
    last_activity_by:
      raw.last_activity_by === undefined
        ? prev.last_activity_by
        : (raw.last_activity_by as string | null),
    import_batch_id:
      raw.import_batch_id === undefined
        ? prev.import_batch_id
        : (raw.import_batch_id as string | null | undefined),
    import_filename:
      raw.import_filename === undefined
        ? prev.import_filename
        : (raw.import_filename as string | null | undefined),
    created_at: (raw.created_at as string | null | undefined) ?? prev.created_at,
    selected_demo_url:
      raw.selected_demo_url === undefined
        ? prev.selected_demo_url
        : (raw.selected_demo_url as string | null),
    demo_sent_status:
      raw.demo_sent_status === undefined
        ? prev.demo_sent_status
        : (raw.demo_sent_status as boolean | null),
    demo_sent_at:
      raw.demo_sent_at === undefined ? prev.demo_sent_at : (raw.demo_sent_at as string | null),
    demo_share_token:
      raw.demo_share_token === undefined
        ? prev.demo_share_token
        : (raw.demo_share_token as string | null),
  };
}
