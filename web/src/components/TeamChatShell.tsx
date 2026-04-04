"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeskShell } from "@/components/DeskShell";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ensureSupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";
import { HelpMarker } from "@/components/HelpMarker";
import { cn } from "@/lib/utils";
import { UiSelect } from "@/components/UiSelect";
import type { ProfileRow } from "@/lib/profileSelect";
import {
  buildDmConversations,
  buildPeerOptionsFromDirectory,
  fetchProfilesForChat,
  fetchTeamRolesDirectory,
  fetchTeamRoomMessages,
  NO_DM_PEER_PLACEHOLDER,
  getOrCreateDmConversationId,
  insertDmMessage,
  insertTeamRoomMessage,
  isTeamChatSchemaError,
  mapTeamRowsToUi,
  markDmConversationRead,
  profileDisplayName,
  teamMessageFromPayload,
  type TeamRoomMessageRow,
} from "@/lib/teamChatDb";

type ChatAttachment = {
  name: string;
  url: string;
  mime: string;
  kind: "image" | "video" | "file";
};

type ReplyTarget = { from: string; text: string } | null;

type GroupChannelMessage = {
  dbId?: string;
  from: string;
  text: string;
  time: string;
  replyTo: ReplyTarget;
  attachments?: ChatAttachment[];
};

type TeamDmConversation = {
  id: string;
  topic: string;
  preview: string;
  time: string;
  unread: number;
  participants: string[];
  otherUserId: string;
  profile: { role: string; status: "Active now" | "Away" | "Offline"; initials: string };
  messages: Array<{
    dbId?: string;
    from: string;
    text: string;
    time: string;
    replyTo: ReplyTarget;
    attachments?: ChatAttachment[];
  }>;
};

const LS_TEAM_CHAT_MENTION_UNREAD = "teamChatMentionUnread";

function bumpTeamChatMentionNavUnread() {
  try {
    const raw = window.localStorage.getItem(LS_TEAM_CHAT_MENTION_UNREAD);
    const prev = Number(raw ?? "0");
    window.localStorage.setItem(
      LS_TEAM_CHAT_MENTION_UNREAD,
      String((Number.isFinite(prev) ? prev : 0) + 1),
    );
    window.dispatchEvent(new Event("team-chat-mention-unread-updated"));
  } catch {
    /* private mode */
  }
}

const MEMBER_PROFILES: Record<
  string,
  {
    role: string;
    status: "Active now" | "Away" | "Offline";
    lastSeen: string;
    avgReply: string;
    activity: string;
    readRate: string;
  }
> = {
  Jon: {
    role: "Member",
    status: "Active now",
    lastSeen: "just now",
    avgReply: "2m",
    activity: "High",
    readRate: "94%",
  },
  Mykala: {
    role: "Member",
    status: "Active now",
    lastSeen: "1m ago",
    avgReply: "3m",
    activity: "High",
    readRate: "91%",
  },
  Richard: {
    role: "Member",
    status: "Away",
    lastSeen: "12m ago",
    avgReply: "5m",
    activity: "Medium",
    readRate: "88%",
  },
  Camydn: {
    role: "Member",
    status: "Offline",
    lastSeen: "44m ago",
    avgReply: "8m",
    activity: "Medium",
    readRate: "84%",
  },
  Jaylan: {
    role: "Owner",
    status: "Active now",
    lastSeen: "just now",
    avgReply: "2m",
    activity: "High",
    readRate: "96%",
  },
};

const TEAM_THREADS = [
  {
    id: "thread-1",
    title: "Can anyone swap 2:30 today?",
    body: "I am working later now and cannot call until 4:30. Need someone to cover this slot.",
    author: "Jon",
    tag: "Schedule swap",
    tone: "from-amber-500/26 to-orange-500/18 border-amber-300/30",
    age: "5m ago",
    claimedBy: "",
    replies: ["Looking now - if nobody grabs it in 10 I will."],
    profile: { role: "Member", status: "Active now", initials: "JO" },
  },
  {
    id: "thread-2",
    title: "Need call opener feedback",
    body: "Posted a new opener in chat. Looking for two quick edits before next call block.",
    author: "Mykala",
    tag: "Coaching",
    tone: "from-cyan-500/24 to-violet-500/18 border-cyan-300/30",
    age: "18m ago",
    claimedBy: "",
    replies: [],
    profile: { role: "Member", status: "Active now", initials: "MY" },
  },
  {
    id: "thread-3",
    title: "Quote comparison ready",
    body: "One-time vs monthly summary is done. Drop me a client name and I can tailor it fast.",
    author: "Richard",
    tag: "Pricing",
    tone: "from-emerald-500/24 to-cyan-500/16 border-emerald-300/30",
    age: "33m ago",
    claimedBy: "",
    replies: [],
    profile: { role: "Member", status: "Away", initials: "RI" },
  },
];

const ISSUE_NOTES_DEMO = [
  {
    id: "issue-1",
    author: "Mykala",
    text: "Lead table search freezes for 2-3 seconds after typing fast.",
    status: "Open",
    time: "9:14 AM",
    replies: [{ author: "Jaylan", text: "Thanks, I can reproduce this. Working on a fix.", time: "9:19 AM" }],
  },
  {
    id: "issue-2",
    author: "Richard",
    text: "Team Chat unread badge stayed after opening a thread.",
    status: "Reviewing",
    time: "9:22 AM",
    replies: [],
  },
];

export function TeamChatShell({
  userId,
  userDisplayName,
  canManageRoles,
}: {
  userId: string;
  userDisplayName: string;
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [leftTab, setLeftTab] = useState<"inbox" | "threads">("inbox");
  const [conversations, setConversations] = useState<TeamDmConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const activeConversationIdRef = useRef("");
  const [centerMode, setCenterMode] = useState<"dm" | "group" | "issues">("dm");
  const [peerOptions, setPeerOptions] = useState<{ value: string; label: string }[]>([]);
  const [newMessagePeerId, setNewMessagePeerId] = useState("");
  const [newMessageBody, setNewMessageBody] = useState("");
  const [threads, setThreads] = useState(TEAM_THREADS);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [threadReplyDraft, setThreadReplyDraft] = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const [groupMessages, setGroupMessages] = useState<GroupChannelMessage[]>([]);
  const [announcementMessages, setAnnouncementMessages] = useState<GroupChannelMessage[]>([]);
  const [chatSchemaError, setChatSchemaError] = useState<string | null>(null);
  const [ownerPanelConversations, setOwnerPanelConversations] = useState<TeamDmConversation[]>([]);
  const nameByIdRef = useRef<Map<string, string>>(new Map());
  const [groupChannel, setGroupChannel] = useState<"announcements" | "chat">("chat");
  const [announcementPings, setAnnouncementPings] = useState(0);
  const [dmReplyTarget, setDmReplyTarget] = useState<ReplyTarget>(null);
  const [groupReplyTarget, setGroupReplyTarget] = useState<ReplyTarget>(null);
  const [dmAttachments, setDmAttachments] = useState<ChatAttachment[]>([]);
  const [groupAttachments, setGroupAttachments] = useState<ChatAttachment[]>([]);
  const [issueNotes, setIssueNotes] = useState(ISSUE_NOTES_DEMO);
  const [issueDraft, setIssueDraft] = useState("");
  const [issueReplyDrafts, setIssueReplyDrafts] = useState<Record<string, string>>({});
  const dmScrollRef = useRef<HTMLDivElement | null>(null);
  const groupScrollRef = useRef<HTMLDivElement | null>(null);
  /** On mobile, group/issues render in row 2 below a tall inbox; scroll into view after mode change. */
  const teamChatCenterRef = useRef<HTMLDivElement | null>(null);
  const dmFileInputRef = useRef<HTMLInputElement | null>(null);
  const groupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [ownerActiveConversationId, setOwnerActiveConversationId] = useState("");
  const [ownerReplyDraft, setOwnerReplyDraft] = useState("");
  const [liveProfileStats, setLiveProfileStats] = useState<
    Record<
      string,
      {
        status: "Active now" | "Away" | "Offline";
        lastSeen: string;
        activity: string;
      }
    >
  >({});

  const refreshDmsRef = useRef<(() => void) | null>(null);
  const centerModeRef = useRef(centerMode);
  const groupChannelRef = useRef(groupChannel);
  useEffect(() => {
    centerModeRef.current = centerMode;
  }, [centerMode]);
  useEffect(() => {
    groupChannelRef.current = groupChannel;
  }, [groupChannel]);

  useEffect(() => {
    if (centerMode !== "group" && centerMode !== "issues") return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 960px)").matches) return;
    const id = window.setTimeout(() => {
      teamChatCenterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [centerMode]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;
  const ownerActiveConversation =
    ownerPanelConversations.find((c) => c.id === ownerActiveConversationId) ?? ownerPanelConversations[0] ?? null;
  const displayedConversations = useMemo(
    () =>
      canManageRoles
        ? conversations
        : conversations.filter((c) =>
            c.participants.some((p) => p.toLowerCase() === userDisplayName.toLowerCase()),
          ),
    [canManageRoles, conversations, userDisplayName],
  );
  const getCounterpartyName = (participants: string[]) =>
    participants.find((p) => p.toLowerCase() !== userDisplayName.toLowerCase()) ?? participants[0] ?? "Teammate";
  const dmSendToOptions =
    peerOptions.length > 0
      ? peerOptions
      : [
          {
            value: NO_DM_PEER_PLACEHOLDER,
            label: "No other teammates yet — have them sign in once to appear here",
            disabled: true,
          },
        ];
  /** Keeps the visible selection and send target in sync when the first peer loads before state updates. */
  const resolvedDmPeerId = useMemo(() => {
    if (peerOptions.length === 0) return NO_DM_PEER_PLACEHOLDER;
    if (peerOptions.some((o) => o.value === newMessagePeerId)) return newMessagePeerId;
    return peerOptions[0].value;
  }, [peerOptions, newMessagePeerId]);
  const newMessagePeerLabel =
    peerOptions.find((o) => o.value === resolvedDmPeerId)?.label ??
    (resolvedDmPeerId === NO_DM_PEER_PLACEHOLDER ? "No teammate selected" : "Teammate");

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  /** Persist read cursor before realtime refresh runs, so refreshDmList does not restore stale unread counts. */
  useEffect(() => {
    if (!activeConversationId || centerMode !== "dm") return;
    const convId = activeConversationId;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    void (async () => {
      const { error } = await markDmConversationRead(supabase, convId, userId);
      if (cancelled) return;
      if (!error) {
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
      }
      refreshDmsRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, centerMode, userId]);

  useEffect(() => {
    if (!canManageRoles || ownerPanelConversations.length === 0) return;
    setOwnerActiveConversationId((prev) => prev || ownerPanelConversations[0].id);
  }, [canManageRoles, ownerPanelConversations]);
  const activeGroupMessages = groupChannel === "announcements" ? announcementMessages : groupMessages;
  const toAttachments = (files: FileList | File[]): ChatAttachment[] =>
    Array.from(files)
      .slice(0, 6)
      .map((file) => {
        const mime = file.type || "application/octet-stream";
        const kind: ChatAttachment["kind"] = mime.startsWith("image/")
          ? "image"
          : mime.startsWith("video/")
            ? "video"
            : "file";
        return { name: file.name || kind, url: URL.createObjectURL(file), mime, kind };
      });

  const renderTextWithLinks = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) =>
      /^https?:\/\//i.test(part) ? (
        <a
          key={`${part}-${idx}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-cyan-300/55 underline-offset-2 hover:text-cyan-200"
        >
          {part}
        </a>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      ),
    );
  };

  useEffect(() => {
    if (centerMode !== "group") return;
    const el = groupScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [centerMode, groupChannel, groupMessages, announcementMessages]);

  useEffect(() => {
    if (centerMode !== "dm" || !activeConversation) return;
    const el = dmScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [centerMode, activeConversationId, conversations, activeConversation]);

  useEffect(() => {
    setDmReplyTarget(null);
  }, [activeConversationId, centerMode]);

  useEffect(() => {
    setGroupReplyTarget(null);
  }, [groupChannel, centerMode]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    const reloadDmList = async (
      rows: ProfileRow[],
      teamRolesArg?: Array<{ user_id: string; account_name: string | null }>,
    ) => {
      const shared = teamRolesArg ? { teamRoles: teamRolesArg } : {};
      const dm = await buildDmConversations(supabase, userId, userDisplayName, rows, shared);
      if (cancelled) return;
      if (dm.error) {
        return;
      }
      setConversations(dm.conversations);
      if (canManageRoles) {
        const all = await buildDmConversations(supabase, userId, userDisplayName, rows, {
          viewAllConversationsAsOwner: true,
          ...shared,
        });
        if (!cancelled && !all.error) setOwnerPanelConversations(all.conversations);
      } else {
        setOwnerPanelConversations([]);
      }
    };

    (async () => {
      setChatSchemaError(null);
      const prof = await fetchProfilesForChat(supabase);
      if (cancelled) return;
      if (prof.error) {
        setChatSchemaError(prof.error.message);
        return;
      }
      const rows = (prof.data ?? []) as ProfileRow[];
      const nameById = new Map<string, string>();
      for (const p of rows) nameById.set(p.id, profileDisplayName(p));
      nameByIdRef.current = nameById;

      const rolesRes = await fetchTeamRolesDirectory(supabase);
      const roleRows = (rolesRes.data ?? []) as Array<{ user_id: string; account_name: string | null }>;
      const peers = buildPeerOptionsFromDirectory(userId, rows, roleRows);
      setPeerOptions(peers);
      setNewMessagePeerId((prev) =>
        prev && peers.some((x) => x.value === prev) ? prev : peers[0]?.value ?? NO_DM_PEER_PLACEHOLDER,
      );

      const team = await fetchTeamRoomMessages(supabase, "team_chat");
      const ann = await fetchTeamRoomMessages(supabase, "announcements");
      if (cancelled) return;

      if (team.error && isTeamChatSchemaError(team.error.message)) {
        setChatSchemaError(
          "Team chat tables are missing. Open Supabase → SQL and run the script web/supabase/team-chat-messages.sql, then enable Realtime on team_room_messages and dm_messages.",
        );
        return;
      }

      if (!team.error && team.data) {
        setGroupMessages(
          mapTeamRowsToUi(team.data as TeamRoomMessageRow[], nameById, userId, userDisplayName).map((m) => ({
            ...m,
            replyTo: m.replyTo,
          })),
        );
      }
      if (!ann.error && ann.data) {
        setAnnouncementMessages(
          mapTeamRowsToUi(ann.data as TeamRoomMessageRow[], nameById, userId, userDisplayName).map((m) => ({
            ...m,
            replyTo: m.replyTo,
          })),
        );
      }

      await reloadDmList(rows, roleRows);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, userDisplayName, canManageRoles]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const sub: { ch: ReturnType<typeof supabase.channel> | null } = { ch: null };

    const refreshDms = async () => {
      if (cancelled) return;
      const prof = await fetchProfilesForChat(supabase);
      if (cancelled || prof.error) return;
      const rows = (prof.data ?? []) as ProfileRow[];
      const dm = await buildDmConversations(supabase, userId, userDisplayName, rows);
      if (cancelled) return;
      if (dm.error) return;
      setConversations(dm.conversations);
      if (canManageRoles) {
        const all = await buildDmConversations(supabase, userId, userDisplayName, rows, {
          viewAllConversationsAsOwner: true,
        });
        if (!cancelled && !all.error) setOwnerPanelConversations(all.conversations);
      }
    };

    refreshDmsRef.current = () => {
      void refreshDms();
    };

    let dmRefreshDebounce: number | null = null;
    const scheduleDmRefresh = () => {
      if (dmRefreshDebounce != null) window.clearTimeout(dmRefreshDebounce);
      dmRefreshDebounce = window.setTimeout(() => {
        dmRefreshDebounce = null;
        void refreshDms();
      }, 220);
    };

    void (async () => {
      await ensureSupabaseRealtimeAuth(supabase);
      if (cancelled) return;
      sub.ch = supabase
        .channel("team-chat-persist")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_room_messages" }, (payload) => {
          const row = payload.new as Record<string, unknown>;
          const ch = typeof row.channel === "string" ? row.channel : "";
          const ui = teamMessageFromPayload(row, nameByIdRef.current, userId, userDisplayName);
          if (!ui) return;
          if (ch === "team_chat") {
            setGroupMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, { ...ui, replyTo: ui.replyTo }]));
          } else if (ch === "announcements") {
            setAnnouncementMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, { ...ui, replyTo: ui.replyTo }]));
            if (/@everyone\b/i.test(ui.text)) {
              const authorId = typeof row.author_id === "string" ? row.author_id : "";
              if (authorId && authorId !== userId) {
                setAnnouncementPings((p) => p + 1);
                const viewingAnnouncements =
                  centerModeRef.current === "group" && groupChannelRef.current === "announcements";
                if (!viewingAnnouncements) {
                  bumpTeamChatMentionNavUnread();
                }
              }
            }
          }
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, () => {
          scheduleDmRefresh();
        })
        .subscribe();
    })();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      if (dmRefreshDebounce != null) window.clearTimeout(dmRefreshDebounce);
      refreshDmsRef.current = null;
      authSubscription.unsubscribe();
      if (sub.ch) void supabase.removeChannel(sub.ch);
    };
  }, [userId, userDisplayName, canManageRoles]);

  useEffect(() => {
    if (!canManageRoles || centerMode !== "issues") return;
    window.localStorage.setItem("teamChatIssueUnreadOwner", "0");
    window.dispatchEvent(new Event("team-chat-issue-unread-updated"));
  }, [canManageRoles, centerMode]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const participantNames = [...new Set(conversations.flatMap((c) => c.participants))].filter(Boolean);
    if (participantNames.length === 0) return;

    const formatLastSeen = (date: Date | null): string => {
      if (!date) return "unknown";
      const diffMs = Date.now() - date.getTime();
      if (diffMs < 60_000) return "just now";
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    };

    const loadLiveStats = async () => {
      const nameToId = new Map<string, string>();
      try {
        const { data: profileRows, error: profileErr } = await supabase
          .from("profiles")
          .select("id, first_name, full_name");
        if (profileErr || !Array.isArray(profileRows)) return;

        for (const raw of profileRows as Array<Record<string, unknown>>) {
          const id = typeof raw.id === "string" ? raw.id : "";
          if (!id) continue;
          const first = typeof raw.first_name === "string" ? raw.first_name.trim() : "";
          const full = typeof raw.full_name === "string" ? raw.full_name.trim() : "";
          if (first) nameToId.set(first.toLowerCase(), id);
          if (full) nameToId.set(full.toLowerCase(), id);
        }
      } catch {
        return;
      }

      const ids = participantNames
        .map((name) => ({ name, id: nameToId.get(name.toLowerCase()) }))
        .filter((x): x is { name: string; id: string } => Boolean(x.id));
      if (ids.length === 0) return;

      try {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: activityRows } = await supabase
          .from("lead_activity")
          .select("user_id, created_at")
          .in("user_id", ids.map((x) => x.id))
          .gte("created_at", sinceIso);

        const byUser = new Map<string, { count: number; latest: Date | null }>();
        for (const r of (activityRows as Array<Record<string, unknown>> | null) ?? []) {
          const uid = typeof r.user_id === "string" ? r.user_id : "";
          if (!uid) continue;
          const createdAtRaw = typeof r.created_at === "string" ? r.created_at : "";
          const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
          const prev = byUser.get(uid) ?? { count: 0, latest: null };
          const latest =
            createdAt && (!prev.latest || createdAt.getTime() > prev.latest.getTime()) ? createdAt : prev.latest;
          byUser.set(uid, { count: prev.count + 1, latest });
        }

        const next: Record<string, { status: "Active now" | "Away" | "Offline"; lastSeen: string; activity: string }> = {};
        for (const { name, id } of ids) {
          const info = byUser.get(id) ?? { count: 0, latest: null };
          const diffMs = info.latest ? Date.now() - info.latest.getTime() : Number.POSITIVE_INFINITY;
          const status: "Active now" | "Away" | "Offline" =
            diffMs < 5 * 60_000 ? "Active now" : diffMs < 60 * 60_000 ? "Away" : "Offline";
          const activity = info.count >= 20 ? "High" : info.count >= 8 ? "Medium" : "Low";
          next[name] = {
            status,
            lastSeen: formatLastSeen(info.latest),
            activity,
          };
        }

        if (!cancelled) setLiveProfileStats(next);
      } catch {
        // Keep graceful fallback values if schema differs.
      }
    };

    void loadLiveStats();

    const channel = supabase
      .channel("team-chat-live-profile-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_activity" }, () => {
        void loadLiveStats();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [conversations]);
  const profileName = useMemo(() => {
    if (activeConversation) {
      const other = activeConversation.participants.find((p) => p.toLowerCase() !== userDisplayName.toLowerCase());
      return other ?? activeConversation.participants[0];
    }
    return newMessagePeerLabel;
  }, [activeConversation, newMessagePeerLabel, userDisplayName]);
  const profile = MEMBER_PROFILES[profileName] ?? {
    role: "Member",
    status: "Away" as const,
    lastSeen: "recently",
    avgReply: "6m",
    activity: "Medium",
    readRate: "89%",
  };
  const liveProfile = liveProfileStats[profileName];
  const status = liveProfile?.status ?? profile.status;
  const lastSeen = liveProfile?.lastSeen ?? profile.lastSeen;
  const activity = liveProfile?.activity ?? profile.activity;
  const convoUnread = activeConversation?.unread ?? 0;
  const convoRead = Math.max((activeConversation?.messages.length ?? 0) - convoUnread, 0);
  const totalMessages = convoRead + convoUnread;
  const readPct = totalMessages > 0 ? Math.round((convoRead / totalMessages) * 100) : Number.parseInt(profile.readRate, 10);
  const responseQuality = profile.avgReply === "2m" || profile.avgReply === "3m" ? "Excellent" : profile.avgReply === "5m" ? "Good" : "Fair";
  const activityWindow = activity === "High" ? "20+ actions / 24h" : activity === "Medium" ? "8-19 actions / 24h" : "0-7 actions / 24h";
  const statusTone =
    status === "Active now"
      ? "text-emerald-100 border-emerald-400/35 bg-emerald-500/18"
      : status === "Away"
        ? "text-amber-100 border-amber-400/35 bg-amber-500/18"
        : "text-zinc-100 border-zinc-400/35 bg-zinc-500/18";

  const sendGroupMessage = () => {
    const msg = groupDraft.trim();
    if (!msg && groupAttachments.length === 0) return;
    const textBody = msg || "(attachment)";
    const replyPayload = groupReplyTarget ? { from: groupReplyTarget.from, text: groupReplyTarget.text } : null;
    const supabase = createSupabaseBrowserClient();
    const channel = groupChannel === "announcements" ? "announcements" : "team_chat";
    void (async () => {
      const { data, error } = await insertTeamRoomMessage(supabase, channel, userId, textBody, replyPayload);
      if (error) {
        console.error("[team chat]", error.message);
        if (isTeamChatSchemaError(error.message)) {
          setChatSchemaError(
            "Team chat tables are missing. Run web/supabase/team-chat-messages.sql in Supabase, then enable Realtime on team_room_messages and dm_messages.",
          );
        }
        return;
      }
      if (data) {
        const ui = teamMessageFromPayload(data as Record<string, unknown>, nameByIdRef.current, userId, userDisplayName);
        if (ui) {
          const row: GroupChannelMessage = { ...ui, replyTo: ui.replyTo, attachments: groupAttachments.length ? groupAttachments : undefined };
          if (channel === "team_chat") {
            setGroupMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, row]));
          } else {
            setAnnouncementMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, row]));
            if (/@everyone\b/i.test(msg)) setAnnouncementPings((prev) => prev + 1);
          }
        }
      }
      setGroupDraft("");
      setGroupReplyTarget(null);
      setGroupAttachments([]);
    })();
  };

  const sendDmMessage = () => {
    const supabase = createSupabaseBrowserClient();
    const replyPayload = dmReplyTarget ? { from: dmReplyTarget.from, text: dmReplyTarget.text } : null;

    const afterSend = async (conversationId: string) => {
      await markDmConversationRead(supabase, conversationId, userId);
      const prof = await fetchProfilesForChat(supabase);
      if (!prof.error && prof.data) {
        const rows = prof.data as ProfileRow[];
        const dm = await buildDmConversations(supabase, userId, userDisplayName, rows);
        if (!dm.error) setConversations(dm.conversations);
        if (canManageRoles) {
          const all = await buildDmConversations(supabase, userId, userDisplayName, rows, {
            viewAllConversationsAsOwner: true,
          });
          if (!all.error) setOwnerPanelConversations(all.conversations);
        }
      }
    };

    if (activeConversation) {
      const msg = draft.trim();
      if (!msg && dmAttachments.length === 0) return;
      const textBody = msg || "(attachment)";
      void (async () => {
        const { id: convId, error: convErr } = await getOrCreateDmConversationId(supabase, userId, activeConversation.otherUserId);
        if (convErr || !convId) {
          console.error("[dm]", convErr?.message);
          return;
        }
        const { error } = await insertDmMessage(supabase, convId, userId, textBody, replyPayload);
        if (error) {
          console.error("[dm]", error.message);
          if (isTeamChatSchemaError(error.message)) {
            setChatSchemaError(
              "DM tables are missing. Run web/supabase/team-chat-messages.sql in Supabase, then enable Realtime on dm_messages.",
            );
          }
          return;
        }
        setDraft("");
        setDmReplyTarget(null);
        setDmAttachments([]);
        await afterSend(convId);
      })();
      return;
    }
    const msg = newMessageBody.trim();
    if (!msg && dmAttachments.length === 0) return;
    if (resolvedDmPeerId === NO_DM_PEER_PLACEHOLDER) return;
    void (async () => {
      const { id: convId, error: convErr } = await getOrCreateDmConversationId(supabase, userId, resolvedDmPeerId);
      if (convErr || !convId) {
        console.error("[dm]", convErr?.message);
        return;
      }
      const textBody = msg || "(attachment)";
      const { error } = await insertDmMessage(supabase, convId, userId, textBody, null);
      if (error) {
        console.error("[dm]", error.message);
        return;
      }
      setNewMessageBody("");
      setDmAttachments([]);
      setActiveConversationId(convId);
      await afterSend(convId);
    })();
  };

  const sidebarFooter = (
    <>
      <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/[0.09] via-[#0b0c0f]/92 to-[#0b0c0f]/92 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_22px_-14px_rgba(34,211,238,0.7)]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">Signed in</p>
        <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{userDisplayName}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        }}
        className="w-full rounded-xl border border-cyan-300/25 bg-cyan-500/[0.09] py-2 text-[13px] font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-500/[0.16]"
      >
        Sign out
      </button>
    </>
  );

  return (
    <DeskShell sections={commandDeskSections({ canManageRoles })} sidebarFooter={sidebarFooter}>
      {/* Local @container: desktop main no longer sets one — chat breakpoints stay tied to this column, not the viewport. */}
      <div className="@container relative mx-auto flex w-full min-w-0 max-w-[1600px] flex-col text-zinc-100">
        <header className="mb-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-3 text-left shadow-none @min-[960px]:mb-4 @min-[960px]:rounded-2xl @min-[960px]:border-transparent @min-[960px]:bg-[radial-gradient(120%_100%_at_10%_0%,rgba(34,211,238,0.15),transparent_58%),radial-gradient(120%_100%_at_90%_0%,rgba(167,139,250,0.12),transparent_62%),linear-gradient(180deg,#0b0e14_0%,#090b11_100%)] @min-[960px]:px-6 @min-[960px]:py-6 @min-[960px]:text-center @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_40px_-24px_rgba(34,211,238,0.6)] @lg:mb-6 @lg:py-8">
          <p className="hidden text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75 @min-[960px]:block">
            Internal messaging
          </p>
          <h1 className="font-sans text-lg font-semibold tracking-tight text-zinc-100 @min-[960px]:mt-1.5 @min-[960px]:text-2xl @min-[960px]:text-cyan-200 @md:mt-2 @md:text-3xl @lg:mt-3 @lg:text-[2.35rem]">
            Team Chat
          </h1>
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-zinc-500 @min-[960px]:mx-auto @min-[960px]:mt-2 @min-[960px]:text-sm @min-[960px]:text-zinc-300/85 @md:mt-3 @md:text-base">
            <span className="@min-[960px]:hidden">Direct messages and team channels.</span>
            <span className="hidden @min-[960px]:inline">
              Clean inbox for teammates to ask questions, coordinate handoffs, and keep deals moving without leaving the
              dashboard.
            </span>
          </p>
          {chatSchemaError ? (
            <p className="mx-auto mt-4 max-w-3xl rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
              {chatSchemaError}
            </p>
          ) : null}
        </header>

        <section className="grid min-w-0 shrink-0 grid-cols-1 gap-3 overflow-hidden @max-[959px]:auto-rows-min @min-[960px]:gap-5 @min-[960px]:h-[min(72dvh,calc(100dvh-11.5rem))] @min-[960px]:min-h-[320px] @min-[960px]:max-h-[min(72dvh,calc(100dvh-11.5rem))] @min-[960px]:grid-cols-[360px_minmax(0,1fr)_280px] @min-[960px]:grid-rows-[minmax(0,1fr)]">
          <aside
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3 shadow-none @min-[960px]:rounded-2xl @min-[960px]:border-transparent @min-[960px]:bg-[linear-gradient(180deg,rgba(9,14,24,0.96),rgba(8,11,18,0.93))] @min-[960px]:p-4 @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_26px_-22px_rgba(34,211,238,0.6)] @min-[960px]:h-full @min-[960px]:max-h-full",
              centerMode === "group" || centerMode === "issues"
                ? "@max-[959px]:min-h-0"
                : "@max-[959px]:min-h-[min(64dvh,calc(100dvh-15rem))]",
            )}
          >
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-transparent bg-black/35 p-1 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)]">
              <button
                type="button"
                onClick={() => setLeftTab("inbox")}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                  leftTab === "inbox"
                    ? "bg-cyan-500/[0.22] text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => setLeftTab("threads")}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                  leftTab === "threads"
                    ? "bg-violet-500/[0.22] text-violet-100 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Notes
              </button>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {leftTab === "inbox" ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="mb-3 rounded-xl border border-transparent bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(8,14,24,0.92))] p-2.5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/85">Team group chat</p>
                    <span className="rounded-md border border-emerald-300/35 bg-emerald-500/18 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100">
                      Live room
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-300/90">Shared room for announcements and team-wide updates.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCenterMode("group");
                      setGroupChannel("chat");
                      setActiveConversationId("");
                    }}
                    className="touch-manipulation mt-2 w-full rounded-lg border border-emerald-300/35 bg-emerald-500/18 px-2 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/24 active:bg-emerald-500/28"
                  >
                    Open group chat
                  </button>
                </div>
                <div className="mb-3 rounded-xl border border-transparent bg-black/35 p-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)]">
                  <input
                    placeholder="Search teammate or topic..."
                    className="w-full rounded-lg border border-transparent bg-zinc-950/60 px-2.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] focus:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.3)] focus:outline-none"
                  />
                </div>
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCenterMode("dm");
                      setActiveConversationId("");
                      setDmReplyTarget(null);
                      setDraft("");
                    }}
                    className="w-full rounded-xl border border-cyan-300/35 bg-[linear-gradient(145deg,rgba(34,211,238,0.2),rgba(10,16,30,0.9))] px-3 py-2 text-left shadow-[inset_0_0_0_1px_rgba(34,211,238,0.3),0_12px_22px_-20px_rgba(34,211,238,0.75)] transition hover:bg-[linear-gradient(145deg,rgba(34,211,238,0.3),rgba(10,16,30,0.94))]"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100">+ Start new message</p>
                    <p className="mt-1 text-xs text-zinc-300">Go back to picker and choose who to DM.</p>
                  </button>
                </div>
                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                  {displayedConversations.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setCenterMode("dm");
                        setActiveConversationId(t.id);
                        setConversations((prev) => prev.map((c) => (c.id === t.id ? { ...c, unread: 0 } : c)));
                      }}
                      className={`group w-full rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 ${
                        t.unread > 0
                          ? "border-emerald-400/35 bg-[linear-gradient(135deg,rgba(6,40,28,0.55),rgba(10,14,24,0.92))] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35),0_0_20px_-12px_rgba(16,185,129,0.35)]"
                          : "border-transparent bg-[linear-gradient(135deg,rgba(14,20,33,0.9),rgba(10,14,24,0.9))] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.28)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/28 bg-cyan-500/[0.14] text-[10px] font-bold text-cyan-100">
                            {t.profile.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-100">{getCounterpartyName(t.participants)}</p>
                            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                              {t.profile.role} · {t.profile.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {t.unread > 0 ? (
                            <span className="rounded-full border border-emerald-300/35 bg-emerald-500/18 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">
                              {t.unread}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-zinc-500">{t.time}</span>
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] font-medium text-cyan-100/85">{t.topic}</p>
                      <p className="mt-1 truncate text-[11px] text-zinc-400 group-hover:text-zinc-300">{t.preview}</p>
                    </button>
                  ))}
                  {displayedConversations.length === 0 ? (
                    <div className="rounded-xl border border-transparent bg-black/30 p-3 text-xs text-zinc-400 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)]">
                      No direct messages yet for this account.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
                onClick={() => {
                  setActiveThreadId("");
                  setThreadReplyDraft("");
                }}
              >
                {threads.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-transparent bg-black/20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveThreadId(t.id)}
                      className={`w-full rounded-xl border border-transparent bg-gradient-to-br ${t.tone} p-3 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition hover:-translate-y-0.5 ${
                        t.id === activeThreadId ? "ring-1 ring-cyan-300/40" : ""
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="group relative inline-flex">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/[0.14] text-[10px] font-bold text-cyan-100">
                              {t.profile.initials}
                            </span>
                            <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-cyan-300/30 bg-[#0b1118]/95 px-2 py-1 text-[10px] font-semibold text-cyan-100 opacity-0 shadow-[0_10px_24px_-14px_rgba(34,211,238,0.7)] transition-opacity duration-150 group-hover:opacity-100">
                              {t.author}
                            </span>
                          </span>
                          <span className="rounded-md border border-zinc-300/20 bg-zinc-950/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-200">
                            {t.tag}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-300/80">{t.age}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white">{t.title}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-200/90">{t.body}</p>
                      {t.claimedBy ? (
                        <p className="mt-2 inline-flex rounded-md border border-emerald-300/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100">
                          Claimed by {t.claimedBy}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-300/85">
                        Posted by {t.author} · {t.profile.role} · {t.profile.status}
                      </p>
                    </button>

                    {t.id === activeThreadId ? (
                      <div className="mx-2 mb-2 mt-1 rounded-lg border border-transparent bg-[#0b111d]/90 p-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)]">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setThreads((prev) =>
                                prev.map((x) =>
                                  x.id === t.id
                                    ? {
                                        ...x,
                                        claimedBy: userDisplayName,
                                        replies: [...x.replies, `${userDisplayName}: Hey! I can take this, that's fine.`],
                                      }
                                    : x,
                                ),
                              );
                            }}
                            className="rounded-md border border-emerald-300/35 bg-emerald-500/18 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100"
                          >
                            I can take this
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setThreads((prev) =>
                                prev.map((x) =>
                                  x.id === t.id
                                    ? { ...x, replies: [...x.replies, `${userDisplayName}: I can help after my current call block.`] }
                                    : x,
                                ),
                              );
                            }}
                            className="rounded-md border border-cyan-300/35 bg-cyan-500/18 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-100"
                          >
                            I can help
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            value={threadReplyDraft}
                            onChange={(e) => setThreadReplyDraft(e.target.value)}
                            placeholder="Reply to this thread..."
                            className="flex-1 rounded-md border border-transparent bg-black/35 px-2 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] focus:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.3)] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const msg = threadReplyDraft.trim();
                              if (!msg) return;
                              setThreads((prev) =>
                                prev.map((x) => (x.id === t.id ? { ...x, replies: [...x.replies, `${userDisplayName}: ${msg}`] } : x)),
                              );
                              setThreadReplyDraft("");
                            }}
                            className="rounded-md border border-violet-300/35 bg-violet-500/18 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-100"
                          >
                            Reply
                          </button>
                        </div>
                        {t.replies.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {t.replies.slice(-3).map((r) => (
                              <p
                                key={`${t.id}-${r}`}
                                className="rounded-md border border-transparent bg-black/35 px-2 py-1 text-[11px] text-zinc-200 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]"
                              >
                                {r}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            </div>
            <div className="mt-auto shrink-0 border-t border-white/[0.08] pt-2">
              <button
                type="button"
                onClick={() => {
                  setCenterMode("issues");
                  setActiveConversationId("");
                }}
                className="w-full rounded-xl border border-transparent bg-[linear-gradient(145deg,rgba(250,204,21,0.16),rgba(20,20,18,0.92))] px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(250,204,21,0.3),0_12px_24px_-20px_rgba(250,204,21,0.65)] transition hover:bg-[linear-gradient(145deg,rgba(250,204,21,0.22),rgba(24,24,22,0.95))]"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-100">Issue board</p>
                <p className="mt-1 text-xs text-zinc-300">Post bugs or blockers for owner review.</p>
              </button>
            </div>
          </aside>

          <div
            ref={teamChatCenterRef}
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3 shadow-none @min-[960px]:rounded-2xl @min-[960px]:border-transparent @min-[960px]:bg-[radial-gradient(120%_120%_at_10%_0%,rgba(34,211,238,0.14),transparent_48%),radial-gradient(120%_120%_at_90%_0%,rgba(167,139,250,0.14),transparent_52%),linear-gradient(180deg,rgba(10,14,26,0.97),rgba(7,10,18,0.96))] @min-[960px]:p-5 @min-[960px]:shadow-[inset_0_0_0_1px_rgba(167,139,250,0.18),0_0_34px_-22px_rgba(34,211,238,0.42)] @min-[960px]:h-full @min-[960px]:max-h-full",
              (centerMode === "group" || centerMode === "issues") &&
                "@max-[959px]:min-h-[min(62dvh,620px)] @max-[959px]:scroll-mt-3",
            )}
          >
            <HelpMarker
              accent="crimson"
              className="right-2 top-2 @min-[960px]:right-4 @min-[960px]:top-4"
              text="TEAM CHAT: Use this area to ask teammates for help, share context before handoffs, and unblock deals faster. Keep messages short, action-focused, and tied to the account."
            />
            {centerMode === "group" || centerMode === "issues" ? null : (
              <div className="border-b border-zinc-800/90 pb-3 @min-[960px]:border-cyan-500/18 @min-[960px]:pb-4">
                <div className="flex flex-col gap-2 @min-[960px]:flex-row @min-[960px]:flex-wrap @min-[960px]:items-center @min-[960px]:justify-between @min-[960px]:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200/80 @min-[960px]:block">
                      Conversation
                    </p>
                    <h2 className="truncate text-lg font-semibold leading-tight text-white @min-[960px]:mt-1 @min-[960px]:text-2xl">
                      {activeConversation ? getCounterpartyName(activeConversation.participants) : "New message"}
                    </h2>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCenterMode("dm");
                        setActiveConversationId("");
                      }}
                      className="rounded-md border border-zinc-600/60 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700/80 @min-[960px]:border-violet-300/35 @min-[960px]:bg-violet-500/16 @min-[960px]:text-[10px] @min-[960px]:font-bold @min-[960px]:uppercase @min-[960px]:tracking-wide @min-[960px]:text-violet-100 @min-[960px]:hover:bg-violet-500/24"
                    >
                      + New
                    </button>
                    <span className="hidden rounded-md border border-emerald-400/30 bg-emerald-500/14 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100 @min-[960px]:inline">
                      Active
                    </span>
                    <span className="hidden rounded-md border border-cyan-400/30 bg-cyan-500/14 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-100 @min-[960px]:inline">
                      Priority
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 @min-[960px]:mt-2 @min-[960px]:text-sm @min-[960px]:text-zinc-300/85">
                  {activeConversation
                    ? activeConversation.topic
                    : "Choose someone in the list below, then write below."}
                </p>
              </div>
            )}

            <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden @min-[960px]:mt-4 @min-[960px]:gap-3">
              {centerMode === "issues" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-transparent bg-[linear-gradient(145deg,rgba(250,204,21,0.12),rgba(14,18,30,0.94))] p-4 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.26),0_18px_34px_-26px_rgba(250,204,21,0.55)]">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-400/20 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/90">Issue Board</p>
                      <p className="mt-1 text-sm text-zinc-200/90">Team can post bugs here. Owner gets notified and can mark fixed.</p>
                    </div>
                    {canManageRoles ? (
                      <span className="rounded-md border border-amber-300/35 bg-amber-500/16 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100">
                        Owner feed
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 @min-[560px]:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={issueDraft}
                      onChange={(e) => setIssueDraft(e.target.value)}
                      placeholder="Write a bug or issue note..."
                      className="h-[40px] self-end rounded-lg border border-transparent bg-black/35 px-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.18)] focus:shadow-[inset_0_0_0_1px_rgba(250,204,21,0.34)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const msg = issueDraft.trim();
                        if (!msg) return;
                        const now = new Date();
                        const hh = now.getHours();
                        const mm = now.getMinutes().toString().padStart(2, "0");
                        const suffix = hh >= 12 ? "PM" : "AM";
                        const hour12 = ((hh + 11) % 12) + 1;
                        setIssueNotes((prev) => [
                          {
                            id: `issue-${Date.now()}`,
                            author: userDisplayName,
                            text: msg,
                            status: "Open",
                            time: `${hour12}:${mm} ${suffix}`,
                            replies: [],
                          },
                          ...prev,
                        ]);
                        if (!canManageRoles) {
                          const raw = window.localStorage.getItem("teamChatIssueUnreadOwner");
                          const prevUnread = Number(raw ?? "0");
                          const next = (Number.isFinite(prevUnread) ? prevUnread : 0) + 1;
                          window.localStorage.setItem("teamChatIssueUnreadOwner", String(next));
                          window.dispatchEvent(new Event("team-chat-issue-unread-updated"));
                        }
                        setIssueDraft("");
                      }}
                      className="h-[40px] self-end rounded-lg border border-amber-300/40 bg-amber-500/16 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/24"
                    >
                      Post note
                    </button>
                  </div>

                  <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                    {issueNotes.map((note) => (
                      <div
                        key={note.id}
                        className={`rounded-lg border border-transparent px-2.5 py-2 ${
                          note.status === "Fixed"
                            ? "bg-emerald-500/[0.1] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.38),0_0_22px_-16px_rgba(52,211,153,0.85)]"
                            : "bg-black/35 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="group relative inline-flex">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/[0.14] text-[10px] font-bold text-cyan-100">
                                {note.author
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((x) => x[0])
                                  .join("")
                                  .toUpperCase() || "?"}
                              </span>
                              <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-cyan-300/30 bg-[#0b1118]/95 px-2 py-1 text-[10px] font-semibold text-cyan-100 opacity-0 shadow-[0_10px_24px_-14px_rgba(34,211,238,0.7)] transition-opacity duration-150 group-hover:opacity-100">
                                {note.author}
                              </span>
                            </span>
                            <p className="text-xs font-semibold text-zinc-100">Posted by {note.author}</p>
                          </div>
                          <span className="text-[10px] text-zinc-500">{note.time}</span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-200">{note.text}</p>
                        {note.replies.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {note.replies.map((reply) => (
                              <div
                                key={`${note.id}-${reply.author}-${reply.time}-${reply.text}`}
                                className="rounded-md border border-transparent bg-zinc-950/55 px-2 py-1.5 text-xs text-zinc-200 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]"
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/85">
                                  {reply.author} · {reply.time}
                                </p>
                                <p className="mt-0.5 text-xs text-zinc-200">{reply.text}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            value={issueReplyDrafts[note.id] ?? ""}
                            onChange={(e) => setIssueReplyDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))}
                            placeholder="Write a reply..."
                            className="flex-1 rounded-md border border-transparent bg-black/35 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)] focus:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.28)] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const msg = (issueReplyDrafts[note.id] ?? "").trim();
                              if (!msg) return;
                              setIssueNotes((prev) =>
                                prev.map((x) =>
                                  x.id === note.id
                                    ? {
                                        ...x,
                                        replies: [
                                          ...x.replies,
                                          { author: userDisplayName, text: msg, time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) },
                                        ],
                                      }
                                    : x,
                                ),
                              );
                              setIssueReplyDrafts((prev) => ({ ...prev, [note.id]: "" }));
                            }}
                            className="rounded-md border border-cyan-300/35 bg-cyan-500/16 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-100"
                          >
                            Send
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              note.status === "Fixed"
                                ? "border-emerald-300/45 bg-emerald-500/20 text-emerald-100"
                                : "border-zinc-400/30 bg-zinc-700/20 text-zinc-300"
                            }`}
                          >
                            {note.status === "Fixed" ? "Fixed ✓" : `Status: ${note.status}`}
                          </span>
                          {canManageRoles ? (
                            <button
                              type="button"
                              onClick={() =>
                                setIssueNotes((prev) =>
                                  prev.map((x) => (x.id === note.id ? { ...x, status: x.status === "Fixed" ? "Reviewing" : "Fixed" } : x)),
                                )
                              }
                              className="rounded-md border border-emerald-300/35 bg-emerald-500/16 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100"
                            >
                              {note.status === "Fixed" ? "Reopen" : "Mark fixed"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : centerMode === "group" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-transparent bg-[linear-gradient(150deg,rgba(16,185,129,0.16),rgba(8,12,22,0.95)_45%,rgba(14,16,30,0.92))] p-4 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.24),0_24px_48px_-34px_rgba(16,185,129,0.7)]">
                  <div className="flex items-start justify-between gap-3 border-b border-emerald-500/18 pb-3">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-100 [text-shadow:0_0_10px_rgba(16,185,129,0.35)]">
                        Team Group Chat
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-200/95">
                        Shared room for live coordination, daily updates, and team-wide announcements.
                      </p>
                    </div>
                    <span className="rounded-md border border-emerald-300/40 bg-emerald-500/18 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100">
                      Everyone sees this
                    </span>
                  </div>
                  <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 @min-[960px]:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-xl border border-transparent bg-[linear-gradient(180deg,rgba(8,27,30,0.74),rgba(8,12,22,0.92))] p-4 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.24),0_16px_30px_-20px_rgba(16,185,129,0.5)]">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Channels</p>
                        <span className="rounded-md border border-emerald-300/30 bg-emerald-500/14 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100">
                          Live
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupChannel("announcements");
                          setAnnouncementPings(0);
                          try {
                            window.localStorage.setItem(LS_TEAM_CHAT_MENTION_UNREAD, "0");
                            window.dispatchEvent(new Event("team-chat-mention-unread-updated"));
                          } catch {
                            /* private mode */
                          }
                        }}
                        className={`mb-2 flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-3 text-left transition ${
                          groupChannel === "announcements"
                            ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.24),rgba(20,32,38,0.9))] text-emerald-100 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.34),0_12px_24px_-20px_rgba(16,185,129,0.65)]"
                            : "bg-zinc-950/35 text-zinc-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)] hover:bg-zinc-900/55"
                        }`}
                      >
                        <span>
                          <span className="block text-lg font-semibold leading-none">Announcements</span>
                          <span className="mt-1 block text-xs text-zinc-400">Owner posts, alerts, @everyone</span>
                        </span>
                        {announcementPings > 0 ? (
                          <span className="rounded-full border border-rose-300/40 bg-rose-500/22 px-1.5 py-0.5 text-[10px] font-bold text-rose-100">
                            {announcementPings}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupChannel("chat")}
                        className={`flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-3 text-left transition ${
                          groupChannel === "chat"
                            ? "bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(26,26,50,0.88))] text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.34),0_12px_24px_-20px_rgba(34,211,238,0.62)]"
                            : "bg-zinc-950/35 text-zinc-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)] hover:bg-zinc-900/55"
                        }`}
                      >
                        <span>
                          <span className="block text-lg font-semibold leading-none">Team Chat</span>
                          <span className="mt-1 block text-xs text-zinc-400">Open team conversation</span>
                        </span>
                      </button>
                      <div className="mt-3 rounded-lg border border-transparent bg-[linear-gradient(140deg,rgba(10,24,34,0.92),rgba(11,16,28,0.95))] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2),0_14px_26px_-22px_rgba(34,211,238,0.48)]">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Online now</p>
                          <span className="rounded-md border border-emerald-300/35 bg-emerald-500/16 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">
                            4 active
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {["Jaylan", "Mykala", "Jon", "Richard"].map((name) => (
                            <div
                              key={`online-${name}`}
                              className="flex items-center justify-between rounded-md border border-transparent bg-black/30 px-2 py-1.5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/[0.14] text-[10px] font-bold text-cyan-100">
                                  {name.slice(0, 1)}
                                </span>
                                <span className="text-xs font-medium text-zinc-100">{name}</span>
                              </div>
                              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.95)]" />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 rounded-lg border border-transparent bg-black/35 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Channel focus</p>
                        <p className="mt-1 text-sm text-zinc-200">
                          {groupChannel === "announcements"
                            ? "High-priority updates and policy notes."
                            : "Daily chatter, handoffs, and quick asks."}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-transparent bg-black/28 p-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
                      <div className="mb-2 flex items-center justify-between border-b border-zinc-700/40 pb-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                            {groupChannel === "announcements" ? "Announcements" : "Team Chat"}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {groupChannel === "announcements"
                              ? "Important updates from leadership."
                              : "Team collaboration and quick handoffs."}
                          </p>
                        </div>
                        <p className="text-[10px] text-zinc-500">
                          {activeGroupMessages.length} messages
                        </p>
                      </div>
                      <div
                        ref={groupScrollRef}
                        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [max-height:min(62dvh,720px,calc(100dvh-22rem))]"
                      >
                        {groupChannel === "announcements" ? (
                          <div className="space-y-3">
                            {activeGroupMessages.map((m, idx) => (
                              <div
                                key={m.dbId ?? `group-ann-${idx}`}
                                onClick={() => setGroupReplyTarget({ from: m.from, text: m.text })}
                                className="cursor-pointer rounded-xl border border-transparent bg-[linear-gradient(150deg,rgba(12,26,38,0.94),rgba(10,14,26,0.96))] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22),0_18px_32px_-24px_rgba(34,211,238,0.42)] transition hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35),0_20px_34px_-22px_rgba(34,211,238,0.55)]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-md border border-amber-300/40 bg-amber-500/18 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100">
                                      Important
                                    </span>
                                    <p className="text-sm font-semibold text-cyan-100">Posted by {m.from}</p>
                                  </div>
                                  <span className="text-[10px] text-zinc-400">{m.time}</span>
                                </div>
                                {m.replyTo ? (
                                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-black/28 px-2 py-1 text-xs text-zinc-300">
                                    <span className="font-semibold text-cyan-100">↪ {m.replyTo.from}</span> {m.replyTo.text}
                                  </div>
                                ) : null}
                                <p className="mt-2 text-[15px] leading-relaxed font-medium text-zinc-100">{renderTextWithLinks(m.text)}</p>
                                {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                                  <div className="mt-2 space-y-1.5">
                                    {m.attachments.map((att) => (
                                      <div
                                        key={`${m.time}-${att.url}`}
                                        className="rounded-md border border-transparent bg-black/30 p-1.5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]"
                                      >
                                        {att.kind === "image" ? (
                                          <img src={att.url} alt={att.name} className="max-h-52 w-full rounded-md object-cover" />
                                        ) : att.kind === "video" ? (
                                          <video src={att.url} controls className="max-h-52 w-full rounded-md object-cover" />
                                        ) : (
                                          <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-200 underline">
                                            {att.name}
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex min-h-full flex-col gap-2">
                            {activeGroupMessages.map((m, idx) => (
                              <div
                                key={m.dbId ?? `group-chat-${idx}`}
                                onClick={() => setGroupReplyTarget({ from: m.from, text: m.text })}
                                className="cursor-pointer rounded-xl border border-transparent bg-zinc-950/74 px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)] transition hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.28)]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-emerald-100">{m.from}</p>
                                  <span className="text-[10px] text-zinc-500">{m.time}</span>
                                </div>
                                {m.replyTo ? (
                                  <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-black/28 px-2 py-1 text-xs text-zinc-300">
                                    <svg viewBox="0 0 28 22" className="mt-0.5 h-4 w-5 shrink-0 text-cyan-200/80">
                                      <path d="M1 1 H14 Q22 1 22 9 V18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                      <path d="M17 13 L22 18 L27 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <p>
                                      <span className="font-semibold text-cyan-100">{m.replyTo.from}</span> {m.replyTo.text}
                                    </p>
                                  </div>
                                ) : null}
                                <p className="mt-1 text-[14px] leading-relaxed text-zinc-100">{renderTextWithLinks(m.text)}</p>
                                {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                                  <div className="mt-2 space-y-1.5">
                                    {m.attachments.map((att) => (
                                      <div
                                        key={`${m.time}-${att.url}`}
                                        className="rounded-md border border-transparent bg-black/30 p-1.5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]"
                                      >
                                        {att.kind === "image" ? (
                                          <img src={att.url} alt={att.name} className="max-h-52 w-full rounded-md object-cover" />
                                        ) : att.kind === "video" ? (
                                          <video src={att.url} controls className="max-h-52 w-full rounded-md object-cover" />
                                        ) : (
                                          <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-200 underline">
                                            {att.name}
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-transparent bg-[linear-gradient(180deg,rgba(11,16,28,0.88),rgba(9,13,22,0.92))] p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Post to group</p>
                    {groupReplyTarget ? (
                      <div className="mt-2 flex items-start justify-between gap-2 rounded-md border-l-2 border-cyan-300/45 bg-black/35 px-2.5 py-2 text-xs text-zinc-300 transition-all duration-200">
                        <p>
                          <span className="font-semibold text-cyan-100">↪ Replying to {groupReplyTarget.from}:</span> {groupReplyTarget.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => setGroupReplyTarget(null)}
                          className="rounded-md border border-zinc-400/30 bg-zinc-700/20 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    <textarea
                      rows={3}
                      placeholder={
                        groupChannel === "announcements"
                          ? "Post an announcement (@everyone supported)..."
                          : "Message the Team Chat channel..."
                      }
                      value={groupDraft}
                      onChange={(e) => setGroupDraft(e.target.value)}
                      onPaste={(e) => {
                        const files = Array.from(e.clipboardData?.files ?? []);
                        if (files.length === 0) return;
                        e.preventDefault();
                        setGroupAttachments((prev) => [...prev, ...toAttachments(files)].slice(0, 6));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendGroupMessage();
                        }
                      }}
                      className="mt-2 w-full resize-none rounded-xl border border-transparent bg-black/40 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)] focus:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.36)] focus:outline-none"
                    />
                    {groupAttachments.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {groupAttachments.map((att, idx) => (
                          <button
                            key={`${att.url}-${idx}`}
                            type="button"
                            onClick={() => setGroupAttachments((prev) => prev.filter((_, i) => i !== idx))}
                            className="rounded-md border border-cyan-300/30 bg-cyan-500/14 px-2 py-1 text-[10px] text-cyan-100"
                            title="Remove attachment"
                          >
                            {att.kind.toUpperCase()} · {att.name.slice(0, 20)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[11px] text-zinc-500">
                        {groupChannel === "announcements"
                          ? "Use @everyone to ping the full team"
                          : "Use @name to mention a teammate in channel"}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          ref={groupFileInputRef}
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                          className="hidden"
                          onChange={(e) => {
                            const fl = e.target.files;
                            if (!fl?.length) return;
                            setGroupAttachments((prev) => [...prev, ...toAttachments(fl)].slice(0, 6));
                            e.currentTarget.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => groupFileInputRef.current?.click()}
                          className="rounded-xl border border-cyan-300/35 bg-cyan-500/14 px-2.5 py-2 text-[11px] font-semibold text-cyan-100"
                        >
                          Upload
                        </button>
                        <button
                          type="button"
                          onClick={sendGroupMessage}
                          className="rounded-xl border border-cyan-300/45 bg-gradient-to-r from-cyan-500/[0.24] to-violet-500/[0.24] px-3.5 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/65 hover:from-cyan-500/[0.34] hover:to-violet-500/[0.34]"
                        >
                          Send to group
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {centerMode !== "dm"
                ? null
                : activeConversation ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                  <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Today</p>
                  <div
                    ref={dmScrollRef}
                    className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-2 overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-transparent bg-[linear-gradient(180deg,rgba(9,18,34,0.88),rgba(8,12,24,0.9))] p-2.5 pr-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)] [max-height:min(62dvh,720px,calc(100dvh-22rem))]"
                  >
                  {activeConversation.messages.map((m, idx) => {
                    const isYou = m.from.toLowerCase() === userDisplayName.toLowerCase();
                    const personTone: Record<string, string> = {
                      mykala: "bg-[linear-gradient(145deg,rgba(16,185,129,0.22),rgba(10,28,28,0.9))] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.34),0_12px_24px_-20px_rgba(16,185,129,0.46)]",
                      jon: "bg-[linear-gradient(145deg,rgba(6,182,212,0.22),rgba(8,24,42,0.9))] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.34),0_12px_24px_-20px_rgba(34,211,238,0.44)]",
                      richard: "bg-[linear-gradient(145deg,rgba(245,158,11,0.2),rgba(36,24,12,0.9))] shadow-[inset_0_0_0_1px_rgba(251,191,36,0.32),0_12px_24px_-20px_rgba(245,158,11,0.42)]",
                      camydn: "bg-[linear-gradient(145deg,rgba(236,72,153,0.2),rgba(32,14,32,0.9))] shadow-[inset_0_0_0_1px_rgba(244,114,182,0.32),0_12px_24px_-20px_rgba(236,72,153,0.42)]",
                      jaylan: "bg-[linear-gradient(145deg,rgba(124,58,237,0.22),rgba(24,18,50,0.9))] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.34),0_12px_24px_-20px_rgba(124,58,237,0.44)]",
                    };
                    const bubbleClass = personTone[m.from.toLowerCase()] ?? "bg-[linear-gradient(145deg,rgba(71,85,105,0.24),rgba(15,23,42,0.9))] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.3)]";
                    const nameClass = isYou ? "text-violet-100" : "text-cyan-100";
                    return (
                      <div
                        key={`${m.from}-${idx}-${m.text}`}
                        className={`flex w-full items-end gap-2 ${isYou ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          onClick={() => setDmReplyTarget({ from: m.from, text: m.text })}
                          className={`max-w-[min(82%,28rem)] cursor-pointer rounded-2xl border border-transparent px-3 py-2.5 transition hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.28)] ${bubbleClass}`}
                        >
                        <p className={`text-xs font-semibold ${nameClass}`}>{m.from}</p>
                        {m.replyTo ? (
                          <div className="mt-1 flex items-start gap-1.5 rounded-md bg-black/28 px-2 py-1 text-xs text-zinc-300">
                            <svg viewBox="0 0 28 22" className="mt-0.5 h-4 w-5 shrink-0 text-cyan-200/80">
                              <path d="M1 1 H14 Q22 1 22 9 V18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                              <path d="M17 13 L22 18 L27 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <p>
                              <span className="font-semibold text-cyan-100">{m.replyTo.from}</span> {m.replyTo.text}
                            </p>
                          </div>
                        ) : null}
                        <p className="mt-1 text-sm text-zinc-100">{renderTextWithLinks(m.text)}</p>
                        {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {m.attachments.map((att) => (
                              <div
                                key={`${m.from}-${att.url}`}
                                className="rounded-md border border-transparent bg-[linear-gradient(145deg,rgba(10,16,30,0.86),rgba(6,10,20,0.9))] p-1.5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]"
                              >
                                {att.kind === "image" ? (
                                  <img src={att.url} alt={att.name} className="max-h-56 max-w-full rounded-md object-contain" />
                                ) : att.kind === "video" ? (
                                  <video src={att.url} controls className="max-h-56 w-full max-w-full rounded-md object-contain" />
                                ) : (
                                  <a href={att.url} target="_blank" rel="noreferrer" className="break-all text-xs text-cyan-200 underline">
                                    {att.name}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        </div>
                        {isYou ? (
                          <span
                            aria-hidden
                            className="mb-3 flex h-5 w-5 shrink-0 items-center justify-center text-violet-400/70"
                            title="Sent"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 shrink-0 overflow-hidden rounded-xl border border-zinc-800/80 bg-[#1e1f22] p-3 @min-[960px]:rounded-2xl @min-[960px]:border-transparent @min-[960px]:bg-[linear-gradient(180deg,rgba(10,18,32,0.94),rgba(8,12,22,0.94))] @min-[960px]:p-5 @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2),0_18px_40px_-30px_rgba(34,211,238,0.55)]">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-700/80 pb-2.5 @min-[960px]:border-cyan-500/18 @min-[960px]:pb-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-300 @min-[960px]:text-[11px] @min-[960px]:font-semibold @min-[960px]:uppercase @min-[960px]:tracking-[0.16em] @min-[960px]:text-cyan-200/80">
                        Direct message
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500 @min-[960px]:mt-1 @min-[960px]:text-xs @min-[960px]:text-zinc-400">
                        Pick who you’re messaging, then type below.
                      </p>
                    </div>
                    <span className="hidden shrink-0 rounded border border-zinc-600/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 @min-[960px]:inline @min-[960px]:border-cyan-300/28 @min-[960px]:bg-cyan-500/[0.12] @min-[960px]:text-cyan-100">
                      Live
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 @min-[960px]:mt-4 @min-[960px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)] @min-[960px]:gap-4">
                    <label className="min-w-0 text-xs font-medium text-zinc-400 @min-[960px]:font-semibold @min-[960px]:uppercase @min-[960px]:tracking-[0.12em]">
                      To
                      <UiSelect
                        value={resolvedDmPeerId}
                        onChange={(v) => {
                          if (v === NO_DM_PEER_PLACEHOLDER) return;
                          setNewMessagePeerId(v);
                        }}
                        options={dmSendToOptions}
                        className="mt-1.5 w-full max-w-full @min-[960px]:mt-2"
                        aria-label="Teammate to message"
                        triggerClassName="normal-case tracking-normal border-zinc-600/60 bg-zinc-900/90 @min-[960px]:border-cyan-400/30 @min-[960px]:bg-gradient-to-b @min-[960px]:from-[#0e1524] @min-[960px]:to-[#0a0f18] @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
                      />
                    </label>
                    <div className="min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2.5 @min-[960px]:rounded-xl @min-[960px]:border-transparent @min-[960px]:bg-black/40 @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 @min-[960px]:text-xs @min-[960px]:font-semibold @min-[960px]:tracking-[0.12em]">
                        With
                      </p>
                      <p className="mt-0.5 truncate text-sm font-medium text-zinc-100">{newMessagePeerLabel}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">Composer is below.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {centerMode !== "dm" ? null : (
            <div className="mt-3 shrink-0 rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-3 @min-[960px]:mt-5 @min-[960px]:rounded-2xl @min-[960px]:border-transparent @min-[960px]:bg-[linear-gradient(180deg,rgba(11,16,28,0.95),rgba(9,13,22,0.95))] @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2),0_18px_30px_-24px_rgba(34,211,238,0.55)]">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 @min-[960px]:text-[11px] @min-[960px]:font-semibold @min-[960px]:tracking-[0.16em] @min-[960px]:text-cyan-200/80">
                {activeConversation ? "Message" : "Message"}
              </p>
              {activeConversation && dmReplyTarget ? (
                <div className="mt-2 flex items-start justify-between gap-2 rounded-md border-l-2 border-cyan-300/45 bg-black/35 px-2.5 py-2 text-xs text-zinc-300 transition-all duration-200">
                  <p>
                    <span className="font-semibold text-cyan-100">↪ Replying to {dmReplyTarget.from}:</span> {dmReplyTarget.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDmReplyTarget(null)}
                    className="rounded-md border border-zinc-400/30 bg-zinc-700/20 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <textarea
                rows={3}
                placeholder={
                  activeConversation ? "Reply in this conversation..." : "Type your first message..."
                }
                value={activeConversation ? draft : newMessageBody}
                onChange={(e) =>
                  activeConversation ? setDraft(e.target.value) : setNewMessageBody(e.target.value)
                }
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData?.files ?? []);
                  if (files.length === 0) return;
                  e.preventDefault();
                  setDmAttachments((prev) => [...prev, ...toAttachments(files)].slice(0, 6));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendDmMessage();
                  }
                }}
                className="mt-2 w-full min-w-0 resize-none rounded-lg border border-zinc-700/70 bg-zinc-900/90 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none @min-[960px]:rounded-xl @min-[960px]:border-transparent @min-[960px]:bg-black/40 @min-[960px]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)] @min-[960px]:focus:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.36)]"
              />
              {dmAttachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dmAttachments.map((att, idx) => (
                    <button
                      key={`${att.url}-${idx}`}
                      type="button"
                      onClick={() => setDmAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-md border border-cyan-300/30 bg-cyan-500/14 px-2 py-1 text-[10px] text-cyan-100"
                      title="Remove attachment"
                    >
                      {att.kind.toUpperCase()} · {att.name.slice(0, 20)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex flex-col gap-2 @min-[960px]:flex-row @min-[960px]:items-center @min-[960px]:justify-between">
                <p className="hidden text-[11px] text-zinc-500 @min-[960px]:block">Use @name to mention a teammate</p>
                <div className="flex w-full items-stretch gap-2 @min-[960px]:w-auto @min-[960px]:items-center @min-[960px]:justify-start">
                  <input
                    ref={dmFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const fl = e.target.files;
                      if (!fl?.length) return;
                      setDmAttachments((prev) => [...prev, ...toAttachments(fl)].slice(0, 6));
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => dmFileInputRef.current?.click()}
                    className="rounded-lg border border-zinc-600/60 bg-zinc-800/90 px-3 py-2.5 text-xs font-medium text-zinc-200 @min-[960px]:rounded-xl @min-[960px]:border-cyan-300/35 @min-[960px]:bg-cyan-500/14 @min-[960px]:py-2 @min-[960px]:text-[11px] @min-[960px]:font-semibold @min-[960px]:text-cyan-100"
                  >
                    File
                  </button>
                  <button
                    type="button"
                    onClick={sendDmMessage}
                    className="min-h-[42px] flex-1 rounded-lg border border-[#5865f2]/50 bg-[#5865f2]/90 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5865f2] @min-[960px]:min-h-0 @min-[960px]:flex-none @min-[960px]:rounded-xl @min-[960px]:border-cyan-300/45 @min-[960px]:bg-gradient-to-r @min-[960px]:from-cyan-500/[0.24] @min-[960px]:to-violet-500/[0.24] @min-[960px]:px-3.5 @min-[960px]:text-xs @min-[960px]:text-cyan-100 @min-[960px]:hover:border-cyan-300/65"
                  >
                    {activeConversation ? "Send" : "Start chat"}
                  </button>
                </div>
              </div>
            </div>
            )}

          </div>

          <aside className="hidden min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-transparent bg-[linear-gradient(180deg,rgba(10,14,26,0.95),rgba(8,10,18,0.92))] p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14),0_0_22px_-20px_rgba(34,211,238,0.5)] @min-[960px]:block @min-[960px]:h-full @min-[960px]:max-h-full">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">DM profile</p>
            <div className="mt-3 rounded-xl border border-transparent bg-black/35 p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/[0.15] text-sm font-bold text-cyan-100">
                  {profileName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{profileName}</p>
                  <p className="text-xs text-zinc-400">{profile.role}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>
                  {status}
                </span>
                <span className="text-[10px] text-zinc-400">Seen {lastSeen}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-transparent bg-zinc-950/55 p-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Quality</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{responseQuality}</p>
                </div>
                <div className="rounded-lg border border-transparent bg-zinc-950/55 p-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Last touch</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{lastSeen}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              <div className="rounded-xl border border-transparent bg-[linear-gradient(145deg,rgba(6,30,42,0.72),rgba(8,14,24,0.9))] p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22),0_12px_26px_-22px_rgba(34,211,238,0.8)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">Avg reply</p>
                  <span className="rounded-md border border-cyan-300/30 bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-100">
                    Speed
                  </span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-cyan-100 [text-shadow:0_0_16px_rgba(34,211,238,0.35)]">
                  {profile.avgReply}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">Median response speed in active hours</p>
              </div>

              <div className="rounded-xl border border-transparent bg-[linear-gradient(145deg,rgba(8,34,22,0.7),rgba(8,14,20,0.9))] p-3 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.22),0_12px_26px_-22px_rgba(16,185,129,0.8)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Activity</p>
                  <span className="rounded-md border border-emerald-300/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100">
                    24h
                  </span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-100 [text-shadow:0_0_16px_rgba(16,185,129,0.35)]">
                  {activity}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">{activityWindow}</p>
              </div>

              <div className="rounded-xl border border-transparent bg-[linear-gradient(145deg,rgba(22,14,42,0.72),rgba(10,12,24,0.92))] p-3 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.22),0_12px_26px_-22px_rgba(167,139,250,0.8)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">Read / unread</p>
                  <span className="rounded-md border border-violet-300/30 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-100">
                    DM
                  </span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-violet-100 [text-shadow:0_0_16px_rgba(167,139,250,0.35)]">
                  {convoRead} / {convoUnread}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800/85">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400"
                    style={{ width: `${Math.max(0, Math.min(100, readPct))}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">Read rate: {readPct}%</p>
              </div>
            </div>

          </aside>
        </section>

        {canManageRoles ? (
          <section className="mt-6 min-w-0 overflow-x-hidden rounded-2xl border border-transparent bg-[linear-gradient(180deg,rgba(12,17,30,0.96),rgba(8,10,20,0.94))] p-5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22),0_0_36px_-24px_rgba(16,185,129,0.55)]">
            <div className="mb-4 border-b border-emerald-500/20 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/85">Owner only</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Owner DM Command Panel</h2>
              <p className="mt-1 text-sm text-zinc-300/85">
                Full visibility across all direct messages. Open any conversation and reply directly as owner.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-4 @min-[960px]:grid-cols-[340px_minmax(0,1fr)]">
              <div className="min-w-0 rounded-xl border border-transparent bg-black/30 p-3 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">All DMs</p>
                <div className="mt-2 max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-1">
                  {ownerPanelConversations.length === 0 ? (
                    <div className="rounded-lg border border-emerald-500/20 bg-zinc-950/60 px-3 py-3 text-xs leading-relaxed text-zinc-400 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.12)]">
                      <p className="font-medium text-zinc-200">No threads loaded yet.</p>
                      <p className="mt-2">
                        If you sign in with the owner email but Supabase still hides other people’s DMs, run the latest{" "}
                        <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-emerald-200/90">team-chat-messages.sql</code>{" "}
                        in the SQL editor (owner JWT email + <code className="rounded bg-black/40 px-1 py-0.5 text-[10px]">team_roles.role = owner</code>{" "}
                        both allow org-wide reads).
                      </p>
                      <p className="mt-2 text-zinc-500">Otherwise, conversations appear here once teammates start DMing each other.</p>
                    </div>
                  ) : (
                    ownerPanelConversations.map((c) => (
                      <button
                        key={`owner-panel-${c.id}`}
                        type="button"
                        onClick={() => setOwnerActiveConversationId(c.id)}
                        className={`w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition ${
                          ownerActiveConversationId === c.id
                            ? "bg-emerald-500/[0.18] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.4)]"
                            : "bg-zinc-950/70 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] hover:bg-zinc-900/80"
                        }`}
                      >
                        <p className="truncate text-xs font-semibold text-zinc-100">{c.participants.join(" <-> ")}</p>
                        <p className="truncate text-[11px] text-zinc-400">{c.preview}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-transparent bg-black/30 p-3 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-white">
                    {ownerActiveConversation ? ownerActiveConversation.participants.join(" <-> ") : "No conversation selected"}
                  </p>
                  <span className="rounded-md border border-emerald-300/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100">
                    Owner reply
                  </span>
                </div>
                <div className="mt-3 max-h-[min(38dvh,340px)] min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1">
                  {ownerActiveConversation?.messages.map((m, idx) => (
                    <div
                      key={`owner-msg-${idx}-${m.text}`}
                      className="rounded-lg border border-transparent bg-zinc-950/70 px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]"
                    >
                      <p className="text-[11px] font-semibold text-cyan-100">{m.from}</p>
                      <p className="mt-0.5 text-sm text-zinc-100">{m.text}</p>
                    </div>
                  )) ?? null}
                </div>

                <div className="mt-3 rounded-lg border border-transparent bg-zinc-950/75 p-2 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.24)]">
                  <textarea
                    rows={3}
                    value={ownerReplyDraft}
                    onChange={(e) => setOwnerReplyDraft(e.target.value)}
                    placeholder="Owner note / escalation / direct reply..."
                    className="w-full resize-none rounded-md border border-transparent bg-black/35 px-2.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)] focus:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)] focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const msg = ownerReplyDraft.trim();
                        if (!msg || !ownerActiveConversation) return;
                        const sb = createSupabaseBrowserClient();
                        void (async () => {
                          const { error } = await insertDmMessage(sb, ownerActiveConversation.id, userId, msg, null);
                          if (error) {
                            console.error("[owner dm]", error.message);
                            return;
                          }
                          setOwnerReplyDraft("");
                          await markDmConversationRead(sb, ownerActiveConversation.id, userId);
                          const prof = await fetchProfilesForChat(sb);
                          if (!prof.error && prof.data) {
                            const rows = prof.data as ProfileRow[];
                            const dm = await buildDmConversations(sb, userId, userDisplayName, rows);
                            if (!dm.error) setConversations(dm.conversations);
                            const all = await buildDmConversations(sb, userId, userDisplayName, rows, {
                              viewAllConversationsAsOwner: true,
                            });
                            if (!all.error) setOwnerPanelConversations(all.conversations);
                          }
                        })();
                      }}
                      className="rounded-lg border border-emerald-300/45 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                    >
                      Send owner reply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </DeskShell>
  );
}
