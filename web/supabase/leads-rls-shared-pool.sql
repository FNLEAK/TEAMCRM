-- Shared team pipeline: every authenticated user can read/write the same `leads` rows.
-- Run in Supabase SQL Editor if your team should see one pool (not per-rep isolation).
--
-- If you already have OTHER policies that restrict by claimed_by, either drop those policies
-- or replace them — multiple permissive policies are OR'd, so a restrictive policy plus this
-- file’s permissive policies still allows everyone to see everything (because `using (true)` wins the OR).

alter table public.leads enable row level security;

drop policy if exists "leads_select_authenticated_team_pool" on public.leads;
create policy "leads_select_authenticated_team_pool"
  on public.leads for select
  to authenticated
  using (true);

drop policy if exists "leads_insert_authenticated_team_pool" on public.leads;
create policy "leads_insert_authenticated_team_pool"
  on public.leads for insert
  to authenticated
  with check (true);

drop policy if exists "leads_update_authenticated_team_pool" on public.leads;
create policy "leads_update_authenticated_team_pool"
  on public.leads for update
  to authenticated
  using (true)
  with check (true);

-- Delete: use `leads_delete_owner_only` from leads-import-batch.sql (owners + optional bootstrap email).
