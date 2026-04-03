import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/profileSelect";
import { PROFILE_COLUMNS_FULL, isMissingColumnError } from "@/lib/profileSelect";

export type TeamRoomChannel = "team_chat" | "announcements";

export type TeamRoomMessageRow = {
  id: string;
  channel: TeamRoomChannel;
  author_id: string;
  body: string;
  reply_to: { from?: string; text?: string } | null;
  created_at: string;
};

export type DmMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to: { from?: string; text?: string } | null;
  created_at: string;
};

export type UiChatMessage = {
  dbId?: string;
  from: string;
  text: string;
  time: string;
  replyTo: { from: string; text: string } | null;
  attachments?: undefined;
};

export type UiDmConversation = {
  id: string;
  topic: string;
  preview: string;
  time: string;
  unread: number;
  participants: string[];
  otherUserId: string;
  profile: { role: string; status: "Active now" | "Away" | "Offline"; initials: string };
  messages: UiChatMessage[];
};

export function isTeamChatSchemaError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("team_room_messages") ||
    m.includes("dm_conversations") ||
    m.includes("dm_messages") ||
    m.includes("dm_participant_state") ||
    m.includes("42p01") ||
    m.includes("pgrst205")
  );
}

export function profileDisplayName(p: Pick<ProfileRow, "first_name" | "full_name">): string {
  const full = p.full_name?.trim();
  const first = p.first_name?.trim();
  return full || first || "Teammate";
}

/** Prefer `team_roles.account_name` when profile has no real name (avoids "Teammate" for everyone). */
function applyTeamRoleNamesToMaps(
  profiles: ProfileRow[],
  teamRoles: Array<{ user_id: string; account_name: string | null }>,
  nameById: Map<string, string>,
  initialsById: Map<string, string>,
) {
  for (const r of teamRoles) {
    const id = r.user_id;
    const acc = typeof r.account_name === "string" ? r.account_name.trim() : "";
    if (!acc) continue;
    const cur = nameById.get(id);
    const weak = !cur || cur.trim() === "" || cur === "Teammate";
    if (!weak) continue;
    nameById.set(id, acc);
    const p = profiles.find((x) => x.id === id);
    const ini = p?.avatar_initials?.trim();
    if (ini) {
      initialsById.set(id, ini.slice(0, 3).toUpperCase());
    } else {
      initialsById.set(id, acc.length >= 2 ? acc.slice(0, 2).toUpperCase() : acc.toUpperCase());
    }
  }
}

export function formatClockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatRelativeShort(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 45_000) return "now";
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

function normalizeReplyTo(raw: unknown): { from: string; text: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const from = typeof o.from === "string" ? o.from : "";
  const text = typeof o.text === "string" ? o.text : "";
  if (!from && !text) return null;
  return { from: from || "Unknown", text: text || "" };
}

export function mapTeamRowsToUi(rows: TeamRoomMessageRow[], nameById: Map<string, string>, selfId: string, selfName: string): UiChatMessage[] {
  return rows.map((r) => {
    const from =
      r.author_id === selfId ? selfName : nameById.get(r.author_id) ?? "Teammate";
    return {
      dbId: r.id,
      from,
      text: r.body,
      time: formatClockTime(r.created_at),
      replyTo: normalizeReplyTo(r.reply_to),
    };
  });
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getOrCreateDmConversationId(
  supabase: SupabaseClient,
  userId: string,
  peerId: string,
): Promise<{ id: string; error: Error | null }> {
  const [user_a, user_b] = orderedPair(userId, peerId);
  const { data: existing } = await supabase.from("dm_conversations").select("id").eq("user_a", user_a).eq("user_b", user_b).maybeSingle();
  if (existing && typeof (existing as { id?: string }).id === "string") {
    return { id: (existing as { id: string }).id, error: null };
  }
  const ins = await supabase.from("dm_conversations").insert({ user_a, user_b }).select("id").single();
  if (!ins.error && ins.data && typeof (ins.data as { id?: string }).id === "string") {
    return { id: (ins.data as { id: string }).id, error: null };
  }
  const { data: again } = await supabase.from("dm_conversations").select("id").eq("user_a", user_a).eq("user_b", user_b).maybeSingle();
  if (again && typeof (again as { id?: string }).id === "string") {
    return { id: (again as { id: string }).id, error: null };
  }
  return { id: "", error: new Error(ins.error?.message ?? "Could not open DM conversation") };
}

export async function fetchTeamRoomMessages(supabase: SupabaseClient, channel: TeamRoomChannel) {
  return supabase
    .from("team_room_messages")
    .select("id, channel, author_id, body, reply_to, created_at")
    .eq("channel", channel)
    .order("created_at", { ascending: true })
    .limit(500);
}

export async function insertTeamRoomMessage(
  supabase: SupabaseClient,
  channel: TeamRoomChannel,
  authorId: string,
  body: string,
  replyTo: { from: string; text: string } | null,
) {
  return supabase
    .from("team_room_messages")
    .insert({
      channel,
      author_id: authorId,
      body,
      reply_to: replyTo,
    })
    .select("id, channel, author_id, body, reply_to, created_at")
    .single();
}

export async function insertDmMessage(
  supabase: SupabaseClient,
  conversationId: string,
  senderId: string,
  body: string,
  replyTo: { from: string; text: string } | null,
) {
  return supabase
    .from("dm_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body,
      reply_to: replyTo,
    })
    .select("id, conversation_id, sender_id, body, reply_to, created_at")
    .single();
}

export async function markDmConversationRead(supabase: SupabaseClient, conversationId: string, userId: string) {
  const iso = new Date().toISOString();
  return supabase.from("dm_participant_state").upsert(
    { conversation_id: conversationId, user_id: userId, last_read_at: iso },
    { onConflict: "conversation_id,user_id" },
  );
}

export async function fetchProfilesForChat(supabase: SupabaseClient) {
  let r = await supabase.from("profiles").select(PROFILE_COLUMNS_FULL);
  if (r.error && isMissingColumnError(r.error.message)) {
    r = await supabase.from("profiles").select("id, first_name, full_name");
  }
  return r;
}

/** Everyone who has signed in at least once should have a `team_roles` row — fills the DM picker when `profiles` is sparse. */
export async function fetchTeamRolesDirectory(supabase: SupabaseClient) {
  return supabase.from("team_roles").select("user_id, account_name");
}

export type PeerSelectOption = { value: string; label: string };

export function buildPeerOptionsFromDirectory(
  userId: string,
  profiles: ProfileRow[],
  teamRoles: Array<{ user_id: string; account_name: string | null }>,
): PeerSelectOption[] {
  const labelById = new Map<string, string>();
  for (const p of profiles) {
    if (p.id === userId) continue;
    labelById.set(p.id, profileDisplayName(p));
  }
  for (const r of teamRoles) {
    if (r.user_id === userId) continue;
    if (labelById.has(r.user_id)) continue;
    const n = typeof r.account_name === "string" ? r.account_name.trim() : "";
    labelById.set(r.user_id, n || "Teammate");
  }
  return [...labelById.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Placeholder row so the Send-to control stays clickable and explains why DMs are unavailable. */
export const NO_DM_PEER_PLACEHOLDER = "__crm_no_dm_peer__";

export async function buildDmConversations(
  supabase: SupabaseClient,
  userId: string,
  selfDisplayName: string,
  profiles: ProfileRow[],
  options?: {
    viewAllConversationsAsOwner?: boolean;
    teamRoles?: Array<{ user_id: string; account_name: string | null }>;
  },
): Promise<{ conversations: UiDmConversation[]; error: Error | null }> {
  const nameById = new Map<string, string>();
  const initialsById = new Map<string, string>();
  for (const p of profiles) {
    nameById.set(p.id, profileDisplayName(p));
    const ini = p.avatar_initials?.trim();
    initialsById.set(
      p.id,
      ini && ini.length > 0 ? ini.slice(0, 3).toUpperCase() : profileDisplayName(p).slice(0, 2).toUpperCase() || "??",
    );
  }

  let teamRoles = options?.teamRoles;
  if (!teamRoles) {
    const r = await fetchTeamRolesDirectory(supabase);
    teamRoles = (r.data ?? []) as Array<{ user_id: string; account_name: string | null }>;
  }
  applyTeamRoleNamesToMaps(profiles, teamRoles, nameById, initialsById);

  const viewAll = Boolean(options?.viewAllConversationsAsOwner);
  const { data: convoRows, error: convoErr } = viewAll
    ? await supabase.from("dm_conversations").select("id, user_a, user_b, created_at").order("created_at", { ascending: false }).limit(400)
    : await supabase.from("dm_conversations").select("id, user_a, user_b, created_at").or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (convoErr) {
    return { conversations: [], error: new Error(convoErr.message) };
  }

  const convos = (convoRows ?? []) as Array<{ id: string; user_a: string; user_b: string; created_at: string }>;
  if (convos.length === 0) {
    return { conversations: [], error: null };
  }

  const convoIds = convos.map((c) => c.id);

  const { data: msgRows, error: msgErr } = await supabase
    .from("dm_messages")
    .select("id, conversation_id, sender_id, body, reply_to, created_at")
    .in("conversation_id", convoIds)
    .order("created_at", { ascending: true });

  if (msgErr) {
    return { conversations: [], error: new Error(msgErr.message) };
  }

  const messages = (msgRows ?? []) as DmMessageRow[];
  const byConvo = new Map<string, DmMessageRow[]>();
  for (const m of messages) {
    const list = byConvo.get(m.conversation_id) ?? [];
    list.push(m);
    byConvo.set(m.conversation_id, list);
  }

  const { data: readRows } = viewAll
    ? { data: [] as Array<{ conversation_id: string; last_read_at: string }> }
    : await supabase
        .from("dm_participant_state")
        .select("conversation_id, last_read_at")
        .eq("user_id", userId)
        .in("conversation_id", convoIds);

  const lastReadByConvo = new Map<string, string>();
  for (const r of (readRows ?? []) as Array<{ conversation_id: string; last_read_at: string }>) {
    lastReadByConvo.set(r.conversation_id, r.last_read_at);
  }

  const conversations: UiDmConversation[] = convos.map((c) => {
    const list = byConvo.get(c.id) ?? [];
    const last = list[list.length - 1];
    const lastIso = last?.created_at ?? c.created_at;
    const nameA = nameById.get(c.user_a) ?? "Teammate";
    const nameB = nameById.get(c.user_b) ?? "Teammate";

    let otherUserId: string;
    let otherName: string;
    let participants: string[];
    let unread: number;

    if (viewAll) {
      otherUserId = c.user_b;
      otherName = nameB;
      participants = nameA.localeCompare(nameB) <= 0 ? [nameA, nameB] : [nameB, nameA];
      unread = 0;
    } else {
      otherUserId = c.user_a === userId ? c.user_b : c.user_a;
      otherName = nameById.get(otherUserId) ?? "Teammate";
      participants = [selfDisplayName, otherName];
      const lastReadIso = lastReadByConvo.get(c.id) ?? "1970-01-01T00:00:00.000Z";
      const lastReadMs = new Date(lastReadIso).getTime();
      unread = 0;
      for (const m of list) {
        if (m.sender_id !== userId && new Date(m.created_at).getTime() > lastReadMs) unread += 1;
      }
    }

    const uiMessages: UiChatMessage[] = list.map((m) => {
      const from = m.sender_id === userId ? selfDisplayName : nameById.get(m.sender_id) ?? "Teammate";
      return {
        dbId: m.id,
        from,
        text: m.body,
        time: formatClockTime(m.created_at),
        replyTo: normalizeReplyTo(m.reply_to),
      };
    });
    return {
      id: c.id,
      topic: "Direct message",
      preview: last?.body ?? "No messages yet",
      time: formatRelativeShort(lastIso),
      unread,
      participants,
      otherUserId,
      profile: {
        role: "Member",
        status: "Away",
        initials: initialsById.get(otherUserId) ?? otherName.slice(0, 2).toUpperCase(),
      },
      messages: uiMessages,
    };
  });

  conversations.sort((a, b) => {
    const ta = byConvo.get(a.id)?.at(-1)?.created_at ?? "";
    const tb = byConvo.get(b.id)?.at(-1)?.created_at ?? "";
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  return { conversations, error: null };
}

export function teamMessageFromPayload(
  raw: Record<string, unknown>,
  nameById: Map<string, string>,
  selfId: string,
  selfName: string,
): UiChatMessage | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const author_id = typeof raw.author_id === "string" ? raw.author_id : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  const created_at = typeof raw.created_at === "string" ? raw.created_at : "";
  if (!id || !author_id || !created_at) return null;
  const from = author_id === selfId ? selfName : nameById.get(author_id) ?? "Teammate";
  return {
    dbId: id,
    from,
    text: body,
    time: formatClockTime(created_at),
    replyTo: normalizeReplyTo(raw.reply_to),
  };
}

export function dmMessageFromPayload(
  raw: Record<string, unknown>,
  nameById: Map<string, string>,
  selfId: string,
  selfName: string,
): DmMessageRow | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const conversation_id = typeof raw.conversation_id === "string" ? raw.conversation_id : "";
  const sender_id = typeof raw.sender_id === "string" ? raw.sender_id : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  const created_at = typeof raw.created_at === "string" ? raw.created_at : "";
  if (!id || !conversation_id || !sender_id || !created_at) return null;
  return {
    id,
    conversation_id,
    sender_id,
    body,
    reply_to: normalizeReplyTo(raw.reply_to),
    created_at,
  };
}
