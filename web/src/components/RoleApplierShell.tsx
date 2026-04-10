"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { RoleApplierPanel } from "@/components/RoleApplierPanel";
import { CloseApprovalPanel } from "@/components/CloseApprovalPanel";
import { RewardVaultPanel } from "@/components/RewardVaultPanel";

export function RoleApplierShell({
  ownerId,
  userDisplayName,
  ownerEmail,
}: {
  ownerId: string;
  userDisplayName: string;
  ownerEmail: string;
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
      sections={commandDeskSections({ canManageRoles: true })}
      sidebarFooter={sidebarFooter}
      tacticalSession={{ userId: ownerId, userDisplayName, canManageRoles: true }}
    >
      <div className="relative mx-auto w-full min-w-0 max-w-[1600px] @container text-zinc-100">
        <header className="mb-4 border-b border-white/[0.06] pb-4 @md:mb-8 @md:pb-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Admin</p>
          <h1 className="mt-1 font-sans text-xl font-semibold tracking-tight text-white @md:text-2xl @lg:text-[1.65rem]">
            Admin Panel
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Owner-only control panel. Allowed owner email:{" "}
            <code className="break-all text-zinc-300">{ownerEmail}</code>
          </p>
        </header>

        <div className="space-y-6">
          <RoleApplierPanel ownerId={ownerId} />
          <CloseApprovalPanel ownerId={ownerId} />
          <RewardVaultPanel />
        </div>
      </div>
    </DeskShell>
  );
}
