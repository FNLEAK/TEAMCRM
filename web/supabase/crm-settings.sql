create table if not exists public.crm_settings (
  key text primary key,
  value text null,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.crm_settings enable row level security;

drop policy if exists crm_settings_select_authenticated on public.crm_settings;
create policy crm_settings_select_authenticated
on public.crm_settings
for select
to authenticated
using (true);

drop policy if exists crm_settings_owner_insert on public.crm_settings;
create policy crm_settings_owner_insert
on public.crm_settings
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'teamwebfriendly@gmail.com'
  or exists (
    select 1
    from public.team_roles tr
    where tr.user_id = auth.uid()
      and tr.role = 'owner'
  )
);

drop policy if exists crm_settings_owner_update on public.crm_settings;
create policy crm_settings_owner_update
on public.crm_settings
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'teamwebfriendly@gmail.com'
  or exists (
    select 1
    from public.team_roles tr
    where tr.user_id = auth.uid()
      and tr.role = 'owner'
  )
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'teamwebfriendly@gmail.com'
  or exists (
    select 1
    from public.team_roles tr
    where tr.user_id = auth.uid()
      and tr.role = 'owner'
  )
);

insert into public.crm_settings (key, value, updated_by, updated_at)
values ('weekly_reward', '$500 + Dinner Bonus', auth.uid(), now())
on conflict (key) do nothing;

