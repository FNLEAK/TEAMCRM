-- Run once in Supabase SQL editor if Owner DM Command Panel stays empty for teamwebfriendly@gmail.com
-- but the app already shows owner UI. Aligns RLS with web/src/lib/ownerRoleGate.ts (OWNER_EMAIL).

drop policy if exists "dm_conversations_select_owner" on public.dm_conversations;
create policy "dm_conversations_select_owner"
  on public.dm_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.team_roles tr
      where tr.user_id = auth.uid() and tr.role = 'owner'
    )
    or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
  );

drop policy if exists "dm_messages_select_owner" on public.dm_messages;
create policy "dm_messages_select_owner"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.team_roles tr
      where tr.user_id = auth.uid() and tr.role = 'owner'
    )
    or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
  );

drop policy if exists "dm_messages_insert_owner_any_conversation" on public.dm_messages;
create policy "dm_messages_insert_owner_any_conversation"
  on public.dm_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      exists (
        select 1 from public.team_roles tr
        where tr.user_id = auth.uid() and tr.role = 'owner'
      )
      or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
    )
  );
