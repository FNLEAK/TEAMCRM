-- Owner-only role assignment table for UI page `/role-applier`
-- Run this in Supabase SQL Editor.

create table if not exists public.team_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'team')),
  account_name text,
  account_email text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table public.team_roles add column if not exists account_name text;
alter table public.team_roles add column if not exists account_email text;

alter table public.team_roles enable row level security;

-- SECURITY DEFINER: reads team_roles without RLS recursion when evaluating policies below.
create or replace function public.is_current_user_team_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_roles tr
    where tr.user_id = auth.uid() and tr.role = 'owner'
  );
$$;

revoke all on function public.is_current_user_team_owner() from public;
grant execute on function public.is_current_user_team_owner() to authenticated;

-- Any authenticated user can read team role labels.
drop policy if exists "team_roles_select_authenticated" on public.team_roles;
create policy "team_roles_select_authenticated"
  on public.team_roles
  for select
  to authenticated
  using (true);

-- Owners (row with role = owner) can manage all role rows. Optional legacy email for first bootstrap.
-- Change the email string to your real owner account, or remove the OR clause after your owner row exists.
drop policy if exists "team_roles_owner_write" on public.team_roles;
create policy "team_roles_owner_write"
  on public.team_roles
  for all
  to authenticated
  using (
    public.is_current_user_team_owner()
    or lower(coalesce(auth.jwt()->>'email', '')) = 'teamwebfriendly@gmail.com'
  )
  with check (
    public.is_current_user_team_owner()
    or lower(coalesce(auth.jwt()->>'email', '')) = 'teamwebfriendly@gmail.com'
  );

-- Allow each authenticated user to auto-register their own default `team` role row on first login.
drop policy if exists "team_roles_insert_self_team" on public.team_roles;
create policy "team_roles_insert_self_team"
  on public.team_roles
  for insert
  to authenticated
  with check (auth.uid() = user_id and role = 'team');

-- Let users keep their own display info fresh without changing role.
drop policy if exists "team_roles_update_self_contact" on public.team_roles;
create policy "team_roles_update_self_contact"
  on public.team_roles
  for update
  to authenticated
  using (auth.uid() = user_id and role = 'team')
  with check (auth.uid() = user_id and role = 'team');
