-- Restrict `leads` DELETE to account owners (replace permissive batch-delete policy).
-- Run in Supabase SQL Editor if you already applied the older `leads_delete_authenticated_csv_batch` policy.
-- Align the email literal with `team-roles.sql` and `web/src/lib/ownerRoleGate.ts` if you use the bootstrap clause.

drop policy if exists "leads_delete_authenticated_csv_batch" on public.leads;
drop policy if exists "leads_delete_owner_only" on public.leads;

create policy "leads_delete_owner_only"
  on public.leads for delete
  to authenticated
  using (
    public.is_current_user_team_owner()
    or lower(coalesce(auth.jwt()->>'email', '')) = 'teamwebfriendly@gmail.com'
  );
