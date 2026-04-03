import type { DeskNavSection } from "@/components/DeskShell";

type DeskNavOptions = {
  canManageRoles?: boolean;
};

/** Supabase Command desk — primary routes */
export function commandDeskSections(opts: DeskNavOptions = {}): DeskNavSection[] {
  const canManageRoles = opts.canManageRoles === true;
  return [
    {
      title: "Navigate",
      items: [
        { href: "/pipeline-command-center", label: "Performance KPI Header", end: true },
        { href: "/", label: "Lead Management", end: true },
        { href: "/personal-stats", label: "Personal Stats", end: true },
        ...(canManageRoles ? [{ href: "/role-applier", label: "Admin Panel", end: true as const }] : []),
        { href: "/packages", label: "Packages", end: true },
      ],
    },
    {
      title: "",
      pinToBottom: true,
      items: [
        { href: "/team-chat", label: "Team Chat", end: true },
        { href: "/how-to", label: "Team Guide", end: true },
      ],
    },
  ];
}

/** JWT pipeline app — no Command (Supabase-only home) */
export function pipelineDeskSections(opts: DeskNavOptions = {}): DeskNavSection[] {
  const canManageRoles = opts.canManageRoles === true;
  return [
    {
      title: "Navigate",
      items: [
        { href: "/pipeline-command-center", label: "Performance KPI Header", end: true },
        { href: "/personal-stats", label: "Personal Stats", end: true },
        ...(canManageRoles ? [{ href: "/role-applier", label: "Admin Panel", end: true as const }] : []),
      ],
    },
    {
      title: "",
      pinToBottom: true,
      items: [
        { href: "/team-chat", label: "Team Chat", end: true },
        { href: "/how-to", label: "Team Guide", end: true },
      ],
    },
  ];
}
