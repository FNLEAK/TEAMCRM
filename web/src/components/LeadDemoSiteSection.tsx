"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Loader2 } from "lucide-react";
import { setDemoSiteSentAction, setDemoSiteUrlAction } from "@/app/actions/leadDemoSiteActions";
import { hasDemoSiteUrl, isDemoSiteSent, type LeadRow } from "@/lib/leadTypes";

function demoHref(raw: string): string {
  const t = raw.trim();
  return t.startsWith("http") ? t : `https://${t}`;
}

export function LeadDemoSiteSection({
  leadId,
  lead,
  isOwner,
  syncLeadInState,
  onBanner,
  onLeadMetaChanged,
}: {
  leadId: string;
  lead: LeadRow;
  isOwner: boolean;
  syncLeadInState: (id: string, patch: Partial<LeadRow>) => void;
  onBanner: (message: string | null) => void;
  onLeadMetaChanged?: () => void;
}) {
  const [draft, setDraft] = useState(() => (lead.demo_site_url ?? "").trim());
  const [urlBusy, setUrlBusy] = useState(false);
  const [sentBusy, setSentBusy] = useState(false);

  useEffect(() => {
    setDraft((lead.demo_site_url ?? "").trim());
  }, [leadId, lead.demo_site_url]);

  const hasUrl = hasDemoSiteUrl(lead);
  const sent = isDemoSiteSent(lead);
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
    const r = await setDemoSiteUrlAction(leadId, draft);
    setUrlBusy(false);
    if (!r.ok) {
      onBanner(r.error ?? "Could not save demo link.");
      return;
    }
    const next = draft.trim() || null;
    syncLeadInState(leadId, { demo_site_url: next });
    onLeadMetaChanged?.();
    onBanner(next ? "Demo site link saved." : "Cleared.");
  };

  const clearUrl = async () => {
    if (!isOwner || urlBusy) return;
    setUrlBusy(true);
    onBanner(null);
    const r = await setDemoSiteUrlAction(leadId, null);
    setUrlBusy(false);
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
  };

  const toggleSent = async (next: boolean) => {
    if (sentBusy) return;
    if (next && !hasUrl) {
      onBanner("Owner needs to add a demo link first.");
      return;
    }
    setSentBusy(true);
    onBanner(null);
    const r = await setDemoSiteSentAction(leadId, next);
    setSentBusy(false);
    if (!r.ok) {
      onBanner(r.error ?? "Could not update sent status.");
      return;
    }
    syncLeadInState(leadId, {
      demo_site_sent: next,
      demo_site_sent_at: r.demo_site_sent_at ?? (next ? new Date().toISOString() : null),
    });
    onLeadMetaChanged?.();
  };

  return (
    <section className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-950/35 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-500/85">Demo site</h3>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        {isOwner
          ? "Paste a link to the custom demo page for this lead. Team members can open it and mark when the customer has received it."
          : "Owner-set link for this account. Tap the link to open; use the switch when the customer has been sent the demo."}
      </p>

      {hasUrl ? (
        <a
          href={demoHref(lead.demo_site_url!)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-2 break-all rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2.5 text-sm font-medium text-emerald-300/95 transition hover:border-emerald-600/45 hover:bg-emerald-950/35 hover:text-emerald-200"
        >
          <ExternalLink className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
          <span>{lead.demo_site_url}</span>
        </a>
      ) : (
        <p className="mt-3 rounded-lg border border-zinc-800/80 bg-[#09090b]/60 px-3 py-2 text-xs text-zinc-500">
          No demo link yet.
        </p>
      )}

      {isOwner ? (
        <div className="mt-3 space-y-2 border-t border-zinc-800/60 pt-3">
          <label htmlFor={`demo-site-url-${leadId}`} className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Set demo URL <span className="text-amber-200/80">(owners only)</span>
          </label>
          <input
            id={`demo-site-url-${leadId}`}
            type="url"
            inputMode="url"
            placeholder="https://demo.example.com/…"
            disabled={urlBusy}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-700/70 bg-[#0c0c0e] px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/45 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={urlBusy}
              onClick={() => void saveUrl()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-500 disabled:opacity-45"
            >
              {urlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save link"}
            </button>
            {hasUrl ? (
              <button
                type="button"
                disabled={urlBusy}
                onClick={() => void clearUrl()}
                className="rounded-lg border border-zinc-600/70 px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-45"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-start justify-between gap-3 border-t border-zinc-800/60 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Sent to customer</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">Turn on after you share the demo link with them.</p>
          {sent && sentAt ? <p className="mt-1 text-[10px] text-zinc-600">Marked {sentAt}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={sent}
          disabled={sentBusy || (!hasUrl && !sent)}
          title={!hasUrl && !sent ? "Add a demo link first" : undefined}
          onClick={() => void toggleSent(!sent)}
          className={clsx(
            "relative h-7 w-12 shrink-0 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 disabled:opacity-50",
            sent ? "border-emerald-400/50 bg-emerald-600/35" : "border-zinc-600/60 bg-zinc-800/80",
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200",
              sent ? "left-[calc(100%-1.625rem)]" : "left-0.5",
            )}
          />
          <span className="sr-only">{sent ? "Sent" : "Not sent"}</span>
        </button>
      </div>
    </section>
  );
}
