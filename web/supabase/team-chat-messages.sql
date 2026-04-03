-- Team Chat persistence: shared team room + announcements + direct messages.
-- Run this in the Supabase SQL editor (same project as `leads` / `profiles`).
--
-- After running: Database → Replication → enable Realtime for:
--   team_room_messages, dm_conversations (optional), dm_messages, dm_participant_state
-- Or run the ALTER PUBLICATION block at the bottom (may error if already added — safe to ignore).

-- ---------------------------------------------------------------------------
-- Team-wide channels (rows are individual messages)
-- ---------------------------------------------------------------------------
create table if not exists public.team_room_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('team_chat', 'announcements')),
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  reply_to jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_room_messages_channel_created_at_idx
  on public.team_room_messages (channel, created_at);

alter table public.team_room_messages enable row level security;

drop policy if exists "team_room_messages_select_authenticated" on public.team_room_messages;
create policy "team_room_messages_select_authenticated"
  on public.team_room_messages for select
  to authenticated
  using (true);

drop policy if exists "team_room_messages_insert_own_author" on public.team_room_messages;
create policy "team_room_messages_insert_own_author"
  on public.team_room_messages for insert
  to authenticated
  with check (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Direct messages: one row per pair of users (ordered UUIDs)
-- ---------------------------------------------------------------------------
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint dm_conversations_ordered check (user_a < user_b),
  constraint dm_conversations_pair unique (user_a, user_b)
);

alter table public.dm_conversations enable row level security;

drop policy if exists "dm_conversations_select_participant" on public.dm_conversations;
create policy "dm_conversations_select_participant"
  on public.dm_conversations for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Owner access: team_roles.role = 'owner' OR bootstrap owner email (must match web/src/lib/ownerRoleGate.ts OWNER_EMAIL).
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

drop policy if exists "dm_conversations_insert_participant" on public.dm_conversations;
create policy "dm_conversations_insert_participant"
  on public.dm_conversations for insert
  to authenticated
  with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and user_a < user_b
  );

-- ---------------------------------------------------------------------------
-- DM messages
-- ---------------------------------------------------------------------------
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  reply_to jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_conversation_created_at_idx
  on public.dm_messages (conversation_id, created_at);

alter table public.dm_messages enable row level security;

drop policy if exists "dm_messages_select_if_participant" on public.dm_messages;
create policy "dm_messages_select_if_participant"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
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

drop policy if exists "dm_messages_insert_if_participant" on public.dm_messages;
create policy "dm_messages_insert_if_participant"
  on public.dm_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Owners can post into any DM thread (Owner DM Command Panel). Requires public.team_roles (team-roles.sql).
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

-- ---------------------------------------------------------------------------
-- Per-user read cursor (unread counts survive logout)
-- ---------------------------------------------------------------------------
create table if not exists public.dm_participant_state (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.dm_participant_state enable row level security;

drop policy if exists "dm_participant_state_select_own" on public.dm_participant_state;
create policy "dm_participant_state_select_own"
  on public.dm_participant_state for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

drop policy if exists "dm_participant_state_insert_own" on public.dm_participant_state;
create policy "dm_participant_state_insert_own"
  on public.dm_participant_state for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

drop policy if exists "dm_participant_state_update_own" on public.dm_participant_state;
create policy "dm_participant_state_update_own"
  on public.dm_participant_state for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime (Supabase): broadcast inserts to subscribed clients
-- Safe to re-run: skips if the table is already in the publication (avoids 42710).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_room_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_room_messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
END $$;
