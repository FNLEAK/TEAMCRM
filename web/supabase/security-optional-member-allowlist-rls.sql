-- =============================================================================
-- OPTIONAL: Restrict `leads` to owners + emails on an allowlist
-- =============================================================================
-- Your app currently uses `leads-rls-shared-pool.sql` (any authenticated user
-- sees all leads). That matches an open team CRM but means anyone who can
-- create a Supabase Auth account can read/write the book.
--
-- USE THIS FILE ONLY IF you want to tighten the database layer:
--   1) Owner adds teammate emails to `team_member_allowlist` (or bulk seed).
--   2) You replace `leads` policies with the guarded versions at the bottom.
--
-- Before applying guarded policies, INSERT allowlist rows for every teammate:
--   insert into public.team_member_allowlist (email) values
--     ('person1@company.com'),
--     ('person2@company.com')
--   on conflict (email) do nothing;
--
-- Owners always pass via `team_roles.role = 'owner'` or bootstrap email in
-- `is_crm_member()` — keep that email aligned with NEXT_PUBLIC_OWNER_EMAIL in the app.
-- =============================================================================

create table if not exists public.team_member_allowlist (
  email citext primary key,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists team_member_allowlist_email_lower_idx
  on public.team_member_allowlist (lower(email::text));

alter table public.team_member_allowlist enable row level security;

-- Owners (and bootstrap email) can manage the roster; normal members cannot read the list.
drop policy if exists "team_member_allowlist_owner_all" on public.team_member_allowlist;
create policy "team_member_allowlist_owner_all"
  on public.team_member_allowlist
  for all
  to authenticated
  using (
    exists (select 1 from public.team_roles tr where tr.user_id = auth.uid() and tr.role = 'owner')
    or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
  )
  with check (
    exists (select 1 from public.team_roles tr where tr.user_id = auth.uid() and tr.role = 'owner')
    or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
  );

create or replace function public.is_crm_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.team_roles tr where tr.user_id = auth.uid() and tr.role = 'owner')
    or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
    or exists (
      select 1 from public.team_member_allowlist a
      where lower(a.email) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    );
$$;

revoke all on function public.is_crm_member() from public;
grant execute on function public.is_crm_member() to authenticated;

-- -----------------------------------------------------------------------------
-- GUARDED LEADS POLICIES (run ONLY after allowlist is populated)
-- -----------------------------------------------------------------------------
-- 1) Remove shared-pool policies from leads-rls-shared-pool.sql:
/*
drop policy if exists "leads_select_authenticated_team_pool" on public.leads;
drop policy if exists "leads_insert_authenticated_team_pool" on public.leads;
drop policy if exists "leads_update_authenticated_team_pool" on public.leads;
*/

-- 2) Then create:
/*
drop policy if exists "leads_select_crm_members" on public.leads;
create policy "leads_select_crm_members"
  on public.leads for select
  to authenticated
  using (public.is_crm_member());

drop policy if exists "leads_insert_crm_members" on public.leads;
create policy "leads_insert_crm_members"
  on public.leads for insert
  to authenticated
  with check (public.is_crm_member());

drop policy if exists "leads_update_crm_members" on public.leads;
create policy "leads_update_crm_members"
  on public.leads for update
  to authenticated
  using (public.is_crm_member())
  with check (public.is_crm_member());
*/

-- Re-apply delete policy from leads-import-batch.sql if you use CSV batch delete.

select 1 as security_optional_allowlist_ready;
