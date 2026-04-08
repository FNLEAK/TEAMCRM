"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Copy, Image, Link2, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { isLeadDemoSent, leadHasPinnedDemo, type LeadRow } from "@/lib/leadTypes";
import { pinLeadSelectedDemoAction, setLeadDemoSentAction } from "@/app/actions/leadDemoActions";

export type JobPhotoRow = {
  id: string;
  title: string;
  url: string;
  sort_order: number;
  created_at: string;
};

function sharePagePath(token: string): string {
  return `/job-proof/${token}`;
}

function looksLikeDirectImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url.trim());
}

export function LeadJobDemoSection({
  leadId,
  lead,
  disabled,
  syncLeadInState,
  onBanner,
  onLeadMetaChanged,
}: {
  leadId: string;
  lead: LeadRow;
  disabled: boolean;
  syncLeadInState: (id: string, patch: Partial<LeadRow>) => void;
  onBanner: (message: string | null) => void;
  onLeadMetaChanged?: () => void;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [photos, setPhotos] = useState<JobPhotoRow[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryErr, setGalleryErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [sentToggleBusy, setSentToggleBusy] = useState(false);
  const [applyLinkBusy, setApplyLinkBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [linkDraft, setLinkDraft] = useState(() => (lead.selected_demo_url ?? "").trim());

  const hasDemo = leadHasPinnedDemo(lead);
  const sent = isLeadDemoSent(lead);
  const token = lead.demo_share_token?.trim() ?? "";
  const shareUrl =
    typeof window !== "undefined" && token ? `${window.location.origin}${sharePagePath(token)}` : "";

  useEffect(() => {
    setLinkDraft((lead.selected_demo_url ?? "").trim());
  }, [leadId, lead.selected_demo_url]);

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    setGalleryErr(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("job_photos")
      .select("id, title, url, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setGalleryLoading(false);
    if (error) {
      setGalleryErr(error.message);
      setPhotos([]);
      return;
    }
    setPhotos((data as JobPhotoRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!galleryOpen) return;
    void loadGallery();
  }, [galleryOpen, loadGallery]);

  const pinUrl = async (url: string | null) => {
    if (disabled || pinBusy) return;
    setPinBusy(true);
    onBanner(null);
    const r = await pinLeadSelectedDemoAction(leadId, url?.trim() || null);
    setPinBusy(false);
    if (!r.ok) {
      onBanner(r.error ?? "Could not save demo.");
      return;
    }
    const next = url?.trim() || null;
    syncLeadInState(leadId, { selected_demo_url: next });
    setLinkDraft(next ?? "");
    onLeadMetaChanged?.();
    setGalleryOpen(false);
    onBanner(next ? "Demo saved on this lead." : "Demo link cleared.");
  };

  const applyPastedLink = async () => {
    if (disabled || applyLinkBusy) return;
    const t = linkDraft.trim();
    if (!t) {
      onBanner("Paste a link to the job photo, folder, or storage URL.");
      return;
    }
    setApplyLinkBusy(true);
    onBanner(null);
    const r = await pinLeadSelectedDemoAction(leadId, t);
    setApplyLinkBusy(false);
    if (!r.ok) {
      onBanner(r.error ?? "Could not save link.");
      return;
    }
    syncLeadInState(leadId, { selected_demo_url: t });
    onLeadMetaChanged?.();
    onBanner("Demo link saved on this lead.");
  };

  const toggleSent = async (next: boolean) => {
    if (disabled || sentToggleBusy) return;
    if (next && !hasDemo) {
      onBanner("Add a demo link first — paste a URL below or pick from the gallery.");
      return;
    }
    setSentToggleBusy(true);
    onBanner(null);
    const r = await setLeadDemoSentAction(leadId, next);
    setSentToggleBusy(false);
    if (!r.ok) {
      onBanner(r.error ?? "Could not update sent status.");
      return;
    }
    syncLeadInState(leadId, {
      demo_sent_status: next,
      demo_sent_at: r.demo_sent_at ?? (next ? new Date().toISOString() : null),
    });
    onLeadMetaChanged?.();
  };

  const copyCustomerLink = async () => {
    if (disabled || copyBusy) return;
    if (!hasDemo) {
      onBanner("Add a demo link first.");
      return;
    }
    if (!token) {
      onBanner("Missing share token — run web/supabase/leads-job-demo-proof.sql on your database.");
      return;
    }
    setCopyBusy(true);
    onBanner(null);
    try {
      const url = `${window.location.origin}${sharePagePath(token)}`;
      await navigator.clipboard.writeText(url);
      onBanner("Branded customer link copied — toggle “Sent” when they’ve received it.");
    } catch {
      onBanner("Could not copy — select the link below manually.");
    } finally {
      setCopyBusy(false);
    }
  };

  const sentAtLabel = lead.demo_sent_at
    ? new Date(lead.demo_sent_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <>
      <section className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-950/35 p-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-500/85">
            <Image className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            Job demo &amp; proof
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            Attach what you’ll show the customer, copy the clean share page, then mark whether it’s been sent.
          </p>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3 border-t border-zinc-800/60 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Sent to customer</p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              Turn on after you text, email, or hand them the link. Everyone sees this on the lead list.
            </p>
            {sent && sentAtLabel ? (
              <p className="mt-1 text-[10px] text-zinc-600">Logged {sentAtLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sent}
            disabled={disabled || sentToggleBusy || (!hasDemo && !sent)}
            title={!hasDemo && !sent ? "Add a demo link first" : undefined}
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
            <span className="sr-only">{sent ? "Marked sent to customer" : "Not marked sent"}</span>
          </button>
        </div>
        {!hasDemo && !sent ? (
          <p className="mt-2 text-[10px] text-amber-200/75">Switch enables once a demo link is set.</p>
        ) : null}

        <div className="mt-4 rounded-xl border border-zinc-800/80 bg-[#09090b]/80 px-3 py-2.5">
          <label htmlFor={`demo-link-${leadId}`} className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Demo link
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id={`demo-link-${leadId}`}
              type="url"
              inputMode="url"
              placeholder="https://… (photo, folder, or storage URL)"
              disabled={disabled || applyLinkBusy}
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700/70 bg-[#0c0c0e] px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/45 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
            <button
              type="button"
              disabled={disabled || applyLinkBusy}
              onClick={() => void applyPastedLink()}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-600/45 bg-emerald-600/20 px-4 text-xs font-bold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-600/30 disabled:opacity-45"
            >
              {applyLinkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" strokeWidth={2.25} />}
              Apply
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || pinBusy}
              onClick={() => setGalleryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600/60 bg-zinc-900/60 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-zinc-500/60 disabled:opacity-45"
            >
              {pinBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" strokeWidth={2.25} />}
              Pick from library
            </button>
            <button
              type="button"
              disabled={disabled || copyBusy || !hasDemo || !token}
              onClick={() => void copyCustomerLink()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600/60 bg-zinc-900/60 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-zinc-500/60 disabled:opacity-45"
            >
              {copyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />}
              Copy customer link
            </button>
          </div>
          {token && hasDemo ? (
            <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-zinc-600">
              {shareUrl || sharePagePath(token)}
            </p>
          ) : null}
        </div>
      </section>

      {galleryOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close gallery"
            className="absolute inset-0 bg-[#030304]/90 backdrop-blur-md"
            onClick={() => setGalleryOpen(false)}
          />
          <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-emerald-950/40 bg-[#0c0c0e] shadow-[0_0_80px_-20px_rgba(16,185,129,0.25)] sm:rounded-2xl sm:border-zinc-800/80">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
              <h4 className="text-sm font-semibold text-zinc-100">Proof library</h4>
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                className="rounded-lg border border-zinc-700/60 px-2 py-1 text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {galleryLoading ? (
                <p className="text-sm text-zinc-500">Loading library…</p>
              ) : galleryErr ? (
                <p className="text-sm text-rose-300/90">
                  {galleryErr}
                  <span className="mt-2 block text-xs text-zinc-500">
                    Confirm <code className="text-zinc-400">job_photos</code> exists — run{" "}
                    <code className="text-zinc-400">web/supabase/leads-job-demo-proof.sql</code>.
                  </span>
                </p>
              ) : photos.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No library photos yet — use <span className="text-zinc-400">Paste demo link</span> above, or add rows to{" "}
                  <code className="text-zinc-400">job_photos</code>.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((p) => {
                    const active = lead.selected_demo_url?.trim() === p.url.trim();
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={disabled || pinBusy}
                          onClick={() => void pinUrl(p.url)}
                          className={clsx(
                            "w-full overflow-hidden rounded-xl border text-left transition",
                            active
                              ? "border-emerald-500/55 ring-2 ring-emerald-500/25"
                              : "border-zinc-700/80 hover:border-emerald-600/35",
                          )}
                        >
                          <div className="relative aspect-square bg-zinc-900">
                            {looksLikeDirectImageUrl(p.url) ? (
                              // eslint-disable-next-line @next/next/no-img-element -- arbitrary CDN / storage URLs
                              <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full items-center justify-center p-2">
                                <Image className="h-10 w-10 text-zinc-600" strokeWidth={1.25} />
                              </div>
                            )}
                          </div>
                          <p className="line-clamp-2 px-2 py-1.5 text-[11px] font-medium text-zinc-300">{p.title}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-zinc-800/80 p-4">
              <button
                type="button"
                disabled={disabled || pinBusy || !hasDemo}
                onClick={() => void pinUrl(null)}
                className="w-full rounded-xl border border-zinc-700/60 py-2 text-xs font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
              >
                Clear demo link
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
