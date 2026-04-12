/** US NANP: strip to 10 digits when input is 10 digits, +1…, or 1 + 10 digits. */
export function parseUsPhoneDigits10(input: string | null | undefined): string | null {
  if (input == null) return null;
  const d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

/** Display as (XXX)-XXX-XXXX when input is a US 10- or 11-digit NANP number. */
export function formatUsPhoneDisplay(input: string | null | undefined): string | null {
  const ten = parseUsPhoneDigits10(input);
  if (!ten || ten.length !== 10) return null;
  return `(${ten.slice(0, 3)})-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Canonical value for `leads.phone`: formatted US when parsable; otherwise trimmed raw (e.g. intl).
 */
export function normalizeLeadPhoneForStorage(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const formatted = formatUsPhoneDisplay(raw);
  return formatted ?? raw;
}

/** Table / card UI: formatted US number, else raw, else empty (caller shows "—"). */
export function displayLeadPhone(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  return formatUsPhoneDisplay(raw) ?? raw;
}

/** Normalize stored phone to a `tel:` href (digits + optional leading `+`) for click-to-call. */
export function buildTelHref(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "tel:";
  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");
  const dial = hasPlus ? `+${digitsOnly}` : digitsOnly;
  return `tel:${dial}`;
}
