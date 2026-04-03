-- Star / favorite on lead list (`CrmDashboard` updates this column).
-- Default app mode: single UUID (one “primary” favorite per row in simple mode).
-- If you set NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY=true in the web app, use uuid[] instead (see comment below).

alter table public.leads
  add column if not exists favorited_by uuid references auth.users (id) on delete set null;

comment on column public.leads.favorited_by is
  'CRM star: single user id. For multi-user favorites per lead, drop this and add uuid[] (see repo comment in NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY).';

-- Multi-favorite mode ONLY (uncomment if env NEXT_PUBLIC_LEADS_FAVORITES_AS_ARRAY=true):
-- alter table public.leads drop column if exists favorited_by;
-- alter table public.leads add column favorited_by uuid[] not null default '{}';
