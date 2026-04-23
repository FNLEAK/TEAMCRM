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
    <DeskShell sections={commandDeskSections({ canManageRoles: true })} sidebarFooter={sidebarFooter}>
      <div className="relative w-full min-w-0 max-w-[1400px] bg-[#000000] @container text-zinc-100">
        <header className="border-b border-white/[0.06] px-1 pb-5 pt-1 @md:pb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600 @md:text-[11px]">Command</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50 @md:text-2xl">Admin Panel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 @md:text-[15px]">
            Owner-only. Verified email{" "}
            <code className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[13px] text-violet-200/90">
              {ownerEmail}
            </code>
          </p>
        </header>

        <div className="mt-6 flex flex-col gap-8 pb-[max(1rem,env(safe-area-inset-bottom))] @md:mt-8 @md:gap-10">
          <RoleApplierPanel ownerId={ownerId} />
          <CloseApprovalPanel ownerId={ownerId} />
          <RewardVaultPanel />
        </div>
      </div>
    </DeskShell>
  );
}
