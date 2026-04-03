-- If team day notes "save" but nothing persists, RLS on UPDATE may be missing WITH CHECK.
-- Run in Supabase SQL editor after team-calendar-day-notes.sql.

drop policy if exists "team_calendar_day_notes_update" on public.team_calendar_day_notes;

create policy "team_calendar_day_notes_update"
  on public.team_calendar_day_notes for update
  to authenticated
  using (true)
  with check (true);
