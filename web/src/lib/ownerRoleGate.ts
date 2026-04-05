/** Override with NEXT_PUBLIC_OWNER_EMAIL on Vercel; keep in sync with team-roles.sql bootstrap clause if used. */
export const OWNER_EMAIL =
  process.env.NEXT_PUBLIC_OWNER_EMAIL?.trim().toLowerCase() || "teamwebfriendly@gmail.com";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === OWNER_EMAIL;
}
