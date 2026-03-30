-- Point leads.appt_scheduled_by at public.profiles so PostgREST can embed:
--   scheduler_profile:profiles!leads_appt_scheduled_by_fkey(full_name, first_name, avatar_initials)
-- profiles.id should match auth.users.id (standard Supabase pattern).
--
-- If the ADD CONSTRAINT fails because some appt_scheduled_by values have no matching profile:
--   update public.leads l set appt_scheduled_by = null
--   where l.appt_scheduled_by is not null
--     and not exists (select 1 from public.profiles p where p.id = l.appt_scheduled_by);

alter table public.leads
  drop constraint if exists leads_appt_scheduled_by_fkey;

alter table public.leads
  add constraint leads_appt_scheduled_by_fkey
  foreign key (appt_scheduled_by) references public.profiles (id)
  on delete set null;
