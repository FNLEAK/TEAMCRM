/**
 * Client-safe security toggles (NEXT_PUBLIC_* only).
 * True enforcement for data access stays in Supabase RLS + dashboard (signup toggle, confirm email).
 */

/** When "true", signup UI is hidden — use with Supabase "Disable new users" or invite-only workflow. */
export function isPublicSignupDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_PUBLIC_SIGNUP === "true";
}

/**
 * If set (comma-separated domains, no @), signup email must end with one of these domains.
 * Example: NEXT_PUBLIC_SIGNUP_ALLOWED_DOMAINS=yourcompany.com
 * Empty / unset = any domain (still subject to Supabase rules).
 */
export function signupEmailDomainAllowed(email: string): boolean {
  const raw = process.env.NEXT_PUBLIC_SIGNUP_ALLOWED_DOMAINS?.trim();
  if (!raw) return true;
  const domains = raw
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (domains.length === 0) return true;
  const at = email.indexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domains.some((d) => domain === d);
}

/** Short hint for signup UI when domains are restricted. */
export function signupAllowedDomainsHint(): string | null {
  const raw = process.env.NEXT_PUBLIC_SIGNUP_ALLOWED_DOMAINS?.trim();
  if (!raw) return null;
  return `New accounts must use an email on: ${raw.replace(/[\s,]+/g, ", ")}`;
}
