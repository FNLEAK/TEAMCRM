-- Optional: team display names for star initials + drawer labels.
-- Run in Supabase SQL editor after enabling RLS policies you trust.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  full_name text,
  avatar_initials text,
  updated_at timestamptz default now()
);

-- If the table already existed without first_name:
alter table public.profiles add column if not exists first_name text;

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Leads: who claimed the row (pair with status = 'Claimed' in the app)
alter table public.leads
  add column if not exists claimed_by uuid references auth.users (id);

create index if not exists leads_claimed_by_idx on public.leads (claimed_by);

-- Realtime: Supabase Dashboard → Database → Publications → supabase_realtime → add table `leads`
-- (Running `alter publication supabase_realtime add table public.leads` in SQL also works once.)
