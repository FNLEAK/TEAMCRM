-- =============================================================================
-- Optional: enforce owner approval (pair with NEXT_PUBLIC_REQUIRE_OWNER_APPROVAL=true)
-- =============================================================================
-- The app stops auto-inserting a `team` row on login when the env flag is set.
-- Without this change, users could still bypass the waiting room by inserting
-- their own `team_roles` row (policy `team_roles_insert_self_team`).
--
-- Run once in Supabase SQL Editor after enabling the approval gate in Vercel.
-- =============================================================================

drop policy if exists "team_roles_insert_self_team" on public.team_roles;

select 1 as team_roles_self_insert_removed;
