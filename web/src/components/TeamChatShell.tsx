"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DeskShell } from "@/components/DeskShell";
import { OwnerRoofingLeadsFooterLink } from "@/components/OwnerRoofingLeadsFooterLink";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ensureSupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";
import { HelpMarker } from "@/components/HelpMarker";
import { cn } from "@/lib/utils";
import {
  Bell,
  Command,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Search,
  Send,
  Users,
  Plus,
  X,
} from "lucide-react";
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

function displayInitials(name: string) {
  const t = name.trim();
  if (!t) return "??";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase() || t.slice(0, 2).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export function TeamChatShell({
  userId,
  userDisplayName,
  canManageRoles,
  canPostAnnouncements,
}: {
  userId: string;
  userDisplayName: string;
  canManageRoles: boolean;
  /** `team_roles.role === "owner"` (or bootstrap owner email) — announcements composer + server RLS. */
  canPostAnnouncements: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [leftTab, setLeftTab] = useState<"inbox" | "threads">("inbox");
  const [conversations, setConversations] = useState<TeamDmConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const activeConversationIdRef = useRef("");
  const [centerMode, setCenterMode] = useState<"dm" | "group">("dm");
  const [issueDrawerOpen, setIssueDrawerOpen] = useState(false);
  const [ownerIntelOpen, setOwnerIntelOpen] = useState(false);
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
  /** New announcements from others while this tab is not active (toggle dot + pulse). */
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false);
  /** New team room chat messages from others while Chat tab is not active. */
  const [hasUnreadTeamChat, setHasUnreadTeamChat] = useState(false);
  const [dmReplyTarget, setDmReplyTarget] = useState<ReplyTarget>(null);
  const [groupReplyTarget, setGroupReplyTarget] = useState<ReplyTarget>(null);
  const [dmAttachments, setDmAttachments] = useState<ChatAttachment[]>([]);
  const [groupAttachments, setGroupAttachments] = useState<ChatAttachment[]>([]);
  const [issueNotes, setIssueNotes] = useState(ISSUE_NOTES_DEMO);
  const [issueDraft, setIssueDraft] = useState("");
  /** Inbox list search + filter (reference: Messenger-style thread list). */
  const [threadSearch, setThreadSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "unread">("all");
  /** Right tactical info column (members / shortcuts); lg+ default open once mounted. */
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const dmScrollRef = useRef<HTMLDivElement | null>(null);
  const groupScrollRef = useRef<HTMLDivElement | null>(null);
  /** On mobile, group/issues render in row 2 below a tall inbox; scroll into view after mode change. */
  const teamChatCenterRef = useRef<HTMLDivElement | null>(null);
  const dmFileInputRef = useRef<HTMLInputElement | null>(null);
  const groupFileInputRef = useRef<HTMLInputElement | null>(null);
  /** Sync guards so double-tap / impatient Enter cannot enqueue two inserts before React re-renders. */
  const groupSendLockRef = useRef(false);
  const dmSendLockRef = useRef(false);
  const ownerDmSendLockRef = useRef(false);
  const [groupSendPending, setGroupSendPending] = useState(false);
  const [dmSendPending, setDmSendPending] = useState(false);
  const [ownerDmSendPending, setOwnerDmSendPending] = useState(false);
  const [ownerActiveConversationId, setOwnerActiveConversationId] = useState("");
  const [ownerReplyDraft, setOwnerReplyDraft] = useState("");
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
    if (typeof window === "undefined") return;
    setInfoPanelOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, []);

  useEffect(() => {
    if (centerMode !== "group") return;
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

  const filteredInboxConversations = useMemo(() => {
    let list = displayedConversations;
    const q = threadSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const name = getCounterpartyName(c.participants).toLowerCase();
        return (
          name.includes(q) ||
          c.preview.toLowerCase().includes(q) ||
          c.topic.toLowerCase().includes(q)
        );
      });
    }
    if (inboxFilter === "unread") list = list.filter((c) => c.unread > 0);
    return list;
  }, [displayedConversations, threadSearch, inboxFilter, userDisplayName]);

  const hasUnreadDMs = useMemo(() => displayedConversations.some((c) => c.unread > 0), [displayedConversations]);

  const statusPipClass = (status: TeamDmConversation["profile"]["status"]) =>
    status === "Active now"
      ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]"
      : status === "Away"
        ? "bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
        : "bg-zinc-600";

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
    if (centerMode !== "group" || groupChannel !== "announcements") return;
    setHasUnreadAnnouncements(false);
    setAnnouncementPings(0);
    try {
      window.localStorage.setItem(LS_TEAM_CHAT_MENTION_UNREAD, "0");
      window.dispatchEvent(new Event("team-chat-mention-unread-updated"));
    } catch {
      /* private mode */
    }
  }, [centerMode, groupChannel]);

  useEffect(() => {
    if (centerMode !== "group" || groupChannel !== "chat") return;
    setHasUnreadTeamChat(false);
  }, [centerMode, groupChannel]);

  useEffect(() => {
    if (groupChannel === "announcements" && !canPostAnnouncements) setGroupReplyTarget(null);
  }, [groupChannel, canPostAnnouncements]);

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
            const authorTc = typeof row.author_id === "string" ? row.author_id : "";
            if (authorTc && authorTc !== userId) {
              const viewingChat = centerModeRef.current === "group" && groupChannelRef.current === "chat";
              if (!viewingChat) setHasUnreadTeamChat(true);
            }
          } else if (ch === "announcements") {
            setAnnouncementMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, { ...ui, replyTo: ui.replyTo }]));
            const authorAnn = typeof row.author_id === "string" ? row.author_id : "";
            if (authorAnn && authorAnn !== userId) {
              const viewingAnnouncements =
                centerModeRef.current === "group" && groupChannelRef.current === "announcements";
              if (!viewingAnnouncements) {
                setHasUnreadAnnouncements(true);
                if (/@everyone\b/i.test(ui.text)) {
                  setAnnouncementPings((p) => p + 1);
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
    if (!canManageRoles || !issueDrawerOpen) return;
    window.localStorage.setItem("teamChatIssueUnreadOwner", "0");
    window.dispatchEvent(new Event("team-chat-issue-unread-updated"));
  }, [canManageRoles, issueDrawerOpen]);

  useEffect(() => {
    if (!canManageRoles) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOwnerIntelOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canManageRoles]);

  useEffect(() => {
    if (!issueDrawerOpen && !ownerIntelOpen && !infoPanelOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIssueDrawerOpen(false);
      setOwnerIntelOpen(false);
      setInfoPanelOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [issueDrawerOpen, ownerIntelOpen, infoPanelOpen]);

  /** Runs after a successful insert — do not await from send handlers so the composer unlocks immediately. */
  const scheduleDmInboxRefresh = (conversationId: string) => {
    const sb = createSupabaseBrowserClient();
    void (async () => {
      try {
        await markDmConversationRead(sb, conversationId, userId);
        const prof = await fetchProfilesForChat(sb);
        if (!prof.error && prof.data) {
          const rows = prof.data as ProfileRow[];
          const dm = await buildDmConversations(sb, userId, userDisplayName, rows);
          if (!dm.error) setConversations(dm.conversations);
          if (canManageRoles) {
            const all = await buildDmConversations(sb, userId, userDisplayName, rows, {
              viewAllConversationsAsOwner: true,
            });
            if (!all.error) setOwnerPanelConversations(all.conversations);
          }
        }
      } catch (e) {
        console.error("[dm inbox refresh]", e);
      }
    })();
  };

  const submitOwnerReply = () => {
    const msg = ownerReplyDraft.trim();
    if (!msg || !ownerActiveConversation) return;
    if (ownerDmSendLockRef.current) return;
    ownerDmSendLockRef.current = true;
    setOwnerDmSendPending(true);
    const snap = ownerReplyDraft;
    const convId = ownerActiveConversation.id;
    setOwnerReplyDraft("");
    const sb = createSupabaseBrowserClient();
    void (async () => {
      try {
        const { error } = await insertDmMessage(sb, convId, userId, msg, null);
        if (error) {
          console.error("[owner dm]", error.message);
          setOwnerReplyDraft(snap);
          return;
        }
        scheduleDmInboxRefresh(convId);
      } finally {
        ownerDmSendLockRef.current = false;
        setOwnerDmSendPending(false);
      }
    })();
  };

  const sendGroupMessage = () => {
    const msg = groupDraft.trim();
    if (!msg && groupAttachments.length === 0) return;
    if (groupSendLockRef.current) return;

    const channel = groupChannel === "announcements" ? "announcements" : "team_chat";
    if (channel === "announcements" && !canPostAnnouncements) return;

    groupSendLockRef.current = true;
    setGroupSendPending(true);

    const textBody = msg || "(attachment)";
    const replyPayload = groupReplyTarget ? { from: groupReplyTarget.from, text: groupReplyTarget.text } : null;
    const supabase = createSupabaseBrowserClient();
    const draftSnap = groupDraft;
    const replySnap = groupReplyTarget;
    const attSnap = [...groupAttachments];

    setGroupDraft("");
    setGroupReplyTarget(null);
    setGroupAttachments([]);

    void (async () => {
      try {
        const { data, error } = await insertTeamRoomMessage(supabase, channel, userId, textBody, replyPayload);
        if (error) {
          console.error("[team chat]", error.message);
          if (isTeamChatSchemaError(error.message)) {
            setChatSchemaError(
              "Team chat tables are missing. Run web/supabase/team-chat-messages.sql in Supabase, then enable Realtime on team_room_messages and dm_messages.",
            );
          }
          setGroupDraft(draftSnap);
          setGroupReplyTarget(replySnap);
          setGroupAttachments(attSnap);
          return;
        }
        if (data) {
          const ui = teamMessageFromPayload(data as Record<string, unknown>, nameByIdRef.current, userId, userDisplayName);
          if (ui) {
            const row: GroupChannelMessage = {
              ...ui,
              replyTo: ui.replyTo,
              attachments: attSnap.length ? attSnap : undefined,
            };
            if (channel === "team_chat") {
              setGroupMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, row]));
            } else {
              setAnnouncementMessages((prev) => (prev.some((m) => m.dbId === ui.dbId) ? prev : [...prev, row]));
            }
          }
        }
      } finally {
        groupSendLockRef.current = false;
        setGroupSendPending(false);
      }
    })();
  };

  const sendDmMessage = () => {
    const supabase = createSupabaseBrowserClient();

    if (activeConversation) {
      const msg = draft.trim();
      if (!msg && dmAttachments.length === 0) return;
      if (dmSendLockRef.current) return;

      dmSendLockRef.current = true;
      setDmSendPending(true);

      const textBody = msg || "(attachment)";
      const replyPayload = dmReplyTarget ? { from: dmReplyTarget.from, text: dmReplyTarget.text } : null;
      const draftSnap = draft;
      const replySnap = dmReplyTarget;
      const attSnap = [...dmAttachments];
      const otherUserId = activeConversation.otherUserId;

      setDraft("");
      setDmReplyTarget(null);
      setDmAttachments([]);

      void (async () => {
        try {
          const { id: convId, error: convErr } = await getOrCreateDmConversationId(supabase, userId, otherUserId);
          if (convErr || !convId) {
            console.error("[dm]", convErr?.message);
            setDraft(draftSnap);
            setDmReplyTarget(replySnap);
            setDmAttachments(attSnap);
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
            setDraft(draftSnap);
            setDmReplyTarget(replySnap);
            setDmAttachments(attSnap);
            return;
          }
          scheduleDmInboxRefresh(convId);
        } finally {
          dmSendLockRef.current = false;
          setDmSendPending(false);
        }
      })();
      return;
    }

    const msg = newMessageBody.trim();
    if (!msg && dmAttachments.length === 0) return;
    if (resolvedDmPeerId === NO_DM_PEER_PLACEHOLDER) return;
    if (dmSendLockRef.current) return;

    dmSendLockRef.current = true;
    setDmSendPending(true);

    const textBody = msg || "(attachment)";
    const bodySnap = newMessageBody;
    const attSnap = [...dmAttachments];

    setNewMessageBody("");
    setDmAttachments([]);

    void (async () => {
      try {
        const { id: convId, error: convErr } = await getOrCreateDmConversationId(supabase, userId, resolvedDmPeerId);
        if (convErr || !convId) {
          console.error("[dm]", convErr?.message);
          setNewMessageBody(bodySnap);
          setDmAttachments(attSnap);
          return;
        }
        const { error } = await insertDmMessage(supabase, convId, userId, textBody, null);
        if (error) {
          console.error("[dm]", error.message);
          setNewMessageBody(bodySnap);
          setDmAttachments(attSnap);
          return;
        }
        setActiveConversationId(convId);
        scheduleDmInboxRefresh(convId);
      } finally {
        dmSendLockRef.current = false;
        setDmSendPending(false);
      }
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

  const openIssueCount = issueNotes.filter((n) => n.status !== "Fixed").length;

  const showAnnounceUnread =
    (hasUnreadAnnouncements || announcementPings > 0) && (centerMode !== "group" || groupChannel !== "announcements");
  const showChatUnread = hasUnreadTeamChat && (centerMode !== "group" || groupChannel !== "chat");

  const onSelectAnnouncements = () => {
    setGroupChannel("announcements");
  };

  const onSelectTeamChat = () => {
    setGroupChannel("chat");
  };

  const renderGroupChannelPill = (fullWidth: boolean) => (
    <div
      className={cn(
        "relative isolate grid h-10 w-full shrink-0 grid-cols-2 rounded-full border border-white/[0.08] bg-zinc-900/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-11",
        fullWidth ? "max-w-full" : "max-w-[232px] sm:max-w-[248px]",
      )}
      role="tablist"
      aria-label="Team room channel"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-full bg-[#9333ea] shadow-[0_0_28px_-6px_rgba(147,51,234,0.65)]"
        initial={false}
        animate={{
          left: groupChannel === "announcements" ? 4 : "calc(50% + 2px)",
          width: "calc(50% - 6px)",
        }}
        transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.72 }}
        style={{ position: "absolute" }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={groupChannel === "announcements"}
        onClick={onSelectAnnouncements}
        className={cn(
          "relative z-10 inline-flex min-h-0 items-center justify-center rounded-full px-3 text-[13px] font-medium tracking-tight transition-colors sm:text-sm",
          groupChannel === "announcements" ? "text-white" : "text-zinc-400 hover:text-zinc-200",
        )}
      >
        <span
          className={cn(
            "relative px-1",
            showAnnounceUnread && groupChannel !== "announcements" && "animate-pulse",
          )}
        >
          Announce
          {showAnnounceUnread && groupChannel !== "announcements" ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.95)]"
              aria-hidden
            />
          ) : null}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={groupChannel === "chat"}
        onClick={onSelectTeamChat}
        className={cn(
          "relative z-10 inline-flex min-h-0 items-center justify-center rounded-full px-3 text-[13px] font-medium tracking-tight transition-colors sm:text-sm",
          groupChannel === "chat" ? "text-white" : "text-zinc-400 hover:text-zinc-200",
        )}
      >
        <span
          className={cn(
            "relative px-1",
            showChatUnread && groupChannel !== "chat" && "animate-pulse",
          )}
        >
          Chat
          {showChatUnread && groupChannel !== "chat" ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.85)]"
              aria-hidden
            />
          ) : null}
        </span>
      </button>
    </div>
  );

  const groupChannelPill = renderGroupChannelPill(false);

  const infoPanelInner = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {centerMode === "dm" && activeConversation ? (
        <div className="mx-3 mb-4 mt-3 sm:mx-4">
          <div className="rounded-2xl border border-white/5 bg-[rgba(20,20,20,0.8)] p-5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <div className="flex flex-col items-center">
              <div className="relative">
                <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-gradient-to-br from-violet-600/35 to-zinc-900/80 text-lg font-semibold text-violet-100 ring-1 ring-white/10">
                  {activeConversation.profile.initials}
                </span>
                <span
                  className={cn(
                    "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[rgba(20,20,20,0.92)]",
                    statusPipClass(activeConversation.profile.status),
                  )}
                  aria-hidden
                />
              </div>
              <p className="mt-4 text-center text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">
                {getCounterpartyName(activeConversation.participants)}
              </p>
              <p className="mt-1 text-center text-sm text-zinc-500">{activeConversation.profile.role}</p>
              <p className="mt-0.5 text-center text-sm text-zinc-400">{activeConversation.profile.status}</p>
            </div>
            <div className="mt-5 border-t border-white/[0.06] pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Thread</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300 sm:text-[15px]">{activeConversation.topic}</p>
            </div>
            <div className="mt-5 flex flex-col gap-2 border-t border-white/[0.06] pt-5">
              <button
                type="button"
                onClick={() => setIssueDrawerOpen(true)}
                className="min-h-[2.75rem] w-full rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-center text-sm font-medium text-zinc-400 transition hover:border-white/[0.14] hover:bg-white/[0.03] hover:text-zinc-200"
              >
                Issue board
              </button>
              {canManageRoles ? (
                <button
                  type="button"
                  onClick={() => setOwnerIntelOpen(true)}
                  className="min-h-[2.75rem] w-full rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-center text-sm font-medium text-zinc-400 transition hover:border-white/[0.14] hover:bg-white/[0.03] hover:text-zinc-200"
                >
                  Owner intel
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : centerMode === "group" ? (
        <>
          <div className="border-b border-white/[0.06] px-4 py-4 text-center">
            <Users className="mx-auto h-8 w-8 text-emerald-400/90" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-semibold text-zinc-100">Team room</p>
            <p className="mt-1 font-mono text-xs text-zinc-500 sm:text-sm">
              {groupChannel === "announcements" ? "Announcements" : "Team chat"}
            </p>
          </div>
          <div className="px-3 py-3 sm:px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-sm">Channels</p>
            <div className="mt-2 w-full">{renderGroupChannelPill(true)}</div>
          </div>
          <div className="px-3 pb-4 sm:px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-sm">Online</p>
            <div className="mt-2 space-y-1.5">
              {["Jaylan", "Mykala", "Jon", "Richard"].map((name) => (
                <div
                  key={`info-online-${name}`}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2"
                >
                  <span className="text-sm text-zinc-300 sm:text-[15px]">{name}</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-auto border-t border-white/[0.06] px-3 py-3 sm:px-4">
            <button
              type="button"
              onClick={() => setIssueDrawerOpen(true)}
              className="min-h-[2.75rem] w-full rounded-xl border border-amber-400/25 bg-amber-500/10 py-2.5 text-sm font-semibold text-amber-100/95 transition hover:bg-amber-500/16 sm:text-[15px]"
            >
              Open issue board
            </button>
            {canManageRoles ? (
              <button
                type="button"
                onClick={() => setOwnerIntelOpen(true)}
                className="mt-2 min-h-[2.75rem] w-full rounded-xl border border-violet-500/30 bg-violet-500/10 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/16 sm:text-[15px]"
              >
                Owner command (⌘K)
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <MessageCircle className="h-10 w-10 text-zinc-700" strokeWidth={1.25} />
          <p className="mt-3 text-sm font-medium text-zinc-400">No thread selected</p>
            <p className="mt-1 font-mono text-xs text-zinc-600 sm:text-sm">Pick a DM or open the team room</p>
          <button
            type="button"
            onClick={() => setIssueDrawerOpen(true)}
            className="mt-4 rounded-full border border-white/[0.1] px-4 py-1.5 text-xs text-zinc-400 transition hover:border-amber-400/40 hover:text-amber-100"
          >
            Issue board
          </button>
        </div>
      )}
    </div>
  );

  return (
    <DeskShell
      sections={commandDeskSections({ canManageRoles })}
      sidebarFooter={sidebarFooter}
      sidebarBelowFooter={canManageRoles ? <OwnerRoofingLeadsFooterLink /> : null}
    >
      <div className="@container relative flex min-h-0 w-full min-w-0 flex-1 flex-col bg-[#000000] text-zinc-100">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-black/80 px-3 py-2.5 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">Messaging</p>
            <h1 className="truncate text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">Team Chat</h1>
          </div>
          <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              strokeWidth={2}
              aria-hidden
            />
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Filter conversations…"
              className="w-full rounded-full border border-white/[0.08] bg-white/[0.04] py-2 pl-10 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              aria-label="Filter conversations"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setIssueDrawerOpen(true);
              setActiveConversationId("");
            }}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition hover:border-amber-400/40 hover:text-amber-100 sm:h-11 sm:w-11"
            title="Issue board"
            aria-label="Open issue board"
          >
            <Bell className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5" strokeWidth={2} />
            {openIssueCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[10px] font-bold text-white sm:h-5 sm:min-w-5 sm:text-[11px]">
                {openIssueCount > 9 ? "9+" : openIssueCount}
              </span>
            ) : null}
          </button>
          {canManageRoles ? (
            <button
              type="button"
              onClick={() => setOwnerIntelOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200 transition hover:bg-violet-500/18 sm:h-11 sm:w-11"
              title="Owner intel (⌘K)"
              aria-label="Open owner command intel"
            >
              <Command className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5" strokeWidth={2} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setInfoPanelOpen((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition hover:text-zinc-100 sm:h-11 sm:w-11 lg:border-white/[0.1]"
            title={infoPanelOpen ? "Hide details" : "Show details"}
            aria-expanded={infoPanelOpen}
            aria-label={infoPanelOpen ? "Hide details panel" : "Show details panel"}
          >
            {infoPanelOpen ? <PanelRightClose className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5" strokeWidth={2} /> : <PanelRightOpen className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5" strokeWidth={2} />}
          </button>
        </header>
        {chatSchemaError ? (
          <p className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-100/95">{chatSchemaError}</p>
        ) : null}

        {infoPanelOpen ? (
          <button
            type="button"
            aria-label="Close details panel"
            className="fixed inset-0 z-[54] bg-black/55 lg:hidden"
            onClick={() => setInfoPanelOpen(false)}
          />
        ) : null}

        <section
          className={cn(
            "grid min-h-0 min-w-0 flex-1 overflow-hidden",
            "min-h-[min(64dvh,calc(100dvh-11rem))] lg:h-[min(78dvh,calc(100dvh-8rem))] lg:max-h-[min(78dvh,calc(100dvh-8rem))]",
            infoPanelOpen
              ? "grid-cols-1 lg:grid-cols-[288px_minmax(0,1fr)_300px]"
              : "grid-cols-1 lg:grid-cols-[288px_minmax(0,1fr)]",
          )}
        >
          <aside
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden border-white/[0.06] bg-[#0a0a0a]/85 backdrop-blur-md",
              "border-b lg:border-b-0 lg:border-r",
              centerMode === "group" ? "max-lg:min-h-0" : "max-lg:min-h-[min(48dvh,420px)]",
            )}
          >
            <div className="flex shrink-0 items-center justify-between px-3 pb-1.5 pt-3 sm:px-3.5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Chats</h2>
              <button
                type="button"
                onClick={() => {
                  setCenterMode("dm");
                  setActiveConversationId("");
                  setDmReplyTarget(null);
                  setDraft("");
                }}
                className="rounded-full p-2.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-violet-300"
                title="New message"
                aria-label="Start new direct message"
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <div className="flex gap-1.5 px-2 pb-2 sm:px-2.5">
              <button
                type="button"
                onClick={() => setLeftTab("inbox")}
                className={cn(
                  "relative flex-1 rounded-full py-2.5 text-xs font-bold uppercase tracking-wider transition sm:py-3 sm:text-[13px]",
                  leftTab === "inbox"
                    ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-500/40"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                )}
              >
                <span className="relative inline-block">
                  Inbox
                  {hasUnreadDMs && leftTab !== "inbox" ? (
                    <span
                      className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.9)]"
                      aria-hidden
                    />
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLeftTab("threads")}
                className={cn(
                  "flex-1 rounded-full py-2.5 text-xs font-bold uppercase tracking-wider transition sm:py-3 sm:text-[13px]",
                  leftTab === "threads"
                    ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-500/40"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                )}
              >
                Notes
              </button>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2">
            {leftTab === "inbox" ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <button
                    type="button"
                    onClick={() => setInboxFilter("all")}
                    className={cn(
                      "inline-flex min-h-[2.375rem] items-center rounded-full px-4 py-2 font-mono text-xs font-semibold uppercase leading-none tracking-wide transition sm:min-h-[2.5rem] sm:px-4 sm:text-[13px]",
                      inboxFilter === "all"
                        ? "bg-white/[0.1] text-zinc-50 ring-1 ring-violet-500/50"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setInboxFilter("unread")}
                    className={cn(
                      "inline-flex min-h-[2.375rem] items-center rounded-full px-4 py-2 font-mono text-xs font-semibold uppercase leading-none tracking-wide transition sm:min-h-[2.5rem] sm:px-4 sm:text-[13px]",
                      inboxFilter === "unread"
                        ? "bg-white/[0.1] text-zinc-50 ring-1 ring-emerald-500/50"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    Unread
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCenterMode("group");
                    setGroupChannel("chat");
                    setActiveConversationId("");
                  }}
                  className={cn(
                    "mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition sm:py-3.5",
                    centerMode === "group"
                      ? "bg-emerald-500/12 ring-1 ring-emerald-400/40"
                      : "bg-white/[0.04] hover:bg-white/[0.07]",
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
                    <Users className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100 sm:text-[15px]">Team room</p>
                    <p className="truncate font-mono text-xs text-zinc-500 sm:text-[13px]">Announcements & group chat</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300 sm:text-[13px]">
                    Live
                  </span>
                </button>
                <div className="relative mb-2 sm:hidden">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" strokeWidth={2} />
                  <input
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full rounded-full border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none"
                    aria-label="Search conversations"
                  />
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                  {filteredInboxConversations.map((t) => {
                    const active = centerMode === "dm" && activeConversationId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setCenterMode("dm");
                          setActiveConversationId(t.id);
                          setConversations((prev) => prev.map((c) => (c.id === t.id ? { ...c, unread: 0 } : c)));
                        }}
                        className={cn(
                          "group relative w-full rounded-xl px-3 py-2.5 text-left transition sm:py-3",
                          active
                            ? "bg-white/[0.08] shadow-[inset_3px_0_0_0_rgba(52,211,153,0.9)]"
                            : "hover:bg-white/[0.05]",
                          t.unread > 0 && !active ? "bg-emerald-950/25" : null,
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="relative mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-zinc-200 ring-1 ring-white/[0.08] sm:h-12 sm:w-12 sm:text-sm">
                            {t.profile.initials}
                            <span
                              className={cn(
                                "absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a0a]",
                                statusPipClass(t.profile.status),
                              )}
                              aria-hidden
                            />
                          </span>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-[15px] font-semibold text-zinc-50 sm:text-base">{getCounterpartyName(t.participants)}</p>
                              <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500 sm:text-[13px]">{t.time}</span>
                            </div>
                            <p className="mt-0.5 truncate text-sm text-zinc-400 sm:text-[15px]">{t.preview}</p>
                          </div>
                          {t.unread > 0 ? (
                            <span className="mt-1 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 px-1 font-mono text-xs font-bold text-white sm:h-7 sm:min-w-7 sm:text-[13px]">
                              {t.unread > 9 ? "9+" : t.unread}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                  {filteredInboxConversations.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-4 text-center text-sm text-zinc-500">
                      {displayedConversations.length === 0
                        ? "No direct messages yet."
                        : "No matches for this filter."}
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
            <div className="mt-auto shrink-0 border-t border-white/[0.06] bg-[#0a0a0a]/95 px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-2.5 sm:pb-4">
              <button
                type="button"
                onClick={() => {
                  setIssueDrawerOpen(true);
                  setActiveConversationId("");
                }}
                className="flex min-h-[3rem] w-full items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.1] px-4 py-3 text-left transition hover:border-amber-400/45 hover:bg-amber-500/14 sm:min-h-[3.25rem] sm:py-3.5"
              >
                <span className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-100 sm:text-[15px]">Issue board</span>
                {openIssueCount > 0 ? (
                  <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 px-2 font-mono text-xs font-bold text-black sm:text-sm">
                    {openIssueCount}
                  </span>
                ) : null}
              </button>
            </div>
          </aside>

          <div
            ref={teamChatCenterRef}
            className={cn(
              "relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#000000]",
              "min-h-[min(52dvh,520px)] lg:min-h-0 lg:h-full",
              centerMode === "group" && "max-lg:scroll-mt-2",
            )}
          >
            <HelpMarker
              accent="crimson"
              className="right-2 top-2 z-10 opacity-90 lg:right-3 lg:top-3"
              text="TEAM CHAT: Use this area to ask teammates for help, share context before handoffs, and unblock deals faster. Keep messages short, action-focused, and tied to the account."
            />
            {centerMode === "group" ? null : (
              <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-black/40 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-3.5">
                {activeConversation ? (
                  <>
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sm font-semibold text-zinc-200 ring-1 ring-white/[0.1] sm:h-12 sm:w-12">
                      {activeConversation.profile.initials}
                      <span
                        className={cn(
                          "absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-black",
                          statusPipClass(activeConversation.profile.status),
                        )}
                        aria-hidden
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">
                        {getCounterpartyName(activeConversation.participants)}
                      </h2>
                      <p className="font-mono text-xs text-zinc-500 sm:text-sm">{activeConversation.topic}</p>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-zinc-100 sm:text-lg">New message</h2>
                    <p className="font-mono text-xs text-zinc-600 sm:text-sm">Select a teammate to start</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCenterMode("dm");
                    setActiveConversationId("");
                  }}
                  className="shrink-0 rounded-full border border-violet-500/35 bg-violet-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-violet-100 transition hover:bg-violet-500/18 sm:text-sm sm:py-2.5"
                >
                  New
                </button>
              </div>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {centerMode === "group" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 sm:text-xs">Team room</p>
                      <h2 className="truncate text-base font-semibold text-zinc-50 sm:text-lg">Group messaging</h2>
                      <p className="font-mono text-xs tabular-nums text-zinc-500 sm:text-sm">{activeGroupMessages.length} messages</p>
                    </div>
                    {groupChannelPill}
                  </div>
                  <div
                    ref={groupScrollRef}
                    className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3"
                  >
                    {groupChannel === "announcements" ? (
                      <div className="space-y-2">
                        {activeGroupMessages.map((m, idx) => (
                          <div
                            key={m.dbId ?? `group-ann-${idx}`}
                            onClick={() => setGroupReplyTarget({ from: m.from, text: m.text })}
                            className="cursor-pointer rounded-2xl border border-white/[0.06] bg-white/[0.04] px-3 py-3 backdrop-blur-sm transition hover:bg-white/[0.07] sm:px-3.5 sm:py-3.5"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[15px] font-semibold text-violet-200/90 sm:text-base">{m.from}</p>
                              <span className="font-mono text-xs tabular-nums text-zinc-500 sm:text-sm">{m.time}</span>
                            </div>
                            {m.replyTo ? (
                              <div className="mt-2 rounded-lg bg-black/35 px-2.5 py-1.5 text-sm text-zinc-400">
                                <span className="text-violet-300/90">↪ {m.replyTo.from}</span> {m.replyTo.text}
                              </div>
                            ) : null}
                            <p className="mt-2 text-[15px] leading-relaxed text-zinc-200 sm:text-base">{renderTextWithLinks(m.text)}</p>
                            {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                              <div className="mt-2 space-y-1.5">
                                {m.attachments.map((att) => (
                                  <div key={`${m.time}-${att.url}`} className="rounded-lg bg-black/35 p-1.5">
                                    {att.kind === "image" ? (
                                      <img src={att.url} alt={att.name} className="max-h-52 w-full rounded-md object-cover" />
                                    ) : att.kind === "video" ? (
                                      <video src={att.url} controls className="max-h-52 w-full rounded-md object-cover" />
                                    ) : (
                                      <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-violet-300 underline">
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
                      <div className="space-y-2">
                        {activeGroupMessages.map((m, idx) => (
                          <div
                            key={m.dbId ?? `group-chat-${idx}`}
                            onClick={() => setGroupReplyTarget({ from: m.from, text: m.text })}
                            className="cursor-pointer rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-3 transition hover:bg-white/[0.06] sm:px-3.5 sm:py-3.5"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[15px] font-semibold text-emerald-200/90 sm:text-base">{m.from}</p>
                              <span className="font-mono text-xs tabular-nums text-zinc-500 sm:text-sm">{m.time}</span>
                            </div>
                            {m.replyTo ? (
                              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-black/35 px-2.5 py-1.5 text-sm text-zinc-400">
                                <svg viewBox="0 0 28 22" className="mt-0.5 h-4 w-5 shrink-0 text-emerald-400/70">
                                  <path d="M1 1 H14 Q22 1 22 9 V18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                  <path d="M17 13 L22 18 L27 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <p>
                                  <span className="font-semibold text-emerald-300/90">{m.replyTo.from}</span> {m.replyTo.text}
                                </p>
                              </div>
                            ) : null}
                            <p className="mt-2 text-[15px] leading-relaxed text-zinc-200 sm:text-base">{renderTextWithLinks(m.text)}</p>
                            {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                              <div className="mt-2 space-y-1.5">
                                {m.attachments.map((att) => (
                                  <div key={`${m.time}-${att.url}`} className="rounded-lg bg-black/35 p-1.5">
                                    {att.kind === "image" ? (
                                      <img src={att.url} alt={att.name} className="max-h-52 w-full rounded-md object-cover" />
                                    ) : att.kind === "video" ? (
                                      <video src={att.url} controls className="max-h-52 w-full rounded-md object-cover" />
                                    ) : (
                                      <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 underline">
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
                  <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0a0a]/98 px-3 py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] backdrop-blur-xl sm:px-4 sm:py-3">
                    {groupReplyTarget ? (
                      <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border-l-2 border-violet-500/50 bg-black/40 px-3 py-2 text-sm text-zinc-400">
                        <p>
                          <span className="text-violet-200">↪ {groupReplyTarget.from}:</span> {groupReplyTarget.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => setGroupReplyTarget(null)}
                          className="shrink-0 font-mono text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    {groupChannel === "announcements" && !canPostAnnouncements ? (
                      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/35 px-4 py-4 backdrop-blur-sm">
                        <p className="text-center text-sm leading-relaxed text-zinc-400">
                          Only administrators can post announcements.
                        </p>
                        <p className="mt-2 text-center font-mono text-[11px] text-zinc-600 sm:text-xs">
                          You can read every announcement in this channel.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-2 rounded-[22px] border border-white/[0.1] bg-black/60 py-2 pl-2.5 pr-2 backdrop-blur-md sm:pl-3">
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
                            disabled={groupSendPending}
                            onClick={() => groupFileInputRef.current?.click()}
                            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40 sm:h-11 sm:w-11"
                            title="Attach"
                            aria-label="Attach file to group message"
                          >
                            <Paperclip className="h-5 w-5" strokeWidth={2} />
                          </button>
                          <textarea
                            rows={2}
                            placeholder={
                              groupChannel === "announcements"
                                ? "Announcement… (@everyone supported)"
                                : "Message the team…"
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
                              if (e.key !== "Enter" || e.shiftKey) return;
                              if (groupSendPending) {
                                e.preventDefault();
                                return;
                              }
                              e.preventDefault();
                              sendGroupMessage();
                            }}
                            className="min-h-[44px] w-full min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 sm:min-h-[48px] sm:text-[17px]"
                          />
                          <button
                            type="button"
                            disabled={groupSendPending}
                            onClick={() => sendGroupMessage()}
                            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_0_16px_-4px_rgba(139,92,246,0.7)] transition hover:bg-violet-500 disabled:opacity-40 sm:h-11 sm:w-11"
                            aria-label="Send message"
                          >
                            <Send className="h-5 w-5" strokeWidth={2} />
                          </button>
                        </div>
                        {groupAttachments.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {groupAttachments.map((att, idx) => (
                              <button
                                key={`${att.url}-${idx}`}
                                type="button"
                                onClick={() => setGroupAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                className="rounded-md border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 font-mono text-xs text-zinc-400"
                                title="Remove attachment"
                              >
                                {att.kind.toUpperCase()} · {att.name.slice(0, 20)}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-2 font-mono text-[11px] text-zinc-500 sm:text-xs">
                          Enter send · Shift+Enter newline
                          {groupChannel === "announcements" && canPostAnnouncements ? " · @everyone pings the team" : null}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
              {centerMode !== "dm"
                ? null
                : activeConversation ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                  <div
                    ref={dmScrollRef}
                    className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-3 overflow-x-hidden overflow-y-auto overscroll-contain bg-black px-3 py-2"
                  >
                  {activeConversation.messages.map((m, idx) => {
                    const isYou = m.from.toLowerCase() === userDisplayName.toLowerCase();
                    const bubbleClass = isYou
                      ? "border border-violet-500/20 bg-gradient-to-br from-violet-600/80 via-violet-900/70 to-black text-white shadow-[0_16px_40px_-24px_rgba(109,40,217,0.65)]"
                      : "border border-white/[0.08] bg-white/[0.05] text-zinc-100 backdrop-blur-sm";
                    return (
                      <motion.div
                        key={`${m.from}-${idx}-${m.text}`}
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 520, damping: 34 }}
                        className={`flex w-full items-end gap-2 ${isYou ? "justify-end" : "justify-start"}`}
                      >
                        {!isYou ? (
                          <span
                            className="mb-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06] text-xs font-semibold tracking-tight text-zinc-300 sm:h-11 sm:w-11 sm:text-sm"
                            aria-hidden
                          >
                            {displayInitials(m.from)}
                          </span>
                        ) : null}
                        <div
                          className={cn(
                            "flex max-w-[min(82%,28rem)] flex-col",
                            isYou ? "items-end" : "items-start",
                          )}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setDmReplyTarget({ from: m.from, text: m.text })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDmReplyTarget({ from: m.from, text: m.text });
                              }
                            }}
                            className={`w-full cursor-pointer rounded-[18px] px-3.5 py-3 outline-none transition hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-violet-500/40 sm:px-4 sm:py-3.5 ${bubbleClass}`}
                          >
                            {m.replyTo ? (
                              <div className={`mb-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${isYou ? "bg-black/25 text-violet-100/90" : "bg-black/30 text-zinc-400"}`}>
                                <svg viewBox="0 0 28 22" className="mt-0.5 h-4 w-5 shrink-0 opacity-70">
                                  <path d="M1 1 H14 Q22 1 22 9 V18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                  <path d="M17 13 L22 18 L27 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <p>
                                  <span className="font-medium opacity-90">{m.replyTo.from}</span> {m.replyTo.text}
                                </p>
                              </div>
                            ) : null}
                            <p className="text-[15px] leading-relaxed sm:text-base">{renderTextWithLinks(m.text)}</p>
                            {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                              <div className="mt-2 space-y-1.5">
                                {m.attachments.map((att) => (
                                  <div
                                    key={`${m.from}-${att.url}`}
                                    className="rounded-lg border border-white/10 bg-black/25 p-1.5"
                                  >
                                    {att.kind === "image" ? (
                                      <img src={att.url} alt={att.name} className="max-h-56 max-w-full rounded-md object-contain" />
                                    ) : att.kind === "video" ? (
                                      <video src={att.url} controls className="max-h-56 w-full max-w-full rounded-md object-contain" />
                                    ) : (
                                      <a href={att.url} target="_blank" rel="noreferrer" className="break-all text-xs text-violet-200/90 underline">
                                        {att.name}
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              "mt-1 px-1 font-mono text-[11px] tabular-nums tracking-tight sm:text-xs",
                              isYou ? "text-violet-400/55" : "text-zinc-500",
                            )}
                          >
                            {m.time}
                          </span>
                        </div>
                        {isYou ? (
                          <span
                            className="mb-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/25 bg-violet-950/40 text-xs font-semibold text-violet-200 sm:h-11 sm:w-11 sm:text-sm"
                            aria-hidden
                          >
                            {displayInitials(userDisplayName)}
                          </span>
                        ) : null}
                      </motion.div>
                    );
                  })}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 backdrop-blur-sm sm:p-4">
                  <div className="grid grid-cols-1 gap-3 @min-[960px]:grid-cols-[minmax(0,220px)_minmax(0,1fr)] @min-[960px]:gap-4">
                    <label className="min-w-0 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-sm">
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
                        triggerClassName="normal-case tracking-normal border-white/[0.1] bg-black/40"
                      />
                    </label>
                    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-3 sm:px-4">
                      <p className="truncate text-base font-medium tracking-tight text-zinc-200">{newMessagePeerLabel}</p>
                      <p className="mt-1 font-mono text-xs text-zinc-500 sm:text-sm">Shift+Enter newline · Enter sends from bar below</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {centerMode !== "dm" ? null : (
            <div className="shrink-0 border-t border-white/[0.06] bg-black/80 px-3 py-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom,0px))] backdrop-blur-xl sm:px-4 sm:py-3">
              {activeConversation && dmReplyTarget ? (
                <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border-l-2 border-violet-500/45 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-400">
                  <p>
                    <span className="font-medium text-violet-200/90">↪ {dmReplyTarget.from}:</span> {dmReplyTarget.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDmReplyTarget(null)}
                    className="shrink-0 font-mono text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-2 rounded-[22px] border border-white/[0.1] bg-[#0a0a0a]/90 py-2 pl-2.5 pr-2 backdrop-blur-md sm:pl-3 sm:pr-2.5">
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
                  disabled={dmSendPending}
                  onClick={() => dmFileInputRef.current?.click()}
                  className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40 sm:h-11 sm:w-11"
                  title="Attach file"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-5 w-5" strokeWidth={2} />
                </button>
                <textarea
                  rows={2}
                  placeholder={activeConversation ? "Write a message…" : "Start a conversation…"}
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
                    if (e.key !== "Enter" || e.shiftKey) return;
                    if (dmSendPending) {
                      e.preventDefault();
                      return;
                    }
                    if (!activeConversation && resolvedDmPeerId === NO_DM_PEER_PLACEHOLDER) {
                      e.preventDefault();
                      return;
                    }
                    e.preventDefault();
                    sendDmMessage();
                  }}
                  className="min-h-[48px] min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-base tracking-tight text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 sm:min-h-[52px] sm:text-[17px]"
                />
                <button
                  type="button"
                  disabled={dmSendPending}
                  onClick={() => sendDmMessage()}
                  className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_0_16px_-4px_rgba(139,92,246,0.65)] transition hover:bg-violet-500 disabled:opacity-40 sm:h-11 sm:w-11"
                  aria-label="Send message"
                >
                  <Send className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              {dmAttachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dmAttachments.map((att, idx) => (
                    <button
                      key={`${att.url}-${idx}`}
                      type="button"
                      onClick={() => setDmAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-md border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 font-mono text-xs text-zinc-400"
                      title="Remove attachment"
                    >
                      {att.kind.toUpperCase()} · {att.name.slice(0, 20)}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 font-mono text-[11px] text-zinc-500 sm:text-xs">Enter send · Shift+Enter newline</p>
            </div>
            )}

          </div>

          {infoPanelOpen ? (
            <motion.aside
              initial={{ x: 28, opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
              className="fixed inset-y-0 right-0 z-[58] flex w-[min(92vw,300px)] flex-col border-l border-white/[0.08] bg-[#0a0a0a]/97 backdrop-blur-xl lg:static lg:z-auto lg:h-full lg:w-full lg:max-w-none"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-3 lg:hidden sm:px-4">
                <p className="text-sm font-semibold tracking-tight text-zinc-300 sm:text-base">Room details</p>
                <button
                  type="button"
                  onClick={() => setInfoPanelOpen(false)}
                  className="rounded-full p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              {infoPanelInner}
            </motion.aside>
          ) : null}
        </section>

        <AnimatePresence>
          {issueDrawerOpen ? (
            <>
              <motion.button
                type="button"
                aria-label="Close issue board"
                className="fixed inset-0 z-[120] bg-black/65"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIssueDrawerOpen(false)}
              />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="issue-board-title"
                initial={{ x: "104%" }}
                animate={{ x: 0 }}
                exit={{ x: "104%" }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="fixed right-0 top-0 z-[130] flex h-[100dvh] w-[min(100vw,420px)] flex-col border-l border-[#222] bg-[#111] shadow-[-16px_0_48px_-24px_rgba(0,0,0,0.85)]"
              >
                <div className="flex items-center justify-between border-b border-[#222] px-4 py-3">
                  <div>
                    <p id="issue-board-title" className="text-sm font-semibold tracking-tight text-zinc-100">
                      Issue board
                    </p>
                    <p className="text-[11px] text-zinc-500">Tactical queue · status glow</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIssueDrawerOpen(false)}
                    className="rounded-lg border border-[#222] p-2 text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-200"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                  {issueNotes.map((note) => {
                    const isFixed = note.status === "Fixed";
                    return (
                      <div
                        key={note.id}
                        className={cn(
                          "rounded-lg border border-[#222] bg-[#0a0a0a] p-3",
                          isFixed
                            ? "shadow-[0_0_28px_-10px_rgba(34,197,94,0.55)]"
                            : "shadow-[0_0_24px_-12px_rgba(234,179,8,0.5)]",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              isFixed
                                ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.95)]"
                                : "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]",
                            )}
                          />
                          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{note.status}</span>
                          <span className="ml-auto text-[10px] tabular-nums text-zinc-600">{note.time}</span>
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-zinc-500">{note.author}</p>
                        <p className="mt-1 text-sm leading-relaxed tracking-tight text-zinc-200">{note.text}</p>
                        {note.replies.length > 0 ? (
                          <div className="mt-2 space-y-1 border-t border-[#222] pt-2">
                            {note.replies.map((r, i) => (
                              <p key={`${note.id}-r-${i}`} className="text-xs text-zinc-400">
                                <span className="font-medium text-zinc-300">{r.author}:</span> {r.text}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="tactical-glass-input m-3 shrink-0 rounded-xl p-3">
                  <textarea
                    rows={2}
                    value={issueDraft}
                    onChange={(e) => setIssueDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.shiftKey) return;
                      e.preventDefault();
                      const text = issueDraft.trim();
                      if (!text) return;
                      const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                      setIssueNotes((prev) => [
                        ...prev,
                        {
                          id: `issue-${Date.now()}`,
                          author: userDisplayName,
                          text,
                          status: "Open",
                          time,
                          replies: [],
                        },
                      ]);
                      setIssueDraft("");
                    }}
                    placeholder="Log an issue… Enter to post"
                    className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm tracking-tight text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {canManageRoles && ownerIntelOpen ? (
            <>
              <motion.button
                type="button"
                aria-label="Close owner command"
                className="fixed inset-0 z-[140] bg-black/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOwnerIntelOpen(false)}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="owner-intel-title"
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="fixed left-1/2 top-14 z-[150] flex max-h-[min(85dvh,820px)] w-[min(96vw,920px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[#222] bg-[#111] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#222] px-4 py-3 @min-[960px]:px-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Command</p>
                    <h2 id="owner-intel-title" className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-100 @min-[960px]:text-xl">
                      Internal intelligence feed
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">All org DMs · select a thread · Enter to reply as owner</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOwnerIntelOpen(false)}
                    className="rounded-lg border border-[#222] p-2 text-zinc-500 hover:text-zinc-200"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>

                <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-0 overflow-hidden @min-[960px]:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
                  <div className="min-h-0 border-[#222] @min-[960px]:border-r">
                    <div className="max-h-[40vh] space-y-0 overflow-y-auto @min-[960px]:max-h-none @min-[960px]:h-full">
                      {ownerPanelConversations.length === 0 ? (
                        <div className="p-4 text-xs leading-relaxed text-zinc-500">
                          <p className="font-medium text-zinc-300">No threads yet.</p>
                          <p className="mt-2">
                            Run <code className="rounded bg-black/50 px-1 py-0.5 text-[10px] text-zinc-400">team-chat-messages.sql</code> if
                            owner-wide reads are missing.
                          </p>
                        </div>
                      ) : (
                        ownerPanelConversations.map((c) => (
                          <button
                            key={`owner-panel-${c.id}`}
                            type="button"
                            onClick={() => setOwnerActiveConversationId(c.id)}
                            className={cn(
                              "w-full border-b border-[#222] px-3 py-2 text-left transition hover:bg-[#141414]",
                              ownerActiveConversationId === c.id ? "bg-[#141414]" : "bg-transparent",
                            )}
                          >
                            <p className="truncate text-[11px] font-medium tracking-tight text-zinc-200">{c.participants.join(" · ")}</p>
                            <p className="truncate text-[10px] text-zinc-600">{c.preview}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 min-w-0 flex-col border-t border-[#222] @min-[960px]:border-t-0">
                    <div className="shrink-0 border-b border-[#222] px-4 py-2">
                      <p className="truncate text-xs font-medium text-zinc-300">
                        {ownerActiveConversation ? ownerActiveConversation.participants.join(" · ") : "Select a thread"}
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-2">
                      {ownerActiveConversation?.messages.map((m, idx) => (
                        <div key={`owner-msg-${idx}-${m.text}`} className="rounded-md border border-[#222] bg-[#0a0a0a] px-2 py-1.5">
                          <p className="text-[10px] font-medium text-zinc-500">{m.from}</p>
                          <p className="text-xs leading-snug text-zinc-200">{m.text}</p>
                        </div>
                      )) ?? null}
                    </div>
                    <div className="tactical-glass-input m-3 shrink-0 rounded-xl p-2">
                      <textarea
                        rows={2}
                        value={ownerReplyDraft}
                        onChange={(e) => setOwnerReplyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" || e.shiftKey) return;
                          e.preventDefault();
                          if (ownerDmSendPending) return;
                          submitOwnerReply();
                        }}
                        placeholder="Reply as owner… Enter to send"
                        disabled={ownerDmSendPending}
                        className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm tracking-tight text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
                      />
                      <p className="px-2 pb-1 text-[10px] text-zinc-600">Enter send · Shift+Enter newline</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </div>
    </DeskShell>
  );
}
