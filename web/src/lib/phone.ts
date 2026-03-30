/** Normalize stored phone to a `tel:` href (digits + optional leading `+`) for click-to-call. */
export function buildTelHref(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "tel:";
  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");
  const dial = hasPlus ? `+${digitsOnly}` : digitsOnly;
  return `tel:${dial}`;
}
