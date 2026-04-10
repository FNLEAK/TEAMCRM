-- Restrict INSERT on announcements channel to workspace owners (matches web `canPostAnnouncements` / `canManageRoles`).
-- Team chat channel remains open to all authenticated members with author_id = auth.uid().
-- Run in Supabase SQL editor after `team-chat-messages.sql`.
-- Bootstrap email must match `web/src/lib/ownerRoleGate.ts` (default teamwebfriendly@gmail.com).
-- If you set NEXT_PUBLIC_OWNER_EMAIL on Vercel, replace the literal below to match or rely only on team_roles.role = 'owner'.

drop policy if exists "team_room_messages_insert_own_author" on public.team_room_messages;

create policy "team_room_messages_insert_team_chat"
  on public.team_room_messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and channel = 'team_chat'
  );

create policy "team_room_messages_insert_announcements_owner"
  on public.team_room_messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and channel = 'announcements'
    and (
      exists (
        select 1 from public.team_roles tr
        where tr.user_id = auth.uid() and tr.role = 'owner'
      )
      or lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'teamwebfriendly@gmail.com'
    )
  );
