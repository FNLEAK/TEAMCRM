"use client";

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { setDemoSiteSentAction, setDemoSiteUrlAction } from "@/app/actions/leadDemoSiteActions";
import { hasDemoSiteUrl, isDemoSiteSent, type LeadRow } from "@/lib/leadTypes";

function demoHref(raw: string): string {
  const t = raw.trim();
  return t.startsWith("http") ? t : `https://${t}`;
}

/** Same dt/dd shape as LeadDetailDrawer `DetailItem` — sits inside the lead info `<dl>` grid. */
function GridField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-200">{children}</dd>
    </div>
  );
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
    <>
      <GridField label="Demo site">
        <div className="space-y-2">
          {hasUrl ? (
            <a
              href={demoHref(lead.demo_site_url!)}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-medium text-emerald-300/90 hover:text-emerald-200 hover:underline"
            >
              {lead.demo_site_url}
            </a>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
          {isOwner ? (
            <div className="border-t border-zinc-800/70 pt-2">
              <label htmlFor={`demo-site-url-${leadId}`} className="sr-only">
                Demo site URL
              </label>
              <input
                id={`demo-site-url-${leadId}`}
                type="url"
                inputMode="url"
                placeholder="https://… (owners only)"
                disabled={urlBusy}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700/70 bg-[#0c0c0e] px-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/45 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={urlBusy}
                  onClick={() => void saveUrl()}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-500 disabled:opacity-45"
                >
                  {urlBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </button>
                {hasUrl ? (
                  <button
                    type="button"
                    disabled={urlBusy}
                    onClick={() => void clearUrl()}
                    className="rounded-lg border border-zinc-600/70 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-45"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </GridField>

      <GridField label="Demo sent">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={sent}
            disabled={sentBusy || (!hasUrl && !sent)}
            title={!hasUrl && !sent ? "Owner must add a demo link first" : undefined}
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
            <span className="sr-only">{sent ? "Sent to customer" : "Not sent"}</span>
          </button>
          <span className="text-xs text-zinc-500">
            {sent ? (
              <>
                <span className="text-emerald-400/90">Sent</span>
                {sentAt ? <span className="text-zinc-600"> · {sentAt}</span> : null}
              </>
            ) : (
              "Not sent"
            )}
          </span>
        </div>
      </GridField>
    </>
  );
}
