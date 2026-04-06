/** First line of `leads.notes` for website call bookings — drawer uses this for styling. */
export const WEBSITE_CALL_BOOKING_TITLE = "Website call booking";

export type WebsiteCallBookingNotesInput = {
  email: string;
  topic: string;
  message: string;
  preferredAt: string;
  createdAtIso: string;
};

/** Plain, readable notes for the lead drawer (no debug-style labels). */
export function buildWebsiteCallBookingNotes(input: WebsiteCallBookingNotesInput): string {
  const blocks: string[] = [WEBSITE_CALL_BOOKING_TITLE, ""];

  const add = (heading: string, body: string) => {
    const t = body.trim();
    if (!t) return;
    blocks.push(heading, t, "");
  };

  add("Email", input.email);
  add("Topic", input.topic);
  add("Message", input.message);
  add("Preferred time", input.preferredAt);

  if (input.createdAtIso.trim()) {
    const d = new Date(input.createdAtIso);
    if (!Number.isNaN(d.getTime())) {
      blocks.push(
        "Submitted",
        d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
        "",
      );
    }
  }

  return blocks.join("\n").trimEnd();
}

export function isWebsiteCallBookingNotes(notes: string): boolean {
  const t = notes.trimStart();
  return t.startsWith(WEBSITE_CALL_BOOKING_TITLE) || t.includes("[Web-friendly · studio_booking.created]");
}

/** Older webhook format → friendlier labels for display (does not mutate DB). */
export function softenLegacyWebBookingNoteText(raw: string): string {
  let s = raw.trim().replace(/^\[Web-friendly · studio_booking\.created\]\s*\n?/i, "");
  const lines = s.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push("");
      continue;
    }
    if (/^source app booking\.status:/i.test(t)) continue;
    if (/^Email:\s*/i.test(t)) {
      out.push("Email", t.replace(/^Email:\s*/i, "").trim(), "");
    } else if (/^Topic:\s*/i.test(t)) {
      out.push("Topic", t.replace(/^Topic:\s*/i, "").trim(), "");
    } else if (/^Message:\s*/i.test(t)) {
      out.push("Message", t.replace(/^Message:\s*/i, "").trim(), "");
    } else if (/^Preferred \(visitor text, not validated\):\s*/i.test(t)) {
      out.push("Preferred time", t.replace(/^Preferred \(visitor text, not validated\):\s*/i, "").trim(), "");
    } else if (/^Created \(source\):\s*/i.test(t)) {
      out.push("Submitted", t.replace(/^Created \(source\):\s*/i, "").trim(), "");
    } else if (/^Updated \(source\):\s*/i.test(t)) {
      out.push("Last updated", t.replace(/^Updated \(source\):\s*/i, "").trim(), "");
    } else {
      out.push(t);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SECTION_LABELS = ["Email", "Topic", "Message", "Preferred time", "Submitted", "Last updated"] as const;

export type WebsiteCallBookingRow = { label: string; value: string };

/** Parse notes from `buildWebsiteCallBookingNotes` into rows for the drawer. */
export function parseWebsiteCallBookingNotesRows(notes: string): WebsiteCallBookingRow[] | null {
  const lines = notes.split("\n");
  if (!lines[0]?.trim().startsWith(WEBSITE_CALL_BOOKING_TITLE)) return null;

  const rows: WebsiteCallBookingRow[] = [];
  const labelSet = new Set<string>([...SECTION_LABELS]);
  let i = 0;
  while (i < lines.length && !lines[i]?.trim()) i++;
  if (!lines[i]?.trim().startsWith(WEBSITE_CALL_BOOKING_TITLE)) return null;
  i++;
  while (i < lines.length) {
    while (i < lines.length && !lines[i]?.trim()) i++;
    if (i >= lines.length) break;
    const label = lines[i]!.trim();
    if (!labelSet.has(label)) {
      i++;
      continue;
    }
    i++;
    while (i < lines.length && !lines[i]?.trim()) i++;
    const value = (lines[i] ?? "").trim();
    rows.push({ label, value });
    i++;
  }
  return rows;
}

/** Text shown for older stored notes (same card, pre-wrap body). */
export function websiteCallBookingNotesForDisplay(notes: string): string {
  const t = notes.trimStart();
  if (t.startsWith(WEBSITE_CALL_BOOKING_TITLE)) return notes.trim();
  return softenLegacyWebBookingNoteText(notes);
}
