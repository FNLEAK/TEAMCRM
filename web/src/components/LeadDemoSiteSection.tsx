"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  claimDemoBuildAction,
  releaseDemoBuildAction,
  setDemoSiteSentAction,
  setDemoSiteUrlAction,
} from "@/app/actions/leadDemoSiteActions";
import {
  demoBuildClaimedByUserId,
  hasDemoSiteUrl,
  isDemoSiteSent,
  isInterestedStage,
  normalizeDemoSiteUrl,
  type LeadRow,
  type TeamProfile,
} from "@/lib/leadTypes";
import { displayProfessionalName } from "@/lib/profileDisplay";

function demoHref(raw: LeadRow["demo_site_url"]): string {
  const t = normalizeDemoSiteUrl(raw).trim();
  if (!t) return "#";
  return t.startsWith("http") ? t : `https://${t}`;
}

export function LeadDemoSiteSection({
  leadId,
  lead,
  isOwner,
  userId,
  viewerDisplayName,
  profileMap,
  syncLeadInState,
  onBanner,
  onLeadMetaChanged,
}: {
  leadId: string;
  lead: LeadRow;
  isOwner: boolean;
  userId: string;
  viewerDisplayName: string;
  profileMap: Record<string, TeamProfile>;
  syncLeadInState: (id: string, patch: Partial<LeadRow>) => void;
  onBanner: (message: string | null) => void;
  onLeadMetaChanged?: () => void;
}) {
  const [draft, setDraft] = useState(() => normalizeDemoSiteUrl(lead.demo_site_url).trim());
  const [urlBusy, setUrlBusy] = useState(false);
  const [sentBusy, setSentBusy] = useState(false);
  const [buildLockBusy, setBuildLockBusy] = useState(false);

  useEffect(() => {
    setDraft(normalizeDemoSiteUrl(lead.demo_site_url).trim());
  }, [leadId, lead.demo_site_url]);

  const hasUrl = hasDemoSiteUrl(lead);
  const sent = isDemoSiteSent(lead);
  const claimUid = demoBuildClaimedByUserId(lead);
  const interested = isInterestedStage(lead.status);
  const claimerDisplay =
    claimUid != null
      ? claimUid === userId && viewerDisplayName.trim()
        ? viewerDisplayName.trim()
        : displayProfessionalName(claimUid, profileMap[claimUid])
      : "";
  const claimAtLabel = lead.demo_build_claimed_at
    ? new Date(lead.demo_build_claimed_at).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

  const sentAt = lead.demo_site_sent_at
    ? new Date(lead.demo_site_sent_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const saveUrl = async () => {
    if (!isOwner || urlBusy) return;
    setUrlBusy(true);
    onBanner(null);
    try {
      const r = await setDemoSiteUrlAction(leadId, draft);
      if (!r.ok) {
        onBanner(r.error ?? "Could not save demo link.");
        return;
      }
      const next = draft.trim() || null;
      syncLeadInState(leadId, { demo_site_url: next });
      onLeadMetaChanged?.();
      onBanner(next ? "Demo site link saved." : "Cleared.");
    } catch {
      onBanner("Could not save demo link. Check your connection and try again.");
    } finally {
      setUrlBusy(false);
    }
  };

  const clearUrl = async () => {
    if (!isOwner || urlBusy) return;
    setUrlBusy(true);
    onBanner(null);
    try {
      const r = await setDemoSiteUrlAction(leadId, null);
      if (!r.ok) {
        onBanner(r.error ?? "Could not remove link.");
        return;
      }
      setDraft("");
      syncLeadInState(leadId, {
        demo_site_url: null,
        demo_site_sent: false,
        demo_site_sent_at: null,
      });
      onLeadMetaChanged?.();
      onBanner("Demo site link removed.");
    } catch {
      onBanner("Could not remove link. Check your connection and try again.");
    } finally {
      setUrlBusy(false);
    }
  };

  const setSent = async (next: boolean) => {
    if (sentBusy) return;
    if (next && !hasUrl) {
      onBanner("Save a demo link first.");
      return;
    }
    if (next === sent) return;
    setSentBusy(true);
    onBanner(null);
    try {
      const r = await setDemoSiteSentAction(leadId, next);
      if (!r.ok) {
        onBanner(r.error ?? "Could not update status.");
        return;
      }
      syncLeadInState(leadId, {
        demo_site_sent: next,
        demo_site_sent_at: r.demo_site_sent_at ?? (next ? new Date().toISOString() : null),
      });
      onLeadMetaChanged?.();
    } catch {
      onBanner("Could not update status. Check your connection and try again.");
    } finally {
      setSentBusy(false);
    }
  };

  const claimBuild = async () => {
    if (!isOwner || buildLockBusy || claimUid) return;
    setBuildLockBusy(true);
    onBanner(null);
    try {
      const r = await claimDemoBuildAction(leadId);
      if (!r.ok) {
        onBanner(r.error ?? "Could not claim.");
        return;
      }
      syncLeadInState(leadId, {
        demo_build_claimed_by: userId,
        demo_build_claimed_at: new Date().toISOString(),
      });
      onLeadMetaChanged?.();
      onBanner("You’re marked as building this demo.");
    } catch {
      onBanner("Could not claim. Try again.");
    } finally {
      setBuildLockBusy(false);
    }
  };

  const releaseBuild = async () => {
    if (!isOwner || buildLockBusy || !claimUid) return;
    setBuildLockBusy(true);
    onBanner(null);
    try {
      const r = await releaseDemoBuildAction(leadId);
      if (!r.ok) {
        onBanner(r.error ?? "Could not release lock.");
        return;
      }
      syncLeadInState(leadId, { demo_build_claimed_by: null, demo_build_claimed_at: null });
      onLeadMetaChanged?.();
      onBanner("Demo build lock cleared.");
    } catch {
      onBanner("Could not release. Try again.");
    } finally {
      setBuildLockBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800/85 bg-zinc-950/40 p-3 ring-1 ring-black/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-500/85">Demo site</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
            Custom demo link for this lead — open anytime; owners edit the URL below.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/85">Who’s building the demo</p>
        <p className="mt-1 text-[11px] leading-snug text-zinc-400">
          Only account owners can claim or release. The other owner can release the lock if it was left on by mistake.
        </p>
        {claimUid ? (
          <p className="mt-2 text-xs font-medium text-sky-100/95">
            <span className="text-sky-300/90">{claimerDisplay}</span>
            <span className="font-normal text-zinc-500"> is building this demo.</span>
            {claimAtLabel ? (
              <span className="mt-0.5 block text-[10px] font-normal text-zinc-600">Since {claimAtLabel}</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No owner has claimed this yet — only one should build at a time.</p>
        )}
        {isOwner ? (
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {interested && !claimUid ? (
              <button
                type="button"
                disabled={buildLockBusy}
                onClick={() => void claimBuild()}
                className="rounded-lg border border-sky-500/45 bg-sky-600/20 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-400/55 hover:bg-sky-600/30 disabled:opacity-45"
              >
                {buildLockBusy ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Claiming…
                  </span>
                ) : (
                  "I’m building this demo"
                )}
              </button>
            ) : null}
            {!interested && !claimUid ? (
              <p className="text-[11px] text-zinc-600">Move this lead to Interested to claim who is building the demo.</p>
            ) : null}
            {claimUid ? (
              <button
                type="button"
                disabled={buildLockBusy}
                onClick={() => void releaseBuild()}
                className="rounded-lg border border-zinc-600/70 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900/90 disabled:opacity-45"
              >
                {buildLockBusy ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Releasing…
                  </span>
                ) : (
                  "Release lock"
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasUrl ? (
        <div className="mt-3 space-y-2">
          <a
            href={demoHref(lead.demo_site_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600/45 bg-emerald-500/[0.12] py-2.5 text-sm font-semibold text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-emerald-500/55 hover:bg-emerald-500/[0.18]"
          >
            <ExternalLink className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
            Open demo site
          </a>
          <p className="break-all text-center text-[11px] text-zinc-500">
            {normalizeDemoSiteUrl(lead.demo_site_url)}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-700/60 bg-[#09090b]/50 px-3 py-2.5 text-center text-xs text-zinc-500">
          No demo link yet{isOwner ? " — add one below." : " — ask an owner to add one."}
        </p>
      )}

      {isOwner ? (
        <div className="mt-4 border-t border-zinc-800/70 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/75">Owner · link</p>
          <label htmlFor={`demo-site-url-${leadId}`} className="sr-only">
            Demo URL
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id={`demo-site-url-${leadId}`}
              type="url"
              inputMode="url"
              placeholder="https://…"
              disabled={urlBusy}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700/70 bg-[#0c0c0e] px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/45 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={urlBusy}
                onClick={() => void saveUrl()}
                className="h-10 rounded-lg bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-500 disabled:opacity-45"
              >
                {urlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
              {hasUrl ? (
                <button
                  type="button"
                  disabled={urlBusy}
                  onClick={() => void clearUrl()}
                  className="h-10 rounded-lg border border-zinc-600/70 px-3 text-xs font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-45"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-zinc-800/70 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Customer status</p>
        <p className="mt-1 text-[11px] text-zinc-600">Has the customer been sent this demo?</p>
        {sentBusy ? (
          <div className="mt-2.5 flex items-center justify-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400/90" aria-hidden />
            <span className="text-xs text-zinc-500">Saving…</span>
          </div>
        ) : (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!hasUrl}
              onClick={() => void setSent(false)}
              className={clsx(
                "rounded-lg border py-2.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/35 disabled:cursor-not-allowed disabled:opacity-40",
                !sent && hasUrl
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_-10px_rgba(52,211,153,0.45)]"
                  : "border-zinc-700/80 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900/80",
              )}
            >
              Not sent
            </button>
            <button
              type="button"
              disabled={!hasUrl}
              onClick={() => void setSent(true)}
              className={clsx(
                "rounded-lg border py-2.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/35 disabled:cursor-not-allowed disabled:opacity-40",
                sent && hasUrl
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_-10px_rgba(52,211,153,0.45)]"
                  : "border-zinc-700/80 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900/80",
              )}
            >
              Sent
            </button>
          </div>
        )}
        {sent && sentAt ? (
          <p className="mt-2 text-center text-[10px] text-zinc-600">Marked {sentAt}</p>
        ) : null}
        {!hasUrl ? (
          <p className="mt-2 text-center text-[10px] text-zinc-600">Save a demo link to enable these buttons.</p>
        ) : null}
      </div>
    </div>
  );
}
