-- Job demo & proof: pin a library photo URL on a lead, track send state, customer-facing share page.
-- Run in Supabase SQL Editor after your base `leads` table exists.
-- Requires: gen_random_uuid() (pgcrypto — default on Supabase).

alter table public.leads
  add column if not exists selected_demo_url text,
  add column if not exists demo_sent_status boolean not null default false,
  add column if not exists demo_sent_at timestamptz,
  add column if not exists demo_share_token uuid;

-- One-time fill for existing rows, then enforce NOT NULL + default for new rows
update public.leads
set demo_share_token = gen_random_uuid()
where demo_share_token is null;

alter table public.leads
  alter column demo_share_token set default gen_random_uuid();

-- Unique share links (customer page resolves by token)
create unique index if not exists leads_demo_share_token_uidx on public.leads (demo_share_token);

-- Central proof library (URLs — e.g. Supabase Storage public URLs or external CDN)
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Job photo',
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_photos_sort_idx on public.job_photos (sort_order, created_at desc);

alter table public.job_photos enable row level security;

create policy "job_photos_select_authenticated"
  on public.job_photos for select
  to authenticated
  using (true);

create policy "job_photos_insert_authenticated"
  on public.job_photos for insert
  to authenticated
  with check (true);

create policy "job_photos_update_authenticated"
  on public.job_photos for update
  to authenticated
  using (true)
  with check (true);

create policy "job_photos_delete_authenticated"
  on public.job_photos for delete
  to authenticated
  using (true);

-- Optional seed (remove or edit)
-- insert into public.job_photos (title, url, sort_order) values
--   ('Sample roof', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200', 0);
