"use client";

/**
 * Lead side-drawer — CRM engine UI (always-on when a row is selected):
 * - Live presence pill (visible for you; shows teammates when they open the same lead)
 * - Segmented status pipeline
 * - Date/time scheduling + scheduled-by tag
 * - Lead activity (lead_activity) + add note
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  isApptLeadLockedForViewer,
  isApptSetStatus,
  isNewLeadStatus,
  LEAD_STATUSES,
  statusAssignsClaimToActor,
  teamProfileFromDb,
  teamProfileFromSchedulerEmbed,
  type LeadRow,
  type LeadStatusValue,
  type TeamProfile,
} from "@/lib/leadTypes";
import clsx from "clsx";
import { Check, Flag, Loader2, Trash2 } from "lucide-react";
import { fetchProfileById, fetchProfilesByIds } from "@/lib/profileSelect";
import { displayProfessionalName } from "@/lib/profileDisplay";
import { buildTelHref } from "@/lib/phone";
import { timezoneHintFromPhone } from "@/lib/phoneTimezone";
import { GlassAppointmentDatetimePicker } from "@/components/ui/glass-calendar";
import { WebsiteBookingNotesCard } from "@/components/WebsiteBookingNotesCard";
import { LeadDemoSiteSection } from "@/components/LeadDemoSiteSection";
import { deleteLeadAction } from "@/app/actions/deleteLeadAction";
import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";
import { isWebsiteCallBookingNotes } from "@/lib/websiteCallBookingNotes";

function teamProfileHasDisplayName(p: TeamProfile | undefined): boolean {
  return Boolean(p?.fullName?.trim() || p?.firstName?.trim() || p?.email?.trim());
}

function normalizeStatus(s: string | null): LeadStatusValue {
  const t = (s ?? "").trim();
  if (t.toLowerCase() === "claimed") return "Interested";
  if (t.toLowerCase() === "pending close") return "Pending Close";
  const m = LEAD_STATUSES.find((x) => x.toLowerCase() === t.toLowerCase());
  return m ?? "New";
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function websiteHref(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

/** PostgREST often puts the Postgres `RAISE` text in `details`, not `message`. */
function supabaseErrorText(error: { message?: string; details?: string; hint?: string } | null): string {
  if (!error) return "";
  return [error.message, error.details, error.hint].filter((x) => typeof x === "string" && x.trim()).join(" ");
}

function isAppointmentLockDbError(error: { message?: string; details?: string; hint?: string } | null): boolean {
  const t = supabaseErrorText(error).toLowerCase();
  return (
    t.includes("appointment-locked") ||
    t.includes("locked by another teammate") ||
    t.includes("leads_enforce_appt_lock") ||
    t.includes("can_edit_appt_locked")
  );
}

function isLeadsStatusCheckError(error: { message?: string; details?: string; hint?: string } | null): boolean {
  return supabaseErrorText(error).toLowerCase().includes("leads_status_check");
}

function formatLeadsUpdateErrorForToast(error: { message?: string; details?: string; hint?: string } | null): string {
  if (isLeadsStatusCheckError(error)) {
    return "Your Supabase `leads` table needs an updated status list. Run web/supabase/leads-status-check.sql in the SQL Editor (allows Pending Close and the other pipeline stages).";
  }
  return supabaseErrorText(error) || "Could not update lead.";
}

const APPT_DEBOUNCE_MS = 450;
const NOTE_MAX = 4000;

export type LeadActivityRow = {
  id: string;
  lead_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type PresencePeer = { user_id: string; name?: string; first_name?: string; full_name?: string };

type LeadDetailDrawerProps = {
  lead: LeadRow;
  userId: string;
  /** Resolved from `profiles.full_name` (and map merge) for presence + self labels */
  viewerDisplayName: string;
  /** Monogram for Live pill, e.g. `J.S.` — from `avatar_initials` / name */
  viewerMonogram: string;
  profileMap: Record<string, TeamProfile>;
  onClose: () => void;
  syncLeadInState: (id: string, patch: Partial<LeadRow>) => void;
  onLeadMetaChanged?: () => void;
  /** Account owner (same as Role Applier access) — only owners can set demo site URL. */
  isOwner: boolean;
  /** Called after an owner successfully deletes this lead (remove from list + close drawer). */
  onLeadDeleted?: (leadId: string) => void;
};

type PresencePhase = "connecting" | "connected" | "error";

function LivePresencePill({
  phase,
  trackOk,
  inViewCount,
  viewerMonogram,
  otherNames,
}: {
  phase: PresencePhase;
  trackOk: boolean;
  inViewCount: number;
  viewerMonogram: string;
  otherNames: string[];
}) {
  const solo = otherNames.length === 0;
  const countLine = Math.max(1, inViewCount);
  const statusLine =
    phase === "connecting"
      ? "Connecting…"
      : phase === "error"
        ? "Realtime unavailable"
        : trackOk
          ? `Live · ${countLine} in view`
          : solo
            ? `Live · ${viewerMonogram} viewing (sync limited)`
            : `Live · ${countLine} in view (sync limited)`;

  const detailLine =
    phase === "connecting"
      ? "Joining channel lead-presence…"
      : phase === "error"
        ? "Check Realtime is enabled and your network allows WebSockets."
        : otherNames.length > 0
          ? `You, ${otherNames.join(", ")}`
          : "You’re the only one on this lead right now.";

  const isError = phase === "error";
  const pulse = !isError;

  return (
    <div
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 ring-1 ${
        isError
          ? "border-zinc-600/50 bg-zinc-900/80 ring-zinc-700/30"
          : "border-emerald-500/35 bg-gradient-to-r from-emerald-950/80 to-[#080808] ring-emerald-500/15"
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
            isError ? "bg-zinc-500" : "bg-emerald-400"
          } ${pulse ? "crm-live-dot" : ""}`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.7)] ${
            isError ? "bg-zinc-500" : "bg-emerald-400"
          }`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isError ? "text-zinc-500" : "text-emerald-400/90"}`}
        >
          Live
        </p>
        <p
          className={`truncate text-xs font-semibold ${isError ? "text-zinc-400" : "text-emerald-50/95"}`}
        >
          {statusLine}
        </p>
        <p
          className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${isError ? "text-zinc-500" : "text-emerald-200/75"}`}
        >
          {detailLine}
        </p>
      </div>
    </div>
  );
}

export function LeadDetailDrawer({
  lead,
  userId,
  viewerDisplayName,
  viewerMonogram,
  profileMap,
  onClose,
  syncLeadInState,
  onLeadMetaChanged,
  isOwner,
  onLeadDeleted,
}: LeadDetailDrawerProps) {
  const [status, setStatus] = useState<LeadStatusValue>(() => normalizeStatus(lead.status));
  const [statusBusy, setStatusBusy] = useState(false);
  const [apptLocal, setApptLocal] = useState(() => toDatetimeLocalValue(lead.appt_date));
  const [apptDirty, setApptDirty] = useState(false);
  const [apptPersistErr, setApptPersistErr] = useState<string | null>(null);
  const [activities, setActivities] = useState<LeadActivityRow[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesErr, setActivitiesErr] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [closeAmount, setCloseAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeToast, setCloseToast] = useState<string | null>(null);
  const [presenceOthers, setPresenceOthers] = useState<PresencePeer[]>([]);
  const [presencePhase, setPresencePhase] = useState<PresencePhase>("connecting");
  const [presenceTrackOk, setPresenceTrackOk] = useState(true);
  const [activityProfileExtras, setActivityProfileExtras] = useState<Record<string, TeamProfile>>({});
  const [presenceProfileExtras, setPresenceProfileExtras] = useState<Record<string, TeamProfile>>({});
  const [highPriorityBusy, setHighPriorityBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const leadId = lead.id;
  const apptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const viewerNameRef = useRef(viewerDisplayName);
  viewerNameRef.current = viewerDisplayName;
  const viewerMonogramRef = useRef(viewerMonogram);
  viewerMonogramRef.current = viewerMonogram;
  const mergedForActivity = useMemo(
    () => ({ ...profileMap, ...activityProfileExtras }),
    [profileMap, activityProfileExtras],
  );

  const claimedByDisplayName = useMemo(() => {
    const cid = lead.claimed_by;
    if (!cid) return "";
    const prof = mergedForActivity[cid];
    if (cid === userId && !teamProfileHasDisplayName(prof)) {
      const w = viewerDisplayName.trim();
      if (w) return w;
    }
    return displayProfessionalName(cid, prof);
  }, [lead.claimed_by, mergedForActivity, userId, viewerDisplayName]);

  const phoneTimezoneHint = useMemo(() => timezoneHintFromPhone(lead.phone), [lead.phone]);

  /** Default on: only set env to "false" if the column does not exist in your DB. */
  const hasScheduledByCol = process.env.NEXT_PUBLIC_LEADS_HAS_APPT_SCHEDULED_BY !== "false";
  const hasClaimedCol = process.env.NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY !== "false";
  const hasHighPriorityCol = process.env.NEXT_PUBLIC_LEADS_HAS_HIGH_PRIORITY !== "false";
  const hasDemoSiteCol = isDemoSiteFeatureEnabled();

  useEffect(() => {
    setStatus(normalizeStatus(lead.status));
    setApptLocal(toDatetimeLocalValue(lead.appt_date));
    setApptDirty(false);
    setApptPersistErr(null);
    setNoteDraft("");
    // Do not reset presence here — lead props update often (realtime / saves) and would
    // strand the Live pill on "Connecting…" while the channel stays subscribed.
  }, [leadId, lead.status, lead.appt_date, lead.appt_scheduled_by]);

  useEffect(() => {
    setActivityProfileExtras({});
  }, [leadId]);

  useEffect(() => {
    const sid = lead.appt_scheduled_by;
    if (!sid) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data, error } = await fetchProfileById(supabase, sid);
      if (cancelled || error || !data) return;
      const id = data.id as string;
      setActivityProfileExtras((prev) => ({
        ...prev,
        [id]: teamProfileFromDb({
          id,
          first_name: data.first_name ?? null,
          full_name: data.full_name ?? null,
          avatar_initials: data.avatar_initials ?? null,
          email: (data as { email?: string | null }).email ?? null,
        }),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.appt_scheduled_by, leadId]);

  useEffect(() => {
    const cid = lead.claimed_by;
    if (!cid) return;
    const combined = profileMap[cid] ?? activityProfileExtras[cid];
    if (teamProfileHasDisplayName(combined)) return;

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data, error } = await fetchProfileById(supabase, cid);
      if (cancelled || error || !data) return;
      const id = data.id as string;
      setActivityProfileExtras((prev) => ({
        ...prev,
        [id]: teamProfileFromDb({
          id,
          first_name: data.first_name ?? null,
          full_name: data.full_name ?? null,
          avatar_initials: data.avatar_initials ?? null,
          email: (data as { email?: string | null }).email ?? null,
        }),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.claimed_by, leadId, profileMap, activityProfileExtras]);

  useEffect(() => {
    const cid = lead.demo_build_claimed_by;
    if (!cid) return;
    const combined = profileMap[cid] ?? activityProfileExtras[cid];
    if (teamProfileHasDisplayName(combined)) return;

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data, error } = await fetchProfileById(supabase, cid);
      if (cancelled || error || !data) return;
      const id = data.id as string;
      setActivityProfileExtras((prev) => ({
        ...prev,
        [id]: teamProfileFromDb({
          id,
          first_name: data.first_name ?? null,
          full_name: data.full_name ?? null,
          avatar_initials: data.avatar_initials ?? null,
          email: (data as { email?: string | null }).email ?? null,
        }),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.demo_build_claimed_by, leadId, profileMap, activityProfileExtras]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const a of activities) ids.add(a.user_id);
    const missing = [...ids].filter((id) => !profileMap[id] && !activityProfileExtras[id]);
    if (missing.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data } = await fetchProfilesByIds(supabase, missing);
      if (!data?.length) return;
      setActivityProfileExtras((prev) => {
        const next = { ...prev };
        for (const p of data) {
          const id = p.id as string;
          next[id] = teamProfileFromDb({
            id,
            first_name: p.first_name ?? null,
            full_name: p.full_name ?? null,
            avatar_initials: p.avatar_initials ?? null,
            email: p.email ?? null,
          });
        }
        return next;
      });
    })();
  }, [activities, profileMap, activityProfileExtras]);

  const prevActivityLeadIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const switchedLead =
      prevActivityLeadIdRef.current !== null && prevActivityLeadIdRef.current !== leadId;
    prevActivityLeadIdRef.current = leadId;

    setActivities([]);
    setActivitiesErr(null);

    let showLoadingTimer: number | null = null;
    if (switchedLead) {
      setActivitiesLoading(false);
      showLoadingTimer = window.setTimeout(() => {
        if (!cancelled) setActivitiesLoading(true);
      }, 220);
    } else {
      setActivitiesLoading(true);
    }

    void (async () => {
      const { data, error } = await supabase
        .from("lead_activity")
        .select("id, lead_id, user_id, body, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (showLoadingTimer != null) {
        window.clearTimeout(showLoadingTimer);
        showLoadingTimer = null;
      }
      if (cancelled) return;
      setActivitiesLoading(false);
      if (error) {
        setActivitiesErr(error.message);
        setActivities([]);
      } else {
        setActivities((data as LeadActivityRow[]) ?? []);
      }
    })();

    const channel = supabase
      .channel(`lead-activity-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_activity",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const row = payload.new as LeadActivityRow;
          setActivities((prev) => {
            if (prev.some((a) => a.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (showLoadingTimer != null) window.clearTimeout(showLoadingTimer);
      void supabase.removeChannel(channel);
    };
  }, [leadId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let presenceErrorTimer: number | null = null;
    const clearPresenceErrorTimer = () => {
      if (presenceErrorTimer != null) {
        window.clearTimeout(presenceErrorTimer);
        presenceErrorTimer = null;
      }
    };

    setPresencePhase("connecting");
    setPresenceTrackOk(true);
    setPresenceOthers([]);
    setPresenceProfileExtras({});

    const channel = supabase.channel(`lead-presence:${leadId}`, {
      config: { presence: { key: userId } },
    });
    presenceChannelRef.current = channel;

    const readPeers = () => {
      if (cancelled) return;
      const state = channel.presenceState();
      const seen = new Set<string>();
      const peers: PresencePeer[] = [];
      for (const [presenceKey, metas] of Object.entries(state)) {
        const list = (metas ?? []) as {
          user_id?: string;
          name?: string;
          first_name?: string;
          full_name?: string;
        }[];
        for (const m of list) {
          const uid = m?.user_id || presenceKey;
          if (!uid || uid === userId || seen.has(uid)) continue;
          seen.add(uid);
          peers.push({
            user_id: uid,
            name: m?.name,
            first_name: typeof m?.first_name === "string" ? m.first_name : undefined,
            full_name: typeof m?.full_name === "string" ? m.full_name : undefined,
          });
        }
      }
      setPresenceOthers(peers);
    };

    channel
      .on("presence", { event: "sync" }, readPeers)
      .on("presence", { event: "join" }, readPeers)
      .on("presence", { event: "leave" }, readPeers);

    const trackPayload = () => {
      const display = viewerNameRef.current.trim();
      const initials = viewerMonogramRef.current.trim();
      return {
        user_id: userId,
        user: {
          id: userId,
          name: display,
          initials,
        },
        full_name: display,
        first_name: display.split(/\s+/).filter(Boolean)[0] ?? display,
        name: display,
        initials,
        online_at: new Date().toISOString(),
      };
    };

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      } catch {
        /* non-fatal */
      }

      const rt = supabase.realtime as unknown as { connect?: () => Promise<void> };
      if (typeof rt.connect === "function") {
        try {
          await rt.connect();
        } catch {
          /* socket may already be connecting */
        }
      }

      if (cancelled) return;

      channel.subscribe(async (status) => {
        if (cancelled) return;
        const s = String(status);

        if (s === "SUBSCRIBED") {
          clearPresenceErrorTimer();
          setPresencePhase("connected");
          try {
            const trackResult = channel.track(trackPayload());
            await trackResult;
            if (!cancelled) {
              setPresenceTrackOk(true);
              readPeers();
            }
          } catch {
            if (!cancelled) {
              setPresenceTrackOk(false);
              readPeers();
            }
          }
          return;
        }
        if (s === "TIMED_OUT") {
          clearPresenceErrorTimer();
          setPresencePhase("connected");
          setPresenceTrackOk(false);
          readPeers();
          return;
        }
        if (s === "CHANNEL_ERROR" || s === "CLOSED") {
          if (cancelled) return;
          clearPresenceErrorTimer();
          presenceErrorTimer = window.setTimeout(() => {
            presenceErrorTimer = null;
            if (!cancelled) {
              setPresencePhase("error");
              setPresenceTrackOk(false);
            }
          }, 900);
        }
      });
    })();

    return () => {
      cancelled = true;
      clearPresenceErrorTimer();
      presenceChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [leadId, userId]);

  useEffect(() => {
    const ch = presenceChannelRef.current;
    if (!ch || presencePhase !== "connected") return;
    const display = viewerDisplayName.trim();
    const initials = viewerMonogram.trim();
    void ch
      .track({
        user_id: userId,
        user: { id: userId, name: display, initials },
        full_name: display,
        first_name: display.split(/\s+/).filter(Boolean)[0] ?? display,
        name: display,
        initials,
        online_at: new Date().toISOString(),
      })
      .then(() => setPresenceTrackOk(true))
      .catch(() => setPresenceTrackOk(false));
  }, [viewerDisplayName, viewerMonogram, userId, presencePhase]);

  useEffect(() => {
    const ids = [...new Set(presenceOthers.map((p) => p.user_id))].filter(
      (id) => !profileMap[id] && !presenceProfileExtras[id],
    );
    if (ids.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data } = await fetchProfilesByIds(supabase, ids);
      if (!data?.length) return;
      setPresenceProfileExtras((prev) => {
        const next = { ...prev };
        for (const p of data) {
          const id = p.id as string;
          next[id] = teamProfileFromDb({
            id,
            first_name: p.first_name ?? null,
            full_name: p.full_name ?? null,
            avatar_initials: p.avatar_initials ?? null,
            email: p.email ?? null,
          });
        }
        return next;
      });
    })();
  }, [presenceOthers, profileMap, presenceProfileExtras]);

  const apptStatusLocked = isApptLeadLockedForViewer(lead, userId);

  /** Schedule UI only when pipeline is Appt Set (matches DB casing in `LEAD_STATUSES`). */
  const showScheduleSection = status === "Appt Set";

  const persistStatus = useCallback(
    async (next: LeadStatusValue) => {
      if (isApptLeadLockedForViewer(lead, userId)) {
        setCloseToast("This lead is appointment-locked by another teammate. Status is view-only for you.");
        setStatus(normalizeStatus(lead.status));
        return;
      }
      setStatusBusy(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const clearsAppt = next === "New" || next === "Called";
        const payload: {
          status: LeadStatusValue;
          claimed_by?: string | null;
          appt_date?: string | null;
          appt_scheduled_by?: string | null;
        } = { status: next };
        if (hasClaimedCol && (next === "Not Interested" || next === "New")) {
          payload.claimed_by = null;
        } else if (hasClaimedCol && statusAssignsClaimToActor(next)) {
          payload.claimed_by = userId;
        }
        if (clearsAppt) {
          payload.appt_date = null;
          if (hasScheduledByCol) {
            payload.appt_scheduled_by = null;
          }
        }
        const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
        if (error) {
          const isLocked = isAppointmentLockDbError(error);
          setCloseToast(
            isLocked
              ? "This lead is appointment-locked by another teammate. Status is view-only for you."
              : formatLeadsUpdateErrorForToast(error),
          );
          setStatus(normalizeStatus(lead.status));
        } else {
          setStatus(next);
          if (clearsAppt) {
            setApptLocal("");
            setApptDirty(false);
            if (apptTimer.current) {
              clearTimeout(apptTimer.current);
              apptTimer.current = null;
            }
          }
          syncLeadInState(leadId, {
            status: next,
            ...(hasClaimedCol && (next === "Not Interested" || next === "New") ? { claimed_by: null } : {}),
            ...(hasClaimedCol &&
            next !== "Not Interested" &&
            next !== "New" &&
            statusAssignsClaimToActor(next)
              ? { claimed_by: userId }
              : {}),
            ...(clearsAppt
              ? {
                  appt_date: null,
                  ...(hasScheduledByCol ? { appt_scheduled_by: null, scheduler_profile: null } : {}),
                }
              : {}),
          });
          onLeadMetaChanged?.();
        }
      } finally {
        setStatusBusy(false);
      }
    },
    [hasClaimedCol, hasScheduledByCol, lead.appt_scheduled_by, lead.status, leadId, onLeadMetaChanged, syncLeadInState, userId],
  );

  const persistHighPriority = useCallback(
    async (next: boolean) => {
      if (!hasHighPriorityCol || highPriorityBusy) return;
      setHighPriorityBusy(true);
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("leads").update({ is_high_priority: next }).eq("id", leadId);
      setHighPriorityBusy(false);
      if (error) {
        setCloseToast(supabaseErrorText(error) || "Could not update team priority.");
        return;
      }
      syncLeadInState(leadId, { is_high_priority: next });
    },
    [hasHighPriorityCol, highPriorityBusy, leadId, syncLeadInState],
  );

  const persistApptDate = useCallback(
    async (local: string) => {
      if (isApptLeadLockedForViewer(lead, userId)) return;
      if (status !== "Appt Set") return;
      setApptPersistErr(null);
      const iso = fromDatetimeLocalToIso(local);
      const supabase = createSupabaseBrowserClient();

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      // Prefer the app/user context id first; fall back to auth uid.
      const actorId = (userId ?? authUser?.id ?? "").trim();

      const nextStatus = normalizeStatus(lead.status);
      const updates: Record<string, string | null> = {
        appt_date: iso,
      };
      if (iso && nextStatus !== "Appt Set") {
        updates.status = "Appt Set";
      }
      if (hasScheduledByCol) {
        updates.appt_scheduled_by = iso ? actorId : null;
      }
      if (hasClaimedCol && iso && actorId) {
        updates.claimed_by = actorId;
      }

      let { error } = await supabase.from("leads").update(updates).eq("id", leadId);

      if (error && hasScheduledByCol && iso) {
        const msg = (error.message ?? "").toLowerCase();
        const schedFkHint =
          msg.includes("foreign key") ||
          msg.includes("fkey") ||
          msg.includes("profiles") ||
          msg.includes("appt_scheduled_by");
        if (schedFkHint) {
          const { appt_scheduled_by: _drop, ...withoutSched } = updates;
          const retry = await supabase.from("leads").update(withoutSched).eq("id", leadId);
          error = retry.error;
          if (!retry.error) {
            setApptPersistErr(
              "Saved the appointment time, but your user could not be stored as scheduler (check `profiles` row and FK `appt_scheduled_by` → `profiles`). Use Team schedule to see it, or fix the database and save again.",
            );
            delete updates.appt_scheduled_by;
          }
        }
      }

      if (error) {
        setApptPersistErr(error.message);
        return;
      }

      const patch: Partial<LeadRow> = { appt_date: iso };
      if (hasScheduledByCol && updates.appt_scheduled_by !== undefined) {
        patch.appt_scheduled_by = iso ? actorId : null;
        if (iso) {
          const me = profileMap[actorId] ?? profileMap[userId];
          patch.scheduler_profile = {
            full_name:
              me?.fullName?.trim() || me?.firstName?.trim() || viewerDisplayName.trim() || null,
            first_name: me?.firstName?.trim() || null,
            avatar_initials:
              me?.initials && me.initials !== "·" ? me.initials : null,
          };
        } else {
          patch.scheduler_profile = null;
        }
      }
      if (iso && nextStatus !== "Appt Set") {
        patch.status = "Appt Set";
        setStatus("Appt Set");
      }
      if (hasClaimedCol && iso && actorId) {
        patch.claimed_by = actorId;
      }
      syncLeadInState(leadId, patch);
      onLeadMetaChanged?.();
    },
    [
      hasClaimedCol,
      hasScheduledByCol,
      lead,
      lead.status,
      leadId,
      onLeadMetaChanged,
      profileMap,
      status,
      syncLeadInState,
      userId,
      viewerDisplayName,
    ],
  );

  useEffect(() => {
    if (isApptLeadLockedForViewer(lead, userId)) return;
    if (status !== "Appt Set") return;
    if (!apptDirty && !apptLocal) return;
    if (apptTimer.current) clearTimeout(apptTimer.current);
    apptTimer.current = setTimeout(() => {
      const iso = fromDatetimeLocalToIso(apptLocal);
      const prevIso = lead.appt_date;
      if (iso === prevIso || (!iso && !prevIso)) return;
      void persistApptDate(apptLocal);
      setApptDirty(false);
    }, APPT_DEBOUNCE_MS);
    return () => {
      if (apptTimer.current) clearTimeout(apptTimer.current);
    };
  }, [apptLocal, apptDirty, persistApptDate, lead, lead.appt_date, status, userId]);

  const fromSchedulerEmbed = teamProfileFromSchedulerEmbed(
    lead.appt_scheduled_by,
    lead.scheduler_profile ?? null,
  );
  const scheduledByProfile: TeamProfile | undefined =
    lead.appt_scheduled_by && fromSchedulerEmbed
      ? fromSchedulerEmbed
      : lead.appt_scheduled_by
        ? mergedForActivity[lead.appt_scheduled_by]
        : undefined;

  const scheduledByDisplayName = lead.appt_scheduled_by
    ? (() => {
        const sid = lead.appt_scheduled_by;
        const prof = scheduledByProfile;
        if (sid === userId && !prof?.fullName?.trim() && !prof?.firstName?.trim()) {
          return viewerDisplayName.trim() || displayProfessionalName(sid, prof);
        }
        return displayProfessionalName(sid, prof);
      })()
    : "Unassigned";

  const addNote = async () => {
    if (apptStatusLocked) return;
    const body = noteDraft.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("lead_activity")
      .insert({ lead_id: leadId, user_id: userId, body })
      .select("id, lead_id, user_id, body, created_at")
      .single();
    setNoteBusy(false);
    if (error) {
      setCloseToast(
        isAppointmentLockDbError(error)
          ? "This lead is appointment-locked by another teammate. Notes are view-only for you."
          : supabaseErrorText(error) || "Could not add note.",
      );
      return;
    }
    if (data) {
      setActivities((prev) => {
        if (prev.some((a) => a.id === (data as LeadActivityRow).id)) return prev;
        return [data as LeadActivityRow, ...prev];
      });
      setNoteDraft("");
    }
  };

  const requestClose = useCallback(async () => {
    if (isApptLeadLockedForViewer(lead, userId)) {
      setCloseToast("This lead is appointment-locked by another teammate. Close request is view-only for you.");
      return;
    }
    const amountNum = Number.parseFloat(closeAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setCloseToast("Enter a valid deal amount.");
      return;
    }
    if (closeBusy) return;
    setCloseBusy(true);
    const supabase = createSupabaseBrowserClient();

    const pendingCloseUpdate: { status: string; claimed_by?: string | null } = { status: "Pending Close" };
    if (hasClaimedCol && userId) {
      pendingCloseUpdate.claimed_by = userId;
    }
    const { error: statusErr } = await supabase.from("leads").update(pendingCloseUpdate).eq("id", leadId);
    if (statusErr) {
      setCloseBusy(false);
      setCloseToast(formatLeadsUpdateErrorForToast(statusErr));
      return;
    }

    const payload = {
      lead_id: leadId,
      amount: amountNum,
      notes: closeNotes.trim() || null,
      approval_status: "pending",
      requested_by: userId,
      created_at: new Date().toISOString(),
    };

    let closedErr: { message?: string } | null = null;
    const fullInsert = await (supabase as any).from("closed_deals").insert(payload);
    if (fullInsert.error) {
      const minimalInsert = await (supabase as any).from("closed_deals").insert({
        lead_id: leadId,
        approval_status: "pending",
      });
      if (minimalInsert.error) closedErr = minimalInsert.error;
    }

    setStatus("Pending Close");
    syncLeadInState(leadId, {
      status: "Pending Close",
      ...(hasClaimedCol && userId ? { claimed_by: userId } : {}),
    });
    onLeadMetaChanged?.();

    setCloseBusy(false);
    setCloseOpen(false);
    setCloseAmount("");
    setCloseNotes("");
    setCloseToast(
      closedErr
        ? "Lead moved to Pending Close, but closed_deals insert failed (check table schema/RLS)."
        : "Close request sent! Waiting for Owner approval.",
    );
  }, [closeAmount, closeBusy, closeNotes, hasClaimedCol, lead, leadId, onLeadMetaChanged, syncLeadInState, userId]);

  useEffect(() => {
    if (!closeToast) return;
    const t = window.setTimeout(() => setCloseToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [closeToast]);

  const mergedPresenceProfiles = useMemo(
    () => ({ ...profileMap, ...presenceProfileExtras }),
    [profileMap, presenceProfileExtras],
  );

  const otherViewerNames = useMemo(() => {
    return presenceOthers.map((p) => {
      const prof = mergedPresenceProfiles[p.user_id];
      const fromProfile = displayProfessionalName(p.user_id, prof);
      const fromPresence =
        p.full_name?.trim() || p.name?.trim() || p.first_name?.trim();
      if (fromPresence) return fromPresence;
      return fromProfile;
    });
  }, [presenceOthers, mergedPresenceProfiles]);

  const presenceInViewCount =
    presencePhase === "connected" ? 1 + presenceOthers.length : 0;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-[#030304]/88 backdrop-blur-md"
        onClick={onClose}
      />
      <aside className="crm-drawer-panel relative z-10 flex h-full w-full max-w-lg flex-col border-l border-emerald-950/30 bg-[#0c0c0e] shadow-[0_0_100px_-20px_rgba(16,185,129,0.12)] ring-1 ring-emerald-950/20">
        <div className="flex items-start justify-between gap-4 border-b border-emerald-950/25 bg-[#09090b]/90 px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600/80">
              Lead detail
            </p>
            <h2 className="mt-1.5 break-words text-xl font-semibold tracking-tight text-zinc-50">
              {lead.company_name ?? "Untitled company"}
            </h2>
            {lead.claimed_by && !isNewLeadStatus(lead.status) ? (
              <p className="crm-claimed-badge mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-rose-400/35 bg-gradient-to-r from-rose-500/15 to-fuchsia-900/20 px-3 py-1.5 text-xs font-medium text-rose-100/95">
                <LockMini />
                <span>
                  Claimed by{" "}
                  <span className="font-semibold text-white">
                    {claimedByDisplayName}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-emerald-950/40 p-2 text-zinc-400 transition hover:border-emerald-800/50 hover:bg-emerald-950/20 hover:text-white"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="border-b border-emerald-950/20 bg-[#080808]/95 px-6 py-3">
          <LivePresencePill
            phase={presencePhase}
            trackOk={presenceTrackOk}
            inViewCount={presenceInViewCount > 0 ? presenceInViewCount : 1}
            viewerMonogram={viewerMonogram.trim() || "You"}
            otherNames={otherViewerNames}
          />
        </div>

        <div
          className={clsx(
            "flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-6 py-5 transition-[opacity,filter] duration-200",
            apptStatusLocked && "opacity-[0.52] saturate-[0.65]",
          )}
        >
          {apptStatusLocked ? (
            <p className="mb-4 rounded-xl border border-zinc-600/35 bg-zinc-900/60 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-400">
              This lead&apos;s appointment was set by{" "}
              <span className="font-semibold text-zinc-200">{scheduledByDisplayName}</span>. Pipeline and appointment
              fields are view-only for you.
            </p>
          ) : null}
          {hasHighPriorityCol ? (
            <section className="mb-4 rounded-xl border border-zinc-800/80 bg-zinc-950/35 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-400/90">
                    <Flag className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    Team priority
                  </h3>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    Mark urgent follow-up — everyone on the team sees this on the list and pipeline.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={lead.is_high_priority === true}
                  disabled={highPriorityBusy}
                  onClick={() => void persistHighPriority(!(lead.is_high_priority === true))}
                  className={clsx(
                    "relative h-7 w-12 shrink-0 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 disabled:opacity-50",
                    lead.is_high_priority === true
                      ? "border-rose-400/50 bg-rose-600/35"
                      : "border-zinc-600/60 bg-zinc-800/80",
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200",
                      lead.is_high_priority === true ? "left-[calc(100%-1.625rem)]" : "left-0.5",
                    )}
                  />
                  <span className="sr-only">
                    {lead.is_high_priority === true ? "High priority on" : "High priority off"}
                  </span>
                </button>
              </div>
            </section>
          ) : null}
          {/* —— Status: compact list (mobile-friendly) —— */}
          <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/35 p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-500/85">
              Status
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              Tap a stage — saves right away, no reload.
              {hasClaimedCol ? (
                <span className="block pt-1 text-zinc-500">
                  New leads stay unclaimed. Called, Interested, Appt Set, and Pending Close record you as the teammate
                  (Claimed by — uses the name from their profile). Moving back to New clears the claim.
                </span>
              ) : null}
            </p>
            <div
              className="mt-2.5 overflow-hidden rounded-lg border border-zinc-800/70 bg-[#09090b] divide-y divide-zinc-800/80"
              role="listbox"
              aria-label="Lead status pipeline"
            >
              {LEAD_STATUSES.map((s) => {
                const active = status === s;
                const isAppt = s === "Appt Set";
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={statusBusy || apptStatusLocked}
                    onClick={() => {
                      if (s === status || statusBusy) return;
                      void persistStatus(s);
                    }}
                    className={clsx(
                      "flex w-full touch-manipulation select-none items-center gap-3 px-3 py-2.5 text-left transition",
                      /* Hover / press tint only on real hover devices — avoids grey “picked” rows while scrolling on touch */
                      "[@media(hover:hover)]:active:bg-white/[0.03]",
                      active && isAppt && "crm-status-appt-set-active",
                      active && !isAppt && "bg-emerald-500/[0.12]",
                      !active && "[@media(hover:hover)]:hover:bg-zinc-800/50",
                      statusBusy && "cursor-wait opacity-70",
                    )}
                  >
                    <span
                      className={clsx(
                        "min-w-0 flex-1 text-[13px] font-medium leading-snug",
                        active ? (isAppt ? "text-emerald-50" : "text-zinc-50") : "text-zinc-500",
                      )}
                    >
                      {s}
                    </span>
                    {active ? (
                      <Check
                        className={clsx("h-4 w-4 shrink-0", isAppt ? "text-emerald-200" : "text-emerald-400")}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          {/* —— Appointment: only when status is Appt Set —— */}
          {showScheduleSection ? (
            <section className="mt-6 rounded-2xl border border-emerald-950/35 bg-[#080808] p-4 ring-1 ring-black/30">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500/90">
                Schedule appointment
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                Date &amp; time is saved to this lead and appears on the team calendar.
              </p>
              <label
                htmlFor="appt-when"
                className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
              >
                Date &amp; time
              </label>
              <div className="mt-1.5">
                <GlassAppointmentDatetimePicker
                  triggerId="appt-when"
                  value={apptLocal}
                  disabled={apptStatusLocked}
                  onChange={(v) => {
                    setApptDirty(true);
                    setApptLocal(v);
                  }}
                />
              </div>
              {apptPersistErr ? (
                <p className="mt-2 rounded-lg border border-rose-500/25 bg-rose-950/30 px-3 py-2 text-[11px] leading-snug text-rose-100">
                  {apptPersistErr}
                </p>
              ) : null}
              {!hasScheduledByCol ? (
                <p className="mt-2 text-[10px] leading-snug text-amber-200/80">
                  Remove <span className="font-mono text-amber-100/90">NEXT_PUBLIC_LEADS_HAS_APPT_SCHEDULED_BY=false</span>{" "}
                  (or add the <span className="font-mono">appt_scheduled_by</span> column) so &quot;My schedule&quot; can
                  attribute appointments to you.
                </p>
              ) : null}
              {lead.appt_date && hasScheduledByCol ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-emerald-200/90">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  Scheduled by{" "}
                  <span className="font-semibold text-white">
                    {lead.appt_scheduled_by ? scheduledByDisplayName : "Unassigned"}
                  </span>
                </p>
              ) : null}
              {!apptLocal ? (
                <p className="mt-2 text-[11px] text-amber-200/85">
                  Add a date &amp; time so this lead can appear in Appointments today.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="mt-6 rounded-2xl border border-amber-500/30 bg-[#080808] p-4 ring-1 ring-amber-500/15">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/95">
                Close request
              </h3>
              <button
                type="button"
                disabled={closeBusy || apptStatusLocked}
                onClick={() => setCloseOpen((v) => !v)}
                className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_0_14px_-6px_rgba(251,191,36,0.65)] hover:bg-amber-500/10 disabled:opacity-60"
              >
                Mark as Closed
              </button>
            </div>
            {closeOpen ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Deal amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closeAmount}
                    disabled={apptStatusLocked}
                    onChange={(e) => setCloseAmount(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-amber-500/30 bg-[#0c0c0e] px-3 text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
                    placeholder="15000"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Closing notes</span>
                  <textarea
                    value={closeNotes}
                    disabled={apptStatusLocked}
                    onChange={(e) => setCloseNotes(e.target.value.slice(0, 2000))}
                    rows={3}
                    className="mt-1.5 w-full resize-none rounded-xl border border-amber-500/30 bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
                    placeholder="Any final details for owner approval..."
                  />
                </label>
                <button
                  type="button"
                  disabled={closeBusy || apptStatusLocked}
                  onClick={() => void requestClose()}
                  className="rounded-xl border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-[0_0_18px_-6px_rgba(251,191,36,0.75)] hover:bg-amber-500/20 disabled:opacity-60"
                >
                  {closeBusy ? "Sending..." : "Send close request"}
                </button>
              </div>
            ) : null}
          </section>

          <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailItem label="Phone">
              {lead.phone ? (
                <a
                  href={buildTelHref(lead.phone)}
                  className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
                >
                  {lead.phone}
                </a>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </DetailItem>
            <DetailItem label="Timezone (from area code)">
              {phoneTimezoneHint ? (
                <div className="space-y-0.5">
                  <p className="font-medium text-zinc-200">
                    {phoneTimezoneHint.generic}
                    {phoneTimezoneHint.short ? (
                      <span className="ml-1.5 text-zinc-400">({phoneTimezoneHint.short})</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {phoneTimezoneHint.localTime} there · area {phoneTimezoneHint.areaCode}
                  </p>
                </div>
              ) : lead.phone?.trim() ? (
                <span className="text-zinc-500">Couldn&apos;t infer (non-US or unmapped area code)</span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </DetailItem>
            <DetailItem label="Website">
              {lead.website ? (
                <a
                  href={websiteHref(lead.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-emerald-300/90 hover:text-emerald-200 hover:underline"
                >
                  {lead.website}
                </a>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </DetailItem>
            {hasDemoSiteCol ? (
              <div className="col-span-full sm:col-span-2">
                <LeadDemoSiteSection
                  leadId={leadId}
                  lead={lead}
                  isOwner={isOwner}
                  userId={userId}
                  viewerDisplayName={viewerDisplayName}
                  profileMap={mergedForActivity}
                  syncLeadInState={syncLeadInState}
                  onBanner={setCloseToast}
                  onLeadMetaChanged={onLeadMetaChanged}
                />
              </div>
            ) : null}
            <DetailItem label="Created">
              <span className="text-zinc-300">
                {lead.created_at
                  ? new Date(lead.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </span>
            </DetailItem>
            <DetailItem label="Lead ID">
              <span className="font-mono text-xs text-zinc-500">{lead.id}</span>
            </DetailItem>
          </dl>

          {/* —— Activity timeline —— */}
          <section className="mt-8 rounded-2xl border border-emerald-950/30 bg-[#080808]/80 p-4 ring-1 ring-black/25">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500/90">
              Lead activity
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Chronological notes on this lead, with author and timestamp. New entries appear here in real time for your
              team.
            </p>

            {lead.notes?.trim() ? (
              isWebsiteCallBookingNotes(lead.notes) ? (
                <WebsiteBookingNotesCard notes={lead.notes} />
              ) : (
                <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-500">Initial note — </span>
                  <span className="whitespace-pre-wrap text-zinc-300">{lead.notes}</span>
                </div>
              )
            ) : null}

            <div className="mt-4 space-y-2">
              <textarea
                value={noteDraft}
                disabled={apptStatusLocked}
                onChange={(e) => setNoteDraft(e.target.value.slice(0, NOTE_MAX))}
                rows={3}
                maxLength={NOTE_MAX}
                placeholder="Type a note, then Add…"
                className="w-full resize-none rounded-xl border border-emerald-950/40 bg-[#0c0c0e] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/45 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-600">
                  {noteDraft.length}/{NOTE_MAX}
                </span>
                <button
                  type="button"
                  disabled={noteBusy || !noteDraft.trim() || apptStatusLocked}
                  onClick={() => void addNote()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {noteBusy ? "Adding…" : "Add"}
                </button>
              </div>
            </div>

            <div className="relative mt-5 border-l-2 border-emerald-800/50 pl-4">
              {activitiesLoading ? (
                <p className="text-sm text-zinc-500">Loading timeline…</p>
              ) : activitiesErr ? (
                <p className="text-sm text-rose-300/90">
                  Could not load timeline. Confirm RLS + Realtime on <code className="text-rose-200">lead_activity</code>.
                  <span className="mt-1 block text-xs text-zinc-500">{activitiesErr}</span>
                </p>
              ) : activities.length === 0 ? (
                <p className="text-sm text-zinc-500">No entries yet — add one above.</p>
              ) : (
                <ul className="space-y-4">
                  {activities.map((a) => (
                    <TimelineItem
                      key={a.id}
                      activity={a}
                      author={mergedForActivity[a.user_id]}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {closeToast ? (
          <div className="pointer-events-none absolute bottom-20 left-6 right-6 z-20 rounded-lg border border-amber-400/45 bg-[#120f08]/95 px-3 py-2 text-sm font-semibold text-amber-100 shadow-[0_0_20px_-6px_rgba(251,191,36,0.7)]">
            {closeToast}
          </div>
        ) : null}

        {deleteDialogOpen ? (
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Cancel delete"
              disabled={deleteBusy}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => {
                if (!deleteBusy) setDeleteDialogOpen(false);
              }}
            />
            <div
              className="relative z-10 w-full max-w-md rounded-2xl border border-rose-500/35 bg-[#0c0c0e] p-5 shadow-[0_0_60px_-20px_rgba(244,63,94,0.45)] ring-1 ring-black/40"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-lead-title"
            >
              <h3 id="delete-lead-title" className="text-lg font-semibold text-zinc-50">
                Delete this lead?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-200">{lead.company_name ?? "This company"}</span> will be
                permanently removed. Related activity may be removed by the database. This cannot be undone.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => setDeleteDialogOpen(false)}
                  className="rounded-xl border border-zinc-600/70 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900/60 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => {
                    void (async () => {
                      setDeleteBusy(true);
                      setCloseToast(null);
                      const r = await deleteLeadAction(leadId);
                      setDeleteBusy(false);
                      if (!r.ok) {
                        setCloseToast(r.error ?? "Could not delete lead.");
                        return;
                      }
                      setDeleteDialogOpen(false);
                      onLeadDeleted?.(leadId);
                      onClose();
                    })();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/50 bg-rose-600/25 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-600/40 disabled:opacity-50"
                >
                  {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Delete lead
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="border-t border-emerald-950/25 bg-[#09090b]/90 px-6 py-4">
          {isOwner ? (
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/25 py-2.5 text-sm font-semibold text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-950/40"
              aria-label="Delete this lead"
            >
              <Trash2 className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-emerald-950/40 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-emerald-800/50 hover:bg-emerald-950/15"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function TimelineItem({
  activity,
  author,
}: {
  activity: LeadActivityRow;
  author?: TeamProfile;
}) {
  const when = new Date(activity.created_at);
  const name = displayProfessionalName(activity.user_id, author);
  return (
    <li className="relative">
      <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c0c0e] bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.45)]" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        <span className="text-emerald-500/90"> · {name}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{activity.body}</p>
    </li>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-200">{children}</dd>
    </div>
  );
}

function LockMini() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
