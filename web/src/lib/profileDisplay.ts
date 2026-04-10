import type { TeamProfile } from "@/lib/leadTypes";
import { initialsFromPersonFields } from "@/lib/leadTypes";
import { readableEmailLocalPart } from "@/lib/readableEmailLocal";

/**
 * Last-resort label when `profiles` has no name or email (avoid random id fragments in UI).
 * Prefer loading `profiles` via `fetchProfilesByIds` / `teamProfileFromDb` so real names show.
 */
export function anonymousUserLabel(_userId: string): string {
  return "Teammate";
}

function labelLooksLikeIdFragment(label: string): boolean {
  const t = label.trim();
  return /^[0-9a-f]{6,12}$/i.test(t);
}

/** True when `displayProfessionalName` would fall back to “Teammate” — no usable profile name or email. */
export function needsTeamRoleNameFallback(profile: TeamProfile | undefined): boolean {
  if (!profile) return true;
  if (profile.fullName?.trim()) return false;
  if (profile.firstName?.trim()) return false;
  if (profile.email?.trim()) return false;
  const lab = profile.label?.trim();
  if (lab && !labelLooksLikeIdFragment(lab)) return false;
  return true;
}

export type TeamRoleDisplay = { name: string; email?: string };

/** Apply `team_roles.account_name` / `account_email` when `profiles` did not yield a display name. */
export function mergeTeamRoleLabelIntoProfile(
  base: TeamProfile | undefined,
  role: TeamRoleDisplay,
): TeamProfile {
  const b =
    base ??
    ({
      initials: "·",
      label: "",
      fullName: "",
      firstName: "",
      email: undefined,
    } satisfies TeamProfile);
  const name = role.name.trim();
  const firstTok = name.split(/\s+/).filter(Boolean)[0] ?? name;
  const fromName = initialsFromPersonFields(name, "");
  return {
    ...b,
    fullName: b.fullName?.trim() || name,
    firstName: b.firstName?.trim() || firstTok,
    label: name,
    email: b.email?.trim() || role.email?.trim() || b.email,
    initials:
      b.initials && b.initials !== "·" && /^[a-zA-Z]/.test(b.initials) ? b.initials : fromName || "·",
  };
}

/**
 * Prefer `profiles.full_name`, then `first_name`, then label / fallbacks (for leaderboard, drawer, presence).
 */
/** e.g. `J.S.` for the Live pill — uses `avatar_initials` / profile.initials when possible. */
export function formatLiveViewerMonogram(
  profileInitials: string | undefined,
  displayName: string,
): string {
  const letters = (profileInitials ?? "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (letters.length >= 2) {
    return `${letters[0]}.${letters[1]}.`;
  }
  if (letters.length === 1) {
    return `${letters[0]}.`;
  }
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return `${a}.${b}.`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return `${parts[0][0]}.${parts[0][1]}.`.toUpperCase();
  }
  return "You";
}

export function displayProfessionalName(userId: string | null | undefined, profile?: TeamProfile): string {
  const full = profile?.fullName?.trim();
  if (full) return full;
  const first = profile?.firstName?.trim();
  if (first) return first;
  const lab = profile?.label?.trim();
  if (lab && !labelLooksLikeIdFragment(lab)) return lab;
  const mail = profile?.email?.trim();
  if (mail) return readableEmailLocalPart(mail);
  if (userId) return anonymousUserLabel(userId);
  return "Member";
}

/** Compact first-style label when space is tight (stars, chips). */
/**
 * Single letter for calendar event titles — prefers `avatar_initials` / profile.initials, then first letter of name.
 * Never uses UUID fragments.
 */
export function calendarSchedulerInitialLetter(profile: TeamProfile | undefined): string {
  const letters = (profile?.initials ?? "").replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 1) return letters[0].toUpperCase();
  const fn = profile?.fullName?.trim() || profile?.firstName?.trim() || "";
  if (fn.length >= 1) return fn[0].toUpperCase();
  const lab = profile?.label?.trim();
  if (lab && !/^[0-9a-f]{6,12}$/i.test(lab) && lab.length >= 1) return lab[0].toUpperCase();
  return "?";
}

/** Calendar pill title: `"J - Acme Roofing"`. Falls back to the first letter of the company name if no profile letter. */
export function calendarEventTitle(profile: TeamProfile | undefined, companyName: string): string {
  const co = companyName.trim() || "Lead";
  let letter = calendarSchedulerInitialLetter(profile);
  if (letter === "?") {
    const alnum = co.replace(/[^a-zA-Z0-9]/g, "");
    if (alnum.length >= 1) letter = alnum[0].toUpperCase();
  }
  return `${letter} - ${co}`;
}

export function displayFirstName(userId: string | null | undefined, profile?: TeamProfile): string {
  const first = profile?.firstName?.trim();
  if (first) return first;
  const full = profile?.fullName?.trim();
  if (full) {
    const token = full.split(/\s+/).filter(Boolean)[0];
    if (token) return token;
  }
  const lab = profile?.label?.trim();
  if (lab && !labelLooksLikeIdFragment(lab)) {
    const t = lab.split(/\s+/).filter(Boolean)[0];
    if (t) return t;
  }
  const mail = profile?.email?.trim();
  if (mail) return readableEmailLocalPart(mail);
  if (userId) return anonymousUserLabel(userId);
  return "Member";
}
