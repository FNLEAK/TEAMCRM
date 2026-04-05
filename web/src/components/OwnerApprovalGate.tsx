"use client";

import { Clock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ownerApprovalGateEnabled } from "@/lib/crmRouteGuards";
import { isOwnerEmail } from "@/lib/ownerRoleGate";

type GateUi = "idle" | "checking" | "blocked";

function isOverlayExemptPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/auth/callback") ||
    pathname === "/waiting-approval"
  );
}

async function fetchApproved(userId: string, email: string | undefined): Promise<boolean> {
  if (!ownerApprovalGateEnabled()) return true;
  if (isOwnerEmail(email)) return true;
  const supabase = createSupabaseBrowserClient();
  const { data: row, error } = await supabase
    .from("team_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) return false;
  const r = row.role as string;
  return r === "team" || r === "owner";
}

/**
 * Full-viewport blocking layer until `team_roles` is team|owner (or bootstrap owner email).
 * Pair with middleware API 403 + default-on gate in `ownerApprovalGateEnabled`.
 */
export function OwnerApprovalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ui, setUi] = useState<GateUi>("checking");
  const [signOutBusy, setSignOutBusy] = useState(false);

  const gateOn = ownerApprovalGateEnabled();
  const exempt = isOverlayExemptPath(pathname);

  /**
   * `showChecking` only on first load / hard refresh — never on poll, Realtime, or window focus,
   * or the modal flips "Waiting" ↔ "One moment" and drops the Sign out button every few seconds.
   */
  const runCheck = useCallback(async (userId: string, email: string | undefined, showChecking: boolean) => {
    if (showChecking) setUi("checking");
    const ok = await fetchApproved(userId, email);
    setUi(ok ? "idle" : "blocked");
  }, []);

  useLayoutEffect(() => {
    if (!gateOn || exempt) {
      setUi("idle");
    }
  }, [gateOn, exempt]);

  useEffect(() => {
    if (!gateOn || exempt) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let poll: ReturnType<typeof setInterval> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUi("idle");
        return;
      }
      await runCheck(user.id, user.email, true);

      channel = supabase
        .channel(`owner_approval_${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "team_roles",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void runCheck(user.id, user.email, false);
          },
        )
        .subscribe();

      poll = setInterval(() => {
        void runCheck(user.id, user.email, false);
      }, 5000);
    })();

    const onFocus = () => {
      void supabase.auth.getUser().then(({ data: { user: u } }) => {
        if (u) void runCheck(u.id, u.email, false);
      });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      if (poll) clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gateOn, exempt, runCheck]);

  async function signOut() {
    setSignOutBusy(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const showBlocking = gateOn && !exempt && (ui === "checking" || ui === "blocked");

  useEffect(() => {
    if (!showBlocking) {
      document.body.style.removeProperty("overflow");
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showBlocking]);

  return (
    <>
      <div aria-hidden={showBlocking} className={showBlocking ? "pointer-events-none select-none" : undefined}>
        {children}
      </div>
      {showBlocking ? (
        <div
          className="fixed inset-0 z-[200000] flex items-center justify-center bg-[#070709]/98 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-approval-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/80 p-8 text-center shadow-[0_0_48px_-20px_rgba(34,211,238,0.35)] ring-1 ring-white/10">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-200" aria-hidden />
            </div>
            <h1 id="owner-approval-title" className="text-xl font-semibold tracking-tight text-white">
              {ui === "checking" ? "Checking your access…" : "Waiting for Owner Approval"}
            </h1>
            {ui === "blocked" ? (
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Your account is verified. You will gain access once the owner assigns you to the team in Role Applier.
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">One moment…</p>
            )}
            {ui === "blocked" ? (
              <button
                type="button"
                disabled={signOutBusy}
                onClick={() => void signOut()}
                className="mt-8 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                {signOutBusy ? "Signing out…" : "Sign out"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
