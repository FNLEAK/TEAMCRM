/*
  TEAM LAUNCH — run these in Supabase SQL Editor in order (skip any you already applied).
  Paths are under web/supabase/ in your repo.

  1. profiles-and-claimed.sql     — profiles + claimed_by on leads
  1b. leads-rls-shared-pool.sql  — optional: shared-pool SELECT/INSERT/UPDATE on leads (whole team sees same book)
  2. team-roles.sql               — team_roles + RLS (owner = row in team_roles, optional bootstrap email)
  3. crm-engine.sql               — appt_scheduled_by + lead_activity + RLS
  3b. leads-status-check.sql      — leads.status CHECK allows Pending Close / Interested (fixes close request errors)
  4. leads-appt-scheduled-by-profiles-fk.sql — optional FK to profiles for scheduler embed
  5. squad-streak-lead-activity.sql — last_activity_by/at + trigger on leads
  6. leads-import-batch.sql       — import_batch_id/filename + get_recent_import_batches RPC + delete policy
  7. leads-favorited-by.sql       — favorited_by on leads (stars)
  7b. leads-high-priority.sql     — is_high_priority (team-visible flag)
  7c. leads-demo-site.sql         — demo_site_* columns; then set NEXT_PUBLIC_LEADS_HAS_DEMO_SITE=true in web/.env.local
  7d. leads-appt-lock-enforce.sql — re-run if you use appointment lock so demo fields stay editable when locked
  8. appointments-squad-streak.sql — optional appointments + Realtime
  9. crm-settings.sql             — crm_settings + RLS
  10. closed-deals.sql            — closed_deals + RLS
  11. team-calendar-day-notes.sql (+ team-calendar-day-notes-rls-fix.sql if needed)
  11b. team-calendar-day-notes-updated-by-fk-fix.sql — if `updated_by` FK points at profiles but app sends auth uid
  12. team-chat-messages.sql      — DM + team room + RLS + Realtime publication lines

  Then in Dashboard → Database → Publications → supabase_realtime, ensure enabled for at least:
    leads, lead_activity, crm_settings, team_room_messages, dm_messages, (appointments if you added it)

  Your `weekly_closed_leads` view is for reporting; the app KPI header reads `leads` directly.

  Security checklist + optional tighter `leads` RLS:
  • Read `SECURITY-RUNBOOK.sql`
  • Optional: `security-optional-member-allowlist-rls.sql` (only if you want allowlist-gated CRM data)
*/

select 1 as ready;
