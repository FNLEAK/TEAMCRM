"use client";

import { schedulerTeamAvatarClass } from "@/lib/calendarSchedulerColors";
import type { TeamProfile } from "@/lib/leadTypes";

function initialsForAvatar(profile: TeamProfile | undefined, maxLen = 2): string {
  const raw = (profile?.initials ?? "").trim().toUpperCase();
  if (raw.length >= 2) return raw.slice(0, maxLen);
  if (raw.length === 1) return raw;
  const fn = profile?.fullName?.trim() || profile?.firstName?.trim() || "";
  if (fn.length >= 1) return fn[0].toUpperCase();
  return "·";
}

type TeamMemberAvatarProps = {
  userId: string;
  profile: TeamProfile | undefined;
  teamMemberColorOrder: readonly string[];
  /** When true, use deep-emerald “my schedule” styling instead of roster index */
  variant?: "team" | "my";
  className?: string;
  title?: string;
};

export function TeamMemberAvatar({
  userId,
  profile,
  teamMemberColorOrder,
  variant = "team",
  className = "",
  title,
}: TeamMemberAvatarProps) {
  const colorClass =
    variant === "my" ? "crm-team-avatar-my" : schedulerTeamAvatarClass(userId, teamMemberColorOrder);
  const text = initialsForAvatar(profile);
  return (
    <span
      className={`crm-team-avatar ${colorClass} ${className}`.trim()}
      title={title ?? profile?.fullName ?? profile?.label}
      aria-hidden
    >
      {text}
    </span>
  );
}
