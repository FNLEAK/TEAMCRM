"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { DeskShell } from "@/components/DeskShell";
import { pipelineDeskSections } from "@/lib/deskNavConfig";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, clear } = useAuthStore();

  const sidebarFooter = (
    <>
      {user ? (
        <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/[0.09] via-[#0b0c0f]/92 to-[#0b0c0f]/92 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_22px_-14px_rgba(34,211,238,0.7)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">Signed in</p>
          <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{user.email}</p>
          {user.workspaceName ? (
            <p className="truncate text-[11px] text-cyan-100/70">{user.workspaceName}</p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          clear();
          router.push("/login");
        }}
        className="w-full rounded-xl border border-cyan-300/25 bg-cyan-500/[0.09] py-2 text-[13px] font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-500/[0.16]"
      >
        Log out
      </button>
    </>
  );

  return (
    <DeskShell sections={pipelineDeskSections()} sidebarFooter={sidebarFooter}>
      {children}
    </DeskShell>
  );
}
