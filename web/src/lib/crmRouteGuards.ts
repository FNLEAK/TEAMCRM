/**
 * Route classification for Supabase session + optional owner approval gate.
 * Roles live in `public.team_roles` (not `profiles`) in this CRM.
 */

/**
 * Owner approval is ON by default. Set NEXT_PUBLIC_REQUIRE_OWNER_APPROVAL=false to restore
 * legacy behavior (auto team row on login, no modal / API block).
 */
export function ownerApprovalGateEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_REQUIRE_OWNER_APPROVAL?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off") return false;
  return true;
}

/** Paths that never require a Supabase session (sign-in / callbacks / legacy register). */
export function allowsAnonymousSupabasePath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/waiting-approval" ||
    pathname.startsWith("/auth/callback") ||
    pathname === "/register"
  );
}

/**
 * Server-to-server webhooks: no Supabase session — each route validates its own secret
 * (Stripe signature, Bearer token, etc.). Must bypass global auth middleware.
 */
export function isInboundWebhookApiPath(pathname: string): boolean {
  if (pathname === "/api/stripe/webhook" || pathname.startsWith("/api/stripe/webhook/")) {
    return true;
  }
  if (pathname.startsWith("/api/webhooks/")) {
    return true;
  }
  return false;
}

/**
 * CRM routes that should redirect to /login when there is no Supabase user.
 * (Other routes, e.g. /pipeline with legacy JWT, stay untouched by this list.)
 */
export function requiresSupabaseSession(pathname: string): boolean {
  if (allowsAnonymousSupabasePath(pathname)) return false;
  if (isInboundWebhookApiPath(pathname)) return false;

  if (pathname.startsWith("/api/")) {
    return true;
  }

  const exact = new Set([
    "/",
    "/pipeline-command-center",
    "/personal-stats",
    "/roofing-leads",
    "/role-applier",
    "/packages",
    "/team-chat",
    "/how-to",
    "/dashboard",
    "/squad",
  ]);
  if (exact.has(pathname)) return true;

  const prefixes = ["/team-chat/", "/how-to/", "/leads/", "/demo/"];
  if (prefixes.some((p) => pathname.startsWith(p))) return true;

  return false;
}
