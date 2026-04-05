/**
 * Canonical origin for Supabase auth emails (confirmation, magic link, password reset).
 * Must match an entry under Supabase → Authentication → URL Configuration → Redirect URLs
 * (e.g. https://your-domain.vercel.app/** and https://your-domain.vercel.app/auth/callback).
 */
export function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (raw) return raw;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getAuthCallbackUrl(): string {
  const origin = getSiteOrigin();
  if (!origin) return "";
  return `${origin}/auth/callback`;
}
