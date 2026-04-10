"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { PersonalStatsSection } from "@/components/PersonalStatsSection";

export function PersonalStatsShell({
  userId,
  userDisplayName,
  canManageRoles,
}: {
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
      <div className="@container relative mx-auto w-full max-w-[1600px] text-zinc-100">
        <header className="mb-8 rounded-2xl border border-emerald-300/15 bg-gradient-to-b from-emerald-500/[0.06] via-[#0b0c0f]/95 to-[#0b0c0f]/95 px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(52,211,153,0.65)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-200/75">Performance</p>
          <h1 className="mt-3 font-sans text-3xl font-semibold tracking-tight text-emerald-300 drop-shadow-[0_0_24px_rgba(52,211,153,0.35)] sm:text-[2.35rem]">
            Personal Stats
          </h1>
          <p className="mx-auto mt-3 max-w-4xl text-base leading-relaxed text-zinc-300/85">
            Your pipeline metrics only — same theme as Command, separate page so the lead list stays focused.
          </p>
        </header>

        <PersonalStatsSection userId={userId} />
      </div>
    </DeskShell>
  );
}
