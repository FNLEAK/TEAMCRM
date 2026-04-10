"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { PipelineCommandCenter } from "@/components/PipelineCommandCenter";
import type { CommandCenterPayload } from "@/lib/commandCenterData";

export function PipelineCommandCenterShell({
  initial,
  userId,
  userDisplayName,
  canManageRoles,
}: {
  initial: CommandCenterPayload;
  userId: string;
  userDisplayName: string;
  canManageRoles: boolean;
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
      tacticalSession={{ userId, userDisplayName, canManageRoles }}
    >
      <PipelineCommandCenter initial={initial} userId={userId} />
    </DeskShell>
  );
}
