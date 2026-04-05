"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { DeskLayoutProvider } from "@/components/DeskLayoutContext";
import { OwnerApprovalGate } from "@/components/OwnerApprovalGate";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

/**
 * Session-aware shell. Keeps auth pages centered when signed out.
 */
export function AuthSessionShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setSession(null);
      return;
    }

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      setSession(null);
      return;
    }

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signedIn = !!session?.user;
  return (
    <div
      className={cn(
        "relative min-h-svh w-full min-w-0 max-w-full overflow-x-hidden",
        !signedIn && "flex flex-col items-center justify-center",
      )}
    >
      <DeskLayoutProvider>
        {signedIn ? (
          <OwnerApprovalGate>{children}</OwnerApprovalGate>
        ) : (
          <div className="pointer-events-auto min-h-[100svh] w-full min-w-0 max-w-full overflow-x-hidden">
            {children}
          </div>
        )}
      </DeskLayoutProvider>
    </div>
  );
}
