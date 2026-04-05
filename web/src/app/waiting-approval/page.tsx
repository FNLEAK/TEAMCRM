"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Legacy URL; approval UX is the global modal on `/`. */
export default function WaitingApprovalPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#070709] px-4 text-sm text-zinc-500">
      Redirecting…
    </main>
  );
}
