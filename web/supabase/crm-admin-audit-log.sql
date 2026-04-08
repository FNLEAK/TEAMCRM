-- Owner-only CRM audit trail (Admin Logs page). Run after team-roles.sql + crm-engine.sql + leads-import-batch.sql
-- so `leads` has expected columns. Then enable Realtime optional.
--
-- Logs: lead create/update/delete, timeline notes, close-deal requests (if closed_deals exists).

create table if not exists public.crm_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  lead_id uuid,
  company_name text,
  details jsonb not null default '{}'::jsonb,
  constraint crm_admin_audit_log_action_check check (
    action in (
      'lead_created',
      'lead_updated',
      'lead_deleted',
      'note_added',
      'deal_request'
    )
  )
);

create index if not exists crm_admin_audit_log_created_at_idx
  on public.crm_admin_audit_log (created_at desc);

create index if not exists crm_admin_audit_log_actor_idx
  on public.crm_admin_audit_log (actor_id);

alter table public.crm_admin_audit_log enable row level security;

drop policy if exists "crm_admin_audit_log_select_owner" on public.crm_admin_audit_log;
create policy "crm_admin_audit_log_select_owner"
  on public.crm_admin_audit_log
  for select
  to authenticated
  using (
    public.is_current_user_team_owner()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'teamwebfriendly@gmail.com'
  );

-- No insert/update/delete for authenticated — rows come from triggers (SECURITY DEFINER) only.
revoke insert, update, delete on public.crm_admin_audit_log from authenticated;

comment on table public.crm_admin_audit_log is 'CRM audit trail for owners — populated by triggers on leads / lead_activity / closed_deals.';

-- —— Leads ——

create or replace function public.crm_log_leads_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  diff jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.crm_admin_audit_log (actor_id, action, lead_id, company_name, details)
    values (
      uid,
      'lead_created',
      new.id,
      new.company_name,
      jsonb_build_object('status', new.status, 'import_filename', new.import_filename)
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.crm_admin_audit_log (actor_id, action, lead_id, company_name, details)
    values (
      uid,
      'lead_deleted',
      old.id,
      old.company_name,
      jsonb_build_object('status', old.status, 'claimed_by', old.claimed_by)
    );
    return old;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      diff := diff || jsonb_build_object(
        'status',
        jsonb_build_object('from', old.status, 'to', new.status)
      );
    end if;
    if old.claimed_by is distinct from new.claimed_by then
      diff := diff || jsonb_build_object(
        'claimed_by',
        jsonb_build_object('from', old.claimed_by, 'to', new.claimed_by)
      );
    end if;
    if old.appt_date is distinct from new.appt_date then
      diff := diff || jsonb_build_object(
        'appt_date',
        jsonb_build_object('from', old.appt_date, 'to', new.appt_date)
      );
    end if;
    if old.company_name is distinct from new.company_name then
      diff := diff || jsonb_build_object(
        'company_name',
        jsonb_build_object('from', old.company_name, 'to', new.company_name)
      );
    end if;
    if old.phone is distinct from new.phone then
      diff := diff || jsonb_build_object(
        'phone',
        jsonb_build_object('from', old.phone, 'to', new.phone)
      );
    end if;
    if old.website is distinct from new.website then
      diff := diff || jsonb_build_object(
        'website',
        jsonb_build_object('from', old.website, 'to', new.website)
      );
    end if;
    if old.appt_scheduled_by is distinct from new.appt_scheduled_by then
      diff := diff || jsonb_build_object(
        'appt_scheduled_by',
        jsonb_build_object('from', old.appt_scheduled_by, 'to', new.appt_scheduled_by)
      );
    end if;
    if old.import_batch_id is distinct from new.import_batch_id then
      diff := diff || jsonb_build_object(
        'import_batch_id',
        jsonb_build_object('from', old.import_batch_id, 'to', new.import_batch_id)
      );
    end if;
    if old.import_filename is distinct from new.import_filename then
      diff := diff || jsonb_build_object(
        'import_filename',
        jsonb_build_object('from', old.import_filename, 'to', new.import_filename)
      );
    end if;
    if diff = '{}'::jsonb then
      return new;
    end if;
    insert into public.crm_admin_audit_log (actor_id, action, lead_id, company_name, details)
    values (uid, 'lead_updated', new.id, new.company_name, diff);
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists crm_audit_leads_ins on public.leads;
create trigger crm_audit_leads_ins
  after insert on public.leads
  for each row execute function public.crm_log_leads_audit();

drop trigger if exists crm_audit_leads_upd on public.leads;
create trigger crm_audit_leads_upd
  after update on public.leads
  for each row execute function public.crm_log_leads_audit();

drop trigger if exists crm_audit_leads_del on public.leads;
create trigger crm_audit_leads_del
  after delete on public.leads
  for each row execute function public.crm_log_leads_audit();

-- —— Timeline notes ——

create or replace function public.crm_log_note_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  co text;
begin
  select l.company_name into co from public.leads l where l.id = new.lead_id;
  insert into public.crm_admin_audit_log (actor_id, action, lead_id, company_name, details)
  values (
    uid,
    'note_added',
    new.lead_id,
    co,
    jsonb_build_object('preview', left(new.body, 160))
  );
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'lead_activity'
  ) then
    execute 'drop trigger if exists crm_audit_lead_activity_ins on public.lead_activity';
    execute 'create trigger crm_audit_lead_activity_ins
      after insert on public.lead_activity
      for each row execute function public.crm_log_note_activity()';
  end if;
end $$;

-- —— Close deal requests ——

create or replace function public.crm_log_closed_deal_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  co text;
begin
  select l.company_name into co from public.leads l where l.id = new.lead_id;
  insert into public.crm_admin_audit_log (actor_id, action, lead_id, company_name, details)
  values (
    uid,
    'deal_request',
    new.lead_id,
    co,
    jsonb_build_object(
      'amount', new.amount,
      'approval_status', new.approval_status,
      'closed_deal_id', new.id
    )
  );
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'closed_deals'
  ) then
    execute 'drop trigger if exists crm_audit_closed_deals_ins on public.closed_deals';
    execute 'create trigger crm_audit_closed_deals_ins
      after insert on public.closed_deals
      for each row execute function public.crm_log_closed_deal_ins()';
  end if;
end $$;
