create table if not exists public.closed_deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  notes text null,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.closed_deals enable row level security;

drop policy if exists closed_deals_select_authenticated on public.closed_deals;
create policy closed_deals_select_authenticated
on public.closed_deals
for select
to authenticated
using (true);

drop policy if exists closed_deals_insert_authenticated on public.closed_deals;
create policy closed_deals_insert_authenticated
on public.closed_deals
for insert
to authenticated
with check (
  auth.uid() = requested_by
  and approval_status = 'pending'
);

drop policy if exists closed_deals_owner_update on public.closed_deals;
create policy closed_deals_owner_update
on public.closed_deals
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

