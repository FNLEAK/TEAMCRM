"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import { BulkImportModal } from "@/components/BulkImportModal";
import { ImportHistory } from "@/components/ImportHistory";

type ToastState = { message: string; tone: "success" | "error" } | null;

type CommandCenterBarProps = {
  onDataChanged: () => void;
  /** Hides the label and tightens layout for the dashboard header row. */
  compact?: boolean;
};

export function CommandCenterBar({
  onDataChanged,
  compact,
}: CommandCenterBarProps) {
  const { isMobileShell: layoutMobileShell } = useDeskLayout();
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 4200);
  }, []);

  const [singleOpen, setSingleOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [singleSaving, setSingleSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleSaveSingle = async () => {
    const name = companyName.trim();
    if (!name) {
      showToast("Company name is required.", "error");
      return;
    }
    setSingleSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("leads").insert({
      company_name: name,
      phone: phone.trim() || null,
      website: website.trim() || null,
      status: "New",
    });
    setSingleSaving(false);
    if (error) {
      console.error(error);
      showToast(error.message || "Could not save lead.", "error");
      return;
    }
    setCompanyName("");
    setPhone("");
    setWebsite("");
    setSingleOpen(false);
    showToast("Lead added successfully.", "success");
    onDataChanged();
  };

  return (
    <>
      <div
        className={clsx(
          compact
            ? layoutMobileShell
              ? "flex w-full flex-col gap-2 @min-[480px]:flex-row @min-[480px]:flex-wrap @min-[480px]:items-center @min-[480px]:justify-end"
              : "flex w-full flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:justify-end"
            : layoutMobileShell
              ? "flex flex-col items-stretch gap-2 @sm:items-end"
              : "flex flex-col items-stretch gap-2 sm:items-end",
        )}
      >
        {!compact ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Command center</p>
        ) : null}
        <div
          className={clsx(
            "flex flex-col gap-2",
            compact
              ? layoutMobileShell
                ? "w-full @min-[480px]:flex-row @min-[480px]:flex-wrap @min-[480px]:items-stretch"
                : "w-full min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-stretch"
              : "w-full",
          )}
        >
          <div
            className={clsx(
              "flex gap-2",
              compact
                ? layoutMobileShell
                  ? "w-full flex-col @min-[480px]:w-auto @min-[480px]:flex-row @min-[480px]:flex-wrap"
                  : "w-full flex-col min-[480px]:w-auto min-[480px]:flex-row min-[480px]:flex-wrap"
                : "flex-wrap justify-end",
            )}
          >
            <button
              type="button"
              onClick={() => setSingleOpen(true)}
              className={`rounded-md border border-emerald-700/50 bg-emerald-900/30 font-medium text-emerald-100 transition hover:border-emerald-600/60 hover:bg-emerald-900/45 ${
                compact
                  ? "w-full px-3 py-2.5 text-xs @min-[480px]:w-auto @min-[480px]:py-2"
                  : "px-4 py-2.5 text-sm"
              }`}
            >
              Add single lead
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className={`rounded-md border border-white/10 bg-[#0a0a0a] font-medium text-zinc-300 transition hover:border-white/15 hover:bg-white/[0.04] ${
                compact
                  ? "w-full px-3 py-2.5 text-xs @min-[480px]:w-auto @min-[480px]:py-2"
                  : "px-4 py-2.5 text-sm"
              }`}
            >
              Bulk import (CSV)
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className={`rounded-md border border-white/10 bg-[#0a0a0a] font-medium text-zinc-300 transition hover:border-white/15 hover:bg-white/[0.04] ${
                compact
                  ? "w-full px-3 py-2.5 text-xs @min-[480px]:w-auto @min-[480px]:py-2"
                  : "px-4 py-2.5 text-sm"
              }`}
            >
              Recent imports
            </button>
          </div>
        </div>
      </div>

      {singleOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => !singleSaving && setSingleOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-950/40 bg-[#0c0c0e] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06]">
            <h2 className="text-lg font-semibold text-white">Add single lead</h2>
            <p className="mt-1 text-sm text-zinc-500">Creates one row in Supabase — shows up for the whole team.</p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-400">Company name</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/[0.1] bg-[#09090b] px-3 text-sm text-zinc-100 focus:border-emerald-500/45 focus:outline-none focus:ring-1 focus:ring-emerald-500/35"
                  placeholder="Acme Roofing"
                  autoComplete="organization"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-400">Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/[0.1] bg-[#09090b] px-3 text-sm text-zinc-100 focus:border-emerald-500/45 focus:outline-none focus:ring-1 focus:ring-emerald-500/35"
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-400">Website</span>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/[0.1] bg-[#09090b] px-3 text-sm text-zinc-100 focus:border-emerald-500/45 focus:outline-none focus:ring-1 focus:ring-emerald-500/35"
                  placeholder="acme.com"
                  autoComplete="url"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={singleSaving}
                onClick={() => setSingleOpen(false)}
                className="rounded-xl border border-white/[0.1] px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={singleSaving}
                onClick={() => void handleSaveSingle()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-50"
              >
                {singleSaving ? "Saving…" : "Save lead"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDataChanged={onDataChanged}
        onNotify={showToast}
      />

      <ImportHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onDataChanged={onDataChanged}
        onNotify={showToast}
      />

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[70] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-500/40 bg-emerald-950/95 text-emerald-100"
              : "border-rose-500/40 bg-rose-950/95 text-rose-100"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
