-- Enforce appointment lock at DB level:
-- when a lead is `Appt Set` and `appt_scheduled_by` is someone else,
-- block UPDATEs by non-owners.
--
-- This protects against non-UI updates too (API, SQL clients, stale browser code).

create or replace function public.can_edit_appt_locked_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_roles tr
    where tr.user_id = auth.uid() and tr.role = 'owner'
  );
$$;

revoke all on function public.can_edit_appt_locked_lead() from public;
grant execute on function public.can_edit_appt_locked_lead() to authenticated;

create or replace function public.leads_enforce_appt_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(trim(new.status), '') = 'Appt Set'
     and new.appt_scheduled_by is not null
     and auth.uid() is distinct from new.appt_scheduled_by
     and not public.can_edit_appt_locked_lead()
  then
    raise exception 'Lead is appointment-locked by another teammate.';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_enforce_appt_lock_bu on public.leads;
create trigger leads_enforce_appt_lock_bu
  before update on public.leads
  for each row
  execute function public.leads_enforce_appt_lock();
