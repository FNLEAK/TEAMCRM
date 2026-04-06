"use client";

import {
  WEBSITE_CALL_BOOKING_TITLE,
  parseWebsiteCallBookingNotesRows,
  websiteCallBookingNotesForDisplay,
} from "@/lib/websiteCallBookingNotes";

export function WebsiteBookingNotesCard({ notes }: { notes: string }) {
  const trimmed = notes.trim();
  const isNewFormat = trimmed.startsWith(WEBSITE_CALL_BOOKING_TITLE);
  const rows = isNewFormat ? parseWebsiteCallBookingNotesRows(trimmed) : null;
  const body =
    isNewFormat && rows && rows.length > 0
      ? null
      : websiteCallBookingNotesForDisplay(trimmed);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/35 via-[#0a0f0d]/90 to-zinc-950/70 shadow-[inset_0_1px_0_rgba(16,185,129,0.1)]">
      <div className="border-b border-emerald-500/20 bg-emerald-950/40 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400/95">
          Website booking
        </span>
        <p className="mt-0.5 text-[10px] text-zinc-500">From your site — submitted details below.</p>
      </div>
      <div className="px-3 py-3">
        {isNewFormat && rows && rows.length > 0 ? (
          <dl className="space-y-3.5">
            {rows.map((r) => (
              <div key={r.label}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{r.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-100">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">{body}</p>
        )}
      </div>
    </div>
  );
}
