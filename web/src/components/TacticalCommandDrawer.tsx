"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { ProfileRow } from "@/lib/profileSelect";
import {
  buildDmConversations,
  fetchProfilesForChat,
  fetchTeamRolesDirectory,
  insertDmMessage,
  profileDisplayName,
  type UiDmConversation,
} from "@/lib/teamChatDb";
import { cn } from "@/lib/utils";
import type { TacticalDrawerTab } from "@/components/DeskLayoutContext";

type IssueNote = {
  id: string;
  author: string;
  text: string;
  status: "Open" | "Reviewing" | "Fixed";
  time: string;
  replies: { author: string; text: string; time: string }[];
};

const ISSUE_SEED: IssueNote[] = [
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

function statusPipClass(status: IssueNote["status"]) {
  if (status === "Fixed") return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]";
  if (status === "Reviewing") return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]";
  return "bg-rose-500 shadow-[0_0_10px_rgba(251,113,133,0.65)]";
}

export function TacticalCommandDrawer({
  open,
  onClose,
  tab,
  onTabChange,
  session,
}: {
  open: boolean;
  onClose: () => void;
  tab: TacticalDrawerTab;
  onTabChange: (t: TacticalDrawerTab) => void;
  session: { userId: string; userDisplayName: string; canManageRoles: boolean };
}) {
  const { userId, userDisplayName, canManageRoles } = session;
  const [issueNotes, setIssueNotes] = useState<IssueNote[]>(ISSUE_SEED);

  useEffect(() => {
    if (open && !canManageRoles && tab === "intel") onTabChange("triage");
  }, [open, canManageRoles, tab, onTabChange]);
  const [issueDraft, setIssueDraft] = useState("");
  const [ownerConversations, setOwnerConversations] = useState<UiDmConversation[]>([]);
  const [ownerActiveId, setOwnerActiveId] = useState("");
  const [ownerReplyDraft, setOwnerReplyDraft] = useState("");
  const [ownerSending, setOwnerSending] = useState(false);
  const ownerLockRef = useRef(false);
  const nameByIdRef = useRef<Map<string, string>>(new Map());

  const ownerActive = useMemo(
    () => ownerConversations.find((c) => c.id === ownerActiveId) ?? ownerConversations[0] ?? null,
    [ownerConversations, ownerActiveId],
  );

  useEffect(() => {
    if (!open || !canManageRoles) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const prof = await fetchProfilesForChat(supabase);
      if (cancelled || prof.error || !prof.data) return;
      const rows = prof.data as ProfileRow[];
      const map = new Map<string, string>();
      for (const p of rows) map.set(p.id, profileDisplayName(p));
      nameByIdRef.current = map;
      const rolesRes = await fetchTeamRolesDirectory(supabase);
      const roleRows = (rolesRes.data ?? []) as Array<{ user_id: string; account_name: string | null }>;
      const all = await buildDmConversations(supabase, userId, userDisplayName, rows, {
        viewAllConversationsAsOwner: true,
        teamRoles: roleRows,
      });
      if (cancelled || all.error) return;
      setOwnerConversations(all.conversations);
      setOwnerActiveId((prev) => prev || all.conversations[0]?.id || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, canManageRoles, userId, userDisplayName]);

  const refreshOwnerInbox = (convId: string) => {
    const sb = createSupabaseBrowserClient();
    void (async () => {
      const prof = await fetchProfilesForChat(sb);
      if (prof.error || !prof.data) return;
      const rows = prof.data as ProfileRow[];
      const rolesRes = await fetchTeamRolesDirectory(sb);
      const roleRows = (rolesRes.data ?? []) as Array<{ user_id: string; account_name: string | null }>;
      const all = await buildDmConversations(sb, userId, userDisplayName, rows, {
        viewAllConversationsAsOwner: true,
        teamRoles: roleRows,
      });
      if (!all.error) setOwnerConversations(all.conversations);
    })();
  };

  const submitOwnerReply = () => {
    const msg = ownerReplyDraft.trim();
    if (!msg || !ownerActive) return;
    if (ownerLockRef.current) return;
    ownerLockRef.current = true;
    setOwnerSending(true);
    const snap = ownerReplyDraft;
    const convId = ownerActive.id;
    setOwnerReplyDraft("");
    const sb = createSupabaseBrowserClient();
    void (async () => {
      try {
        const { error } = await insertDmMessage(sb, convId, userId, msg, null);
        if (error) {
          console.error("[tactical owner dm]", error.message);
          setOwnerReplyDraft(snap);
          return;
        }
        refreshOwnerInbox(convId);
      } finally {
        ownerLockRef.current = false;
        setOwnerSending(false);
      }
    })();
  };

  const toggleIssueFixed = (id: string) => {
    setIssueNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: n.status === "Fixed" ? "Open" : "Fixed" } : n)),
    );
  };

  const postIssue = () => {
    const text = issueDraft.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    setIssueNotes((prev) => [
      ...prev,
      { id: `issue-${Date.now()}`, author: userDisplayName, text, status: "Open", time, replies: [] },
    ]);
    setIssueDraft("");
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close tactical drawer"
            className="fixed inset-0 z-[125] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Tactical command drawer"
            initial={{ x: "105%" }}
            animate={{ x: 0 }}
            exit={{ x: "105%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="fixed right-0 top-0 z-[135] flex h-[100dvh] w-[min(100vw,380px)] flex-col border-l border-white/[0.06] bg-[#0a0a0a]/80 shadow-[-20px_0_60px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
              <div className="flex gap-1 rounded-lg bg-black/40 p-0.5">
                <button
                  type="button"
                  onClick={() => onTabChange("triage")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition",
                    tab === "triage"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  Triage
                </button>
                {canManageRoles ? (
                  <button
                    type="button"
                    onClick={() => onTabChange("intel")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition",
                      tab === "intel"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    Intel
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {tab === "triage" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Issue triage</p>
                  {issueNotes.map((note) => (
                    <div
                      key={note.id}
                      className="group relative rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 backdrop-blur-sm"
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", statusPipClass(note.status))} />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[9px] tabular-nums text-zinc-600">{note.time}</p>
                          <p className="text-[10px] text-zinc-500">{note.author}</p>
                          <p className="mt-1 text-xs leading-snug tracking-tight text-zinc-200">{note.text}</p>
                        </div>
                        <button
                          type="button"
                          title={note.status === "Fixed" ? "Reopen" : "Mark fixed"}
                          onClick={() => toggleIssueFixed(note.id)}
                          className={cn(
                            "shrink-0 rounded-md p-1.5 transition",
                            note.status === "Fixed"
                              ? "text-emerald-400"
                              : "text-zinc-600 opacity-60 hover:opacity-100 group-hover:text-zinc-300",
                          )}
                        >
                          <Check className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/[0.06] bg-black/30 px-3 py-2 backdrop-blur-md">
                  <textarea
                    rows={2}
                    value={issueDraft}
                    onChange={(e) => setIssueDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        postIssue();
                      }
                    }}
                    placeholder="Log issue · Enter"
                    className="w-full resize-none rounded-lg border border-white/[0.06] bg-transparent px-2 py-1.5 font-sans text-xs tracking-tight text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                  />
                </div>
              </div>
            ) : canManageRoles ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <p className="shrink-0 px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Stealth monitor · DMs
                </p>
                <div className="min-h-0 max-h-[38vh] space-y-0 overflow-y-auto border-b border-white/[0.06]">
                  {ownerConversations.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-zinc-600">No threads loaded.</p>
                  ) : (
                    ownerConversations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setOwnerActiveId(c.id)}
                        className={cn(
                          "w-full border-b border-white/[0.04] px-2.5 py-1.5 text-left transition hover:bg-white/[0.04]",
                          ownerActiveId === c.id ? "bg-white/[0.06]" : "",
                        )}
                      >
                        <p className="truncate text-[11px] font-medium tracking-tight text-zinc-200">
                          {c.participants.join(" · ")}
                        </p>
                        <p className="truncate font-mono text-[9px] text-zinc-600">{c.preview}</p>
                      </button>
                    ))
                  )}
                </div>
                {ownerActive ? (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 480, damping: 32 }}
                    className="m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-black/50 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.85)]"
                  >
                    <p className="shrink-0 truncate border-b border-white/[0.06] px-2 py-1.5 text-[10px] font-medium text-zinc-400">
                      PiP · {ownerActive.participants.join(" · ")}
                    </p>
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
                      {ownerActive.messages.map((m, idx) => (
                        <div key={`${idx}-${m.text}`} className="rounded border border-white/[0.04] bg-white/[0.02] px-2 py-1">
                          <p className="text-[9px] font-medium text-zinc-500">{m.from}</p>
                          <p className="text-[11px] text-zinc-200">{m.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="shrink-0 border-t border-white/[0.06] p-2">
                      <textarea
                        rows={2}
                        value={ownerReplyDraft}
                        disabled={ownerSending}
                        onChange={(e) => setOwnerReplyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitOwnerReply();
                          }
                        }}
                        placeholder="Reply as owner · Enter"
                        className="w-full resize-none rounded-md border border-transparent bg-white/[0.04] px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/25 focus:outline-none"
                      />
                    </div>
                  </motion.div>
                ) : null}
              </div>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
