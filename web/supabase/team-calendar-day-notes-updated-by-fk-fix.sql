-- Fix: `updated_by` must reference the same table your app uses.
-- Error: violates foreign key constraint "team_calendar_day_notes_updated_by_fkey" — Key (updated_by)=(…) is not present in table "profiles".
--
-- The CRM sends `auth.users.id` in `updated_by`. If your FK points at `public.profiles(id)`, every user needs a
-- `profiles` row OR you should reference `auth.users` like this script.
--
-- Run once in Supabase SQL Editor (safe to re-run after inspecting constraint names).

alter table public.team_calendar_day_notes
  drop constraint if exists team_calendar_day_notes_updated_by_fkey;

alter table public.team_calendar_day_notes
  add constraint team_calendar_day_notes_updated_by_fkey
  foreign key (updated_by) references auth.users (id) on delete set null;
