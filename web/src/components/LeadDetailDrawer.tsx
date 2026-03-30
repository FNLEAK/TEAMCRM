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
  LEAD_STATUSES,
  teamProfileFromDb,
  teamProfileFromSchedulerEmbed,
  type LeadRow,
  type LeadStatusValue,
  type TeamProfile,
} from "@/lib/leadTypes";
import clsx from "clsx";
import { fetchProfileById, fetchProfilesByIds } from "@/lib/profileSelect";
import { displayProfessionalName } from "@/lib/profileDisplay";
import { buildTelHref } from "@/lib/phone";

function normalizeStatus(s: string | null): LeadStatusValue {
  const t = (s ?? "").trim();
  if (t.toLowerCase() === "claimed") return "Interested";
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
  refresh: () => void;
  onLeadMetaChanged?: () => void;
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
  refresh,
  onLeadMetaChanged,
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
  const [presenceOthers, setPresenceOthers] = useState<PresencePeer[]>([]);
  const [presencePhase, setPresencePhase] = useState<PresencePhase>("connecting");
  const [presenceTrackOk, setPresenceTrackOk] = useState(true);
  const [activityProfileExtras, setActivityProfileExtras] = useState<Record<string, TeamProfile>>({});
  const [presenceProfileExtras, setPresenceProfileExtras] = useState<Record<string, TeamProfile>>({});

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

  /** Default on: only set env to "false" if the column does not exist in your DB. */
  const hasScheduledByCol = process.env.NEXT_PUBLIC_LEADS_HAS_APPT_SCHEDULED_BY !== "false";
  const hasClaimedCol = process.env.NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY === "true";

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
        }),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.appt_scheduled_by, leadId]);

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
          });
        }
        return next;
      });
    })();
  }, [activities, profileMap, activityProfileExtras]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    setActivitiesLoading(true);
    setActivitiesErr(null);

    void (async () => {
      const { data, error } = await supabase
        .from("lead_activity")
        .select("id, lead_id, user_id, body, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (error) {
        setActivitiesErr(error.message);
        setActivities([]);
      } else {
        setActivities((data as LeadActivityRow[]) ?? []);
      }
      setActivitiesLoading(false);
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
      void supabase.removeChannel(channel);
    };
  }, [leadId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

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
          setPresencePhase("connected");
          setPresenceTrackOk(false);
          readPeers();
          return;
        }
        if (s === "CHANNEL_ERROR" || s === "CLOSED") {
          if (!cancelled) {
            setPresencePhase("error");
            setPresenceTrackOk(false);
          }
        }
      });
    })();

    return () => {
      cancelled = true;
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
        setStatus(normalizeStatus(lead.status));
        return;
      }
      setStatusBusy(true);
      const supabase = createSupabaseBrowserClient();
      const clearsAppt = next === "New" || next === "Called";
      const payload: {
        status: LeadStatusValue;
        claimed_by?: string | null;
        appt_date?: string | null;
        appt_scheduled_by?: string | null;
      } = { status: next };
      if (hasClaimedCol && next === "Not Interested") {
        payload.claimed_by = null;
      }
      if (clearsAppt) {
        payload.appt_date = null;
        if (hasScheduledByCol) {
          payload.appt_scheduled_by = null;
        }
      }
      const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
      if (error) {
        console.error(error);
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
          ...(hasClaimedCol && next === "Not Interested" ? { claimed_by: null } : {}),
          ...(clearsAppt
            ? {
                appt_date: null,
                ...(hasScheduledByCol ? { appt_scheduled_by: null, scheduler_profile: null } : {}),
              }
            : {}),
        });
        onLeadMetaChanged?.();
        refresh();
      }
      setStatusBusy(false);
    },
    [hasClaimedCol, hasScheduledByCol, lead.appt_scheduled_by, lead.status, leadId, onLeadMetaChanged, refresh, syncLeadInState, userId],
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
      const actorId = (authUser?.id ?? userId).trim();

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
      syncLeadInState(leadId, patch);
      onLeadMetaChanged?.();
      refresh();
    },
    [
      hasScheduledByCol,
      lead,
      lead.status,
      leadId,
      onLeadMetaChanged,
      profileMap,
      refresh,
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
      console.error(error);
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

  const claimedProfile = lead.claimed_by ? profileMap[lead.claimed_by] : undefined;

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
            {lead.claimed_by ? (
              <p className="crm-claimed-badge mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-rose-400/35 bg-gradient-to-r from-rose-500/15 to-fuchsia-900/20 px-3 py-1.5 text-xs font-medium text-rose-100/95">
                <LockMini />
                <span>
                  Claimed by{" "}
                  <span className="font-semibold text-white">
                    {displayProfessionalName(lead.claimed_by, claimedProfile)}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-emerald-950/40 p-2 text-zinc-400 transition hover:border-emerald-800/50 hover:bg-emerald-950/20 hover:text-white"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
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
            "flex-1 overflow-y-auto px-6 py-5 transition-[opacity,filter] duration-200",
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
          {/* —— Status: segmented control —— */}
          <section className="rounded-2xl border border-emerald-950/40 bg-[#080808] p-4 ring-1 ring-black/40">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500/90">
              Status
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">Pipeline — tap a stage to save instantly.</p>
            <div
              className="mt-3 flex flex-wrap gap-1 rounded-xl border border-emerald-950/50 bg-[#050505] p-1"
              role="tablist"
              aria-label="Lead status pipeline"
            >
              {LEAD_STATUSES.map((s) => {
                const active = status === s;
                const isAppt = s === "Appt Set";
                return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={statusBusy || apptStatusLocked}
                    onClick={() => {
                      setStatus(s);
                      void persistStatus(s);
                    }}
                    className={`relative flex-1 min-w-[5rem] rounded-lg px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide transition ${
                      active
                        ? isAppt
                          ? "crm-status-appt-set-active text-emerald-50"
                          : "bg-emerald-600/30 text-emerald-100 ring-1 ring-emerald-500/45"
                        : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
                    }`}
                  >
                    {s}
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
              <input
                id="appt-when"
                type="datetime-local"
                value={apptLocal}
                disabled={apptStatusLocked}
                onChange={(e) => {
                  setApptDirty(true);
                  setApptLocal(e.target.value);
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-emerald-950/50 bg-[#0c0c0e] px-3 text-sm text-zinc-100 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              />
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
              <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5 text-xs text-zinc-400">
                <span className="font-semibold text-zinc-500">Legacy note — </span>
                {lead.notes}
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <textarea
                value={noteDraft}
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
                  disabled={noteBusy || !noteDraft.trim()}
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

        <div className="border-t border-emerald-950/25 bg-[#09090b]/90 px-6 py-4">
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
