"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { commandDeskSections, pipelineDeskSections } from "@/lib/deskNavConfig";
import { useAuthStore } from "@/store/auth";

/**
 * Shared shell for `/demo/*` and `/squad` so nav matches Command vs Pipeline auth.
 * JWT session → pipeline-style nav; no token → full Command nav (Supabase home).
 */
export function DemoDeskLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const sections = token ? pipelineDeskSections() : commandDeskSections();

  const footer = (
    <>
      {token ? (
        <button
          type="button"
          onClick={() => {
            clear();
            router.push("/login");
          }}
          className="w-full rounded-xl border border-white/10 py-2 text-[13px] text-slate-300 hover:bg-white/5"
        >
          Log out
        </button>
      ) : (
        <p className="px-1 text-[10px] leading-relaxed text-slate-600">
          Workspace login: use Pipeline login. Command home uses Supabase — sign out from Command.
        </p>
      )}
    </>
  );

  return (
    <DeskShell sections={sections} sidebarFooter={footer}>
      {children}
    </DeskShell>
  );
}
