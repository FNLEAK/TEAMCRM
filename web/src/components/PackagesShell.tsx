"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { PricingSection } from "@/components/ui/pricing";
import { MONTHLY_PACKAGES, ONE_TIME_PACKAGES } from "@/lib/packagesPlans";
import { cn } from "@/lib/utils";

export function PackagesShell({
  userDisplayName,
  canManageRoles,
}: {
  userDisplayName: string;
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const { isMobileShell: layoutMobileShell } = useDeskLayout();

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
    <DeskShell sections={commandDeskSections({ canManageRoles })} sidebarFooter={sidebarFooter}>
      <div className="relative mx-auto w-full min-w-0 max-w-[1600px] @container text-zinc-100">
        <header
          className={cn(
            "mb-4 rounded-2xl border border-emerald-300/15 bg-gradient-to-b from-emerald-500/[0.06] via-[#0b0c0f]/95 to-[#0b0c0f]/95 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_34px_-22px_rgba(52,211,153,0.65)]",
            layoutMobileShell ? "@md:mb-8 @md:px-6 @md:py-8" : "md:mb-8 md:px-6 md:py-8",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-200/75">Web Friendly CRM</p>
          <h1
            className={cn(
              "mt-2 font-sans text-2xl font-semibold tracking-tight text-emerald-300 drop-shadow-[0_0_24px_rgba(52,211,153,0.35)]",
              layoutMobileShell ? "@md:mt-3 @md:text-3xl @lg:text-[2.35rem]" : "md:mt-3 md:text-3xl lg:text-[2.35rem]",
            )}
          >
            Packages
          </h1>
          <p
            className={cn(
              "mx-auto mt-2 max-w-4xl text-sm leading-relaxed text-zinc-300/85",
              layoutMobileShell ? "@md:mt-3 @md:text-base" : "md:mt-3 md:text-base",
            )}
          >
            Reference pricing for owners and teammates — one-time builds and optional monthly care. Switch between
            project packages and recurring plans.
          </p>
        </header>

        <PricingSection
          oneTimePlans={ONE_TIME_PACKAGES}
          monthlyPlans={MONTHLY_PACKAGES}
          heading="Plans & pricing"
          description="Use this page to align with clients on scope and budget. Final quotes may vary by discovery."
          className="pb-12"
        />
      </div>
    </DeskShell>
  );
}
