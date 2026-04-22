"use client";

import { useRouter } from "next/navigation";
import { DeskShell } from "@/components/DeskShell";
import { OwnerRoofingLeadsFooterLink } from "@/components/OwnerRoofingLeadsFooterLink";
import { commandDeskSections } from "@/lib/deskNavConfig";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

type HowToCard = {
  title: string;
  what: string;
  when: string;
  steps: string[];
};

const HOW_TO_CARDS: HowToCard[] = [
  {
    title: "Lead Management",
    what: "Main calling list. Open this when making calls and updating lead status.",
    when: "Use all day for calls, notes, and appointment setting.",
    steps: [
      "Find a lead in the list.",
      "Click the row to open lead details.",
      "Update status and notes after every call.",
      "Set appointment date/time when booked.",
    ],
  },
  {
    title: "Performance KPI Header",
    what: "Team-level performance snapshot and quick filtering board.",
    when: "Use at start/mid/end of day to check progress.",
    steps: [
      "Review top KPI cards.",
      "Use filters to narrow by owner, stage, or source.",
      "Use Kanban columns to visually inspect pipeline flow.",
    ],
  },
  {
    title: "Personal Stats",
    what: "Your own numbers only (your assigned leads and appointments).",
    when: "Use for self-review and daily accountability.",
    steps: [
      "Check your closing rate ring.",
      "Review activity breakdown bars.",
      "Track weekly goal progress and momentum chart.",
    ],
  },
  {
    title: "Packages",
    what: "Reference pricing menu for client conversations.",
    when: "Use during price discussion and quote framing.",
    steps: [
      "Open one-time vs monthly tabs.",
      "Read package inclusions out loud to client.",
      "Confirm final quote after discovery call.",
    ],
  },
];

const GUIDE_CARD_TONES = [
  "from-cyan-500/[0.13] via-cyan-500/[0.04] to-violet-500/[0.08]",
  "from-violet-500/[0.13] via-violet-500/[0.04] to-cyan-500/[0.08]",
  "from-emerald-500/[0.13] via-emerald-500/[0.04] to-cyan-500/[0.08]",
  "from-fuchsia-500/[0.13] via-fuchsia-500/[0.04] to-cyan-500/[0.08]",
];

export function HowToShell({
  userDisplayName,
  canManageRoles,
}: {
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
      sidebarBelowFooter={canManageRoles ? <OwnerRoofingLeadsFooterLink /> : null}
    >
      <div className="relative mx-auto w-full max-w-[1400px] text-zinc-100">
        <header className="mb-8 rounded-2xl border border-transparent bg-[radial-gradient(120%_100%_at_10%_0%,rgba(34,211,238,0.16),transparent_58%),radial-gradient(120%_100%_at_90%_0%,rgba(167,139,250,0.14),transparent_62%),linear-gradient(180deg,#0b0e14_0%,#090b11_100%)] px-6 py-8 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_44px_-24px_rgba(34,211,238,0.55)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75">Team Handbook</p>
          <h1 className="mt-3 font-sans text-3xl font-semibold tracking-tight text-cyan-300 sm:text-[2.35rem]">
            Team Guide
          </h1>
          <p className="mx-auto mt-3 max-w-4xl text-base leading-relaxed text-zinc-300/85">
            Simple walkthrough for non-technical teammates. Use this page to understand what each section does, when
            to use it, and what to click next.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          {HOW_TO_CARDS.map((card, idx) => (
            <article
              key={card.title}
              className="group relative overflow-hidden rounded-2xl border border-transparent bg-[linear-gradient(180deg,rgba(10,13,20,0.96)_0%,rgba(8,10,16,0.94)_100%)] p-5 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_24px_-20px_rgba(34,211,238,0.45)] transition duration-300 hover:-translate-y-1 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_24px_-20px_rgba(34,211,238,0.45)]"
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${GUIDE_CARD_TONES[idx % GUIDE_CARD_TONES.length]} opacity-95`}
              />
              <div className="relative">
              <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-sm text-zinc-300">
                <span className="font-semibold text-cyan-200">What:</span> {card.what}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                <span className="font-semibold text-violet-200">When:</span> {card.when}
              </p>
              <ol className="mt-3 space-y-1 text-sm text-zinc-300">
                {card.steps.map((s, i) => (
                  <li key={s}>
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-500/[0.08] text-[11px] font-semibold text-cyan-100">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-xl border border-transparent bg-[linear-gradient(120deg,rgba(16,185,129,0.14),rgba(6,78,59,0.08)_45%,rgba(4,120,87,0.08))] px-5 py-4 text-sm text-emerald-100/95 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2),0_16px_36px_-28px_rgba(16,185,129,0.6)]">
          <p className="font-semibold uppercase tracking-wide text-emerald-200">Tip</p>
          <p className="mt-1 leading-relaxed">
            You will also see small{" "}
            <span className="mx-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-500/80 bg-black/50 text-[11px] font-bold text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.45)]">
              ?
            </span>{" "}
            help markers around the app. Click those anytime for quick context on that specific section.
          </p>
        </section>
      </div>
    </DeskShell>
  );
}
