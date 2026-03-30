-- CSV import batch tagging + optional RPC for Recent Imports list.
-- Run in Supabase SQL Editor after backup.

alter table public.leads
  add column if not exists import_batch_id uuid;

alter table public.leads
  add column if not exists import_filename text;

create index if not exists leads_import_batch_id_idx on public.leads (import_batch_id)
  where import_batch_id is not null;

comment on column public.leads.import_batch_id is 'Shared UUID for all rows from one CSV import session.';
comment on column public.leads.import_filename is 'Original CSV filename for that import batch.';

-- Allow authenticated users to delete leads (needed for “Delete batch”). Drop if you already have an equivalent policy.
drop policy if exists "leads_delete_authenticated_csv_batch" on public.leads;
create policy "leads_delete_authenticated_csv_batch"
  on public.leads for delete
  to authenticated
  using (true);

-- Aggregated list for Recent Imports (efficient vs scanning all rows in the browser).
create or replace function public.get_recent_import_batches(limit_n int default 30)
returns table (
  import_batch_id uuid,
  import_filename text,
  lead_count bigint,
  imported_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.import_batch_id,
    max(l.import_filename) as import_filename,
    count(*)::bigint as lead_count,
    min(l.created_at) as imported_at
  from public.leads l
  where l.import_batch_id is not null
  group by l.import_batch_id
  order by imported_at desc
  limit greatest(1, least(limit_n, 100));
$$;

grant execute on function public.get_recent_import_batches(int) to authenticated;
