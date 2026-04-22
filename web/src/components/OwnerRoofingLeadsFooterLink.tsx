"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function OwnerRoofingLeadsFooterLink() {
  const pathname = usePathname();
  const active = pathname === "/roofing-leads";

  return (
    <Link
      href="/roofing-leads"
      prefetch
      className={clsx(
        "block w-full rounded-lg border px-3 py-2.5 text-center text-[13px] font-medium leading-snug tracking-tight transition duration-200",
        active
          ? "border-teal-400/50 bg-teal-500/15 text-teal-100"
          : "border-[#222] bg-transparent text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-100 active:scale-[0.99]",
      )}
    >
      Roofing Leads Management
    </Link>
  );
}
