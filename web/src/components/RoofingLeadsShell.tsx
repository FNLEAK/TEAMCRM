"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { OwnerRoofingLeadsFooterLink } from "@/components/OwnerRoofingLeadsFooterLink";
import { RoofingLeadsManagementClient } from "@/components/RoofingLeadsManagementClient";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { LeadRow, TeamProfile } from "@/lib/leadTypes";

export function RoofingLeadsShell({
  poolEnabled,
  userId,
  userDisplayName,
  welcomeFirstName,
  canManageRoles,
  profileMap,
  calendarTeamMemberOrder,
  leads,
  totalCount,
  page,
  favoritesOnly,
  searchQuery,
  statusFilter,
  roofingKanbanLeads,
}: {
  poolEnabled: boolean;
  userId: string;
  userDisplayName: string;
  welcomeFirstName: string;
  canManageRoles: boolean;
  profileMap: Record<string, TeamProfile>;
  calendarTeamMemberOrder: string[];
  leads: LeadRow[];
  roofingKanbanLeads: LeadRow[];
  totalCount: number;
  page: number;
  favoritesOnly: boolean;
  searchQuery: string;
  statusFilter: string;
}) {
  const router = useRouter();

  const sidebarFooter = (
    <>
      <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/[0.09] via-[#0b0c0f]/92 to-[#0b0c0f]/92 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_22px_-14px_rgba(34,211,238,0.7)]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">Signed in</p>
        <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{userDisplayName}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        }}
        className="w-full rounded-xl border border-cyan-300/25 bg-cyan-500/[0.09] py-2 text-[13px] font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-500/[0.16]"
      >
        Sign out
      </button>
    </>
  );

  return (
    <DeskShell
      sections={commandDeskSections({ canManageRoles })}
      sidebarFooter={sidebarFooter}
      sidebarBelowFooter={canManageRoles ? <OwnerRoofingLeadsFooterLink /> : null}
    >
      <RoofingLeadsManagementClient
        poolEnabled={poolEnabled}
        leads={leads}
        roofingKanbanLeads={roofingKanbanLeads}
        totalCount={totalCount}
        page={page}
        favoritesOnly={favoritesOnly}
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        userId={userId}
        welcomeFirstName={welcomeFirstName}
        userDisplayName={userDisplayName}
        profileMap={profileMap}
        calendarTeamMemberOrder={calendarTeamMemberOrder}
        canManageRoles={canManageRoles}
      />
    </DeskShell>
  );
}
