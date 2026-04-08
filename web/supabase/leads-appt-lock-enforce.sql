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
declare
  old_row jsonb;
  new_row jsonb;
  sans_demo jsonb;
  sans_demo_new jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if coalesce(trim(new.status), '') = 'Appt Set'
     and new.appt_scheduled_by is not null
     and auth.uid() is distinct from new.appt_scheduled_by
     and not public.can_edit_appt_locked_lead()
  then
    old_row := to_jsonb(old::public.leads);
    new_row := to_jsonb(new::public.leads);
    sans_demo :=
        old_row
        - 'demo_site_url'
        - 'demo_site_sent'
        - 'demo_site_sent_at';
    sans_demo_new :=
        new_row
        - 'demo_site_url'
        - 'demo_site_sent'
        - 'demo_site_sent_at';
    if sans_demo is distinct from sans_demo_new then
      raise exception 'Lead is appointment-locked by another teammate.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_enforce_appt_lock_bu on public.leads;
create trigger leads_enforce_appt_lock_bu
  before update on public.leads
  for each row
  execute function public.leads_enforce_appt_lock();
