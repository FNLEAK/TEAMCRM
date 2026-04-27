"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  BarChart2,
  BookOpen,
  Crosshair,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Package,
  Shield,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useDeskLayout } from "@/components/DeskLayoutContext";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ensureSupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";

const LS_TEAM_CHAT_INCOMING_DM = "teamChatIncomingDm";
const LS_TEAM_CHAT_MENTION_UNREAD = "teamChatMentionUnread";

function bumpTeamChatMentionNavUnread() {
  try {
    const raw = window.localStorage.getItem(LS_TEAM_CHAT_MENTION_UNREAD);
    const prev = Number(raw ?? "0");
    window.localStorage.setItem(
      LS_TEAM_CHAT_MENTION_UNREAD,
      String((Number.isFinite(prev) ? prev : 0) + 1),
    );
    window.dispatchEvent(new Event("team-chat-mention-unread-updated"));
  } catch {
    /* private mode */
  }
}

export type DeskNavItem = {
  href: string;
  label: string;
  /** When true, only this path (no subpaths) counts as active */
  end?: boolean;
};

export type DeskNavSection = {
  title: string;
  demo?: boolean;
  pinToBottom?: boolean;
  items: DeskNavItem[];
};

function navLinkClass(active: boolean, isLight: boolean) {
  return clsx(
    "relative rounded-lg border px-3 py-2.5 text-[13px] font-medium leading-snug tracking-tight transition duration-200",
    isLight
      ? active
        ? "border-slate-300 bg-slate-100 text-slate-900"
        : "border-slate-300 bg-transparent text-slate-600 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.99]"
      : active
        ? "border-zinc-600/80 bg-zinc-800/80 text-white"
        : "border-[#222] bg-transparent text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-100 active:scale-[0.99]",
  );
}

function navLinkClassDemo(active: boolean) {
  return clsx(
    "relative rounded-xl border px-4 py-3 text-[13px] font-semibold leading-snug tracking-tight transition duration-200 sm:text-[14px]",
    active
      ? "border-violet-300/60 bg-violet-500/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_24px_-10px_rgba(139,92,246,0.35)]"
      : "border-violet-300/20 bg-violet-500/5 text-violet-200/85 hover:border-violet-300/40 hover:bg-violet-500/15 hover:text-white",
  );
}

function navLinkClassDrawer(active: boolean, isLight: boolean) {
  return clsx(
    "relative flex min-h-[48px] touch-manipulation items-center rounded-lg border px-4 py-3 text-[15px] font-medium leading-snug tracking-tight transition duration-200 active:scale-[0.99]",
    isLight
      ? active
        ? "border-slate-300 bg-slate-100 text-slate-900"
        : "border-slate-300 bg-transparent text-slate-700 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
      : active
        ? "border-zinc-600/80 bg-zinc-800/80 text-white"
        : "border-[#222] bg-transparent text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/60 hover:text-white",
  );
}

function navLinkClassDrawerDemo(active: boolean) {
  return clsx(
    "relative flex min-h-[48px] touch-manipulation items-center rounded-xl border px-4 py-3 text-[14px] font-semibold leading-snug tracking-tight transition duration-200",
    active
      ? "border-violet-300/60 bg-violet-500/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_24px_-10px_rgba(139,92,246,0.35)]"
      : "border-violet-300/20 bg-violet-500/5 text-violet-200/85 hover:border-violet-300/40 hover:bg-violet-500/15 hover:text-white",
  );
}

function flattenDeskNav(sections: DeskNavSection[]): DeskNavItem[] {
  const top = sections.filter((s) => !s.pinToBottom).flatMap((s) => s.items);
  const bottom = sections.filter((s) => s.pinToBottom).flatMap((s) => s.items);
  return [...top, ...bottom];
}

const MOBILE_TAB_LABEL: Record<string, string> = {
  "/pipeline-command-center": "KPI",
  "/": "Leads",
  "/personal-stats": "Stats",
  "/role-applier": "Admin",
  "/packages": "Plans",
  "/team-chat": "Chat",
  "/how-to": "Guide",
};

function NavTiltLink({
  href,
  className,
  children,
  onNavigate,
}: {
  href: string;
  className: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      className={className}
      onMouseEnter={() => {
        // Warm Next.js route chunks/data before click.
        router.prefetch(href);
      }}
      onClick={() => onNavigate?.()}
    >
      {children}
    </Link>
  );
}

export function DeskShell({
  children,
  navItems,
  sections,
  sidebarFooter,
  asideTop,
}: {
  children: ReactNode;
  /** @deprecated Prefer `sections` for grouped nav */
  navItems?: DeskNavItem[];
  sections?: DeskNavSection[];
  sidebarFooter?: ReactNode;
  asideTop?: ReactNode;
}) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [logoSpinY, setLogoSpinY] = useState(0);
  const [teamChatUnread, setTeamChatUnread] = useState(0);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const root = document.documentElement;
    const saved = window.localStorage.getItem("crm-theme-mode");
    if (saved === "light" || saved === "dark") {
      setThemeMode(saved);
      root.setAttribute("data-theme", saved);
      return;
    }
    root.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    try {
      window.localStorage.setItem("crm-theme-mode", themeMode);
    } catch {
      /* private mode */
    }
  }, [themeMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLogoSpinY((n) => n + 1);
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_TEAM_CHAT_INCOMING_DM, "0");
      window.dispatchEvent(new Event("team-chat-incoming-dm-updated"));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    const readUnread = () => {
      const mentionRaw = window.localStorage.getItem(LS_TEAM_CHAT_MENTION_UNREAD);
      const mention = Number(mentionRaw ?? "0");
      const total = Number.isFinite(mention) && mention > 0 ? Math.floor(mention) : 0;
      setTeamChatUnread(total);
    };
    readUnread();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_TEAM_CHAT_MENTION_UNREAD) readUnread();
    };
    const onCustom = () => readUnread();
    window.addEventListener("storage", onStorage);
    window.addEventListener("team-chat-mention-unread-updated", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("team-chat-mention-unread-updated", onCustom as EventListener);
    };
  }, []);

  /** Off Team Chat: sidebar badge for @everyone in Announcements only (TeamChatShell handles while on /team-chat). */
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const sub: { ch: ReturnType<typeof supabase.channel> | null } = { ch: null };

    void (async () => {
      await ensureSupabaseRealtimeAuth(supabase);
      if (cancelled) return;
      sub.ch = supabase
        .channel("desk-shell-announcement-pings")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "team_room_messages",
            filter: "channel=eq.announcements",
          },
          async (payload) => {
            const row = payload.new as { body?: string; author_id?: string; channel?: string };
            if (row.channel !== "announcements" || !row.body || !/@everyone\b/i.test(row.body)) return;
            const {
              data: { user },
            } = await supabase.auth.getUser();
            const me = user?.id;
            if (!me || row.author_id === me) return;
            const p = pathnameRef.current ?? "";
            if (p === "/team-chat" || p.startsWith("/team-chat/")) return;
            bumpTeamChatMentionNavUnread();
          },
        )
        .subscribe();
    })();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      if (sub.ch) void supabase.removeChannel(sub.ch);
    };
  }, []);

  const resolvedSections: DeskNavSection[] =
    sections ??
    (navItems?.length
      ? [{ title: "Navigate", items: navItems }]
      : []);

  const { isMobileShell } = useDeskLayout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const flatNav = useMemo(() => flattenDeskNav(resolvedSections), [resolvedSections]);
  const bottomTabs = useMemo(() => flatNav.slice(0, 4), [flatNav]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);
  const isLight = themeMode === "light";
  const shellCanvas = isLight ? "bg-slate-50 text-slate-800" : "bg-[#050505] text-zinc-200";
  const chromePanel = isLight ? "border-slate-300 bg-white" : "border-[#222] bg-[#111]";
  const mainCanvas = isLight ? "bg-slate-100" : "bg-[#050505]";

  const toggleThemeButton = (
    <button
      type="button"
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold tracking-tight transition",
        isLight
          ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          : "border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10",
      )}
      onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
      aria-label={isLight ? "Switch to night mode" : "Switch to day mode"}
      title={isLight ? "Switch to night mode" : "Switch to day mode"}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span>{isLight ? "Night mode" : "Day mode"}</span>
    </button>
  );

  function tabIconForHref(href: string) {
    if (href === "/pipeline-command-center" || href.includes("pipeline-command-center")) return LayoutDashboard;
    if (href === "/") return Users;
    if (href === "/personal-stats") return BarChart2;
    if (href === "/role-applier") return Shield;
    if (href === "/packages") return Package;
    if (href === "/team-chat") return MessageCircle;
    if (href === "/how-to") return BookOpen;
    return LayoutDashboard;
  }

  const renderNav = (opts: { drawer: boolean; onNavigate?: () => void }) => (
    <nav className={clsx("flex flex-col gap-5", opts.drawer ? "p-4 pb-6" : "p-3 sm:p-4")}>
      {resolvedSections.map((section, idx) => (
        <div key={`${section.title}-${idx}`} className={section.pinToBottom ? "mt-auto" : undefined}>
          {section.title ? (
            <div
              className={clsx(
                "mb-5 flex items-center justify-center gap-2 px-2 text-center",
                section.demo ? "text-violet-300/90" : "text-cyan-200/85",
              )}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-300/55 bg-cyan-300/10 shadow-[0_0_12px_-4px_rgba(34,211,238,0.75)]">
                <Crosshair className="h-2.5 w-2.5" />
              </span>
              <p
                className={clsx(
                  "text-[11px] font-bold uppercase tracking-[0.24em] sm:text-xs",
                  section.demo ? "text-violet-300/90" : "text-cyan-100/90",
                )}
              >
                {section.title}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {section.items.map(({ href, label, end }) => {
              const active = end
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
              const demo = section.demo;
              const showTeamChatUnread = href === "/team-chat" && teamChatUnread > 0;
              const cls = opts.drawer
                ? demo
                  ? navLinkClassDrawerDemo(active)
                  : navLinkClassDrawer(active, isLight)
                : demo
                  ? navLinkClassDemo(active)
                  : navLinkClass(active, isLight);
              return (
                <NavTiltLink
                  key={`${section.title}-${href}-${label}`}
                  href={href}
                  className={cls}
                  onNavigate={opts.onNavigate}
                >
                  <span>{label}</span>
                  {showTeamChatUnread ? (
                    <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-emerald-950 shadow-[0_0_16px_-4px_rgba(52,211,153,0.95)]">
                      {teamChatUnread > 99 ? "99+" : teamChatUnread}
                    </span>
                  ) : null}
                </NavTiltLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const globalStyles = (
    <style jsx global>{`
      @keyframes logoPulse {
        0%,
        100% {
          transform: scale(1);
          filter:
            drop-shadow(0 0 2px rgba(128, 255, 176, 0.18))
            drop-shadow(0 0 6px rgba(110, 255, 170, 0.12))
            drop-shadow(6px 0 8px rgba(74, 236, 255, 0.12))
            drop-shadow(-5px 0 6px rgba(132, 255, 161, 0.14));
        }
        50% {
          transform: scale(1.02);
          filter:
            drop-shadow(0 0 3px rgba(140, 255, 172, 0.28))
            drop-shadow(0 0 10px rgba(118, 255, 182, 0.22))
            drop-shadow(8px 0 12px rgba(86, 238, 255, 0.2))
            drop-shadow(-7px 0 8px rgba(144, 255, 170, 0.24));
        }
      }
    `}</style>
  );

  if (isMobileShell) {
    const mobileChrome = (
      <div className={clsx("flex min-h-svh min-w-0 max-w-full flex-col overflow-x-hidden", shellCanvas)}>
        <header
          className={clsx(
            "sticky top-0 z-40 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl",
            isLight ? "border-slate-300 bg-white/95" : "border-[#222] bg-[#050505]/95",
          )}
        >
          <button
            type="button"
            aria-expanded={drawerOpen}
            aria-label="Open navigation menu"
            className="relative z-20 flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg text-zinc-200 transition hover:bg-white/[0.08] hover:text-white active:bg-white/[0.1]"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-[22px] w-[22px]" strokeWidth={2} />
          </button>
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10 flex items-center justify-center px-[2.75rem]">
            <Image
              src="/brand-logo.png?v=8"
              alt="Web Friendly"
              width={200}
              height={48}
              priority
              unoptimized
              className="h-8 w-auto max-w-[min(11rem,calc(100vw-8rem))] object-contain object-center [animation:logoPulse_3.8s_ease-in-out_infinite]"
            />
          </div>
          <div className="relative z-20 shrink-0">{toggleThemeButton}</div>
        </header>

        <main className="@container min-h-0 min-w-0 flex-1 overflow-x-hidden px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-4">
          {children}
        </main>

        <nav
          className={clsx(
            "fixed bottom-0 left-0 right-0 z-[90] border-t pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl",
            isLight ? "border-slate-300 bg-white/98" : "border-[#222] bg-[#111]/98",
          )}
          aria-label="Primary navigation"
        >
          <div className="mx-auto grid h-[3.75rem] max-w-lg grid-cols-5">
            {[0, 1, 2, 3].map((slot) => {
              const item = bottomTabs[slot];
              if (!item) {
                return <span key={`nav-slot-${slot}`} className="min-w-0" aria-hidden />;
              }
              const Icon = tabIconForHref(item.href);
              const active = item.end
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const short =
                MOBILE_TAB_LABEL[item.href] ??
                (item.label.length > 7 ? `${item.label.slice(0, 6)}…` : item.label);
              const showTeamChatUnread = item.href === "/team-chat" && teamChatUnread > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={clsx(
                    "relative flex touch-manipulation flex-col items-center justify-center gap-0.5 px-1 pt-1 text-[10px] font-bold leading-tight tracking-tight transition active:opacity-90",
                    active ? "text-cyan-200" : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  <span className="relative inline-flex">
                    <Icon className={clsx("h-[22px] w-[22px]", active && "drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]")} strokeWidth={active ? 2.35 : 2} />
                    {showTeamChatUnread ? (
                      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-500 px-1 text-[9px] font-extrabold leading-none text-emerald-950">
                        {teamChatUnread > 9 ? "9+" : teamChatUnread}
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-full truncate">{short}</span>
                </Link>
              );
            })}
            <button
              type="button"
              className="flex touch-manipulation flex-col items-center justify-center gap-0.5 px-1 pt-1 text-[10px] font-bold leading-tight text-slate-500 transition hover:text-slate-300 active:opacity-90"
              aria-label="More pages and settings"
              onClick={() => setDrawerOpen(true)}
            >
              <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={2} />
              <span>More</span>
            </button>
          </div>
        </nav>

        <div
          className={clsx("fixed inset-0 z-[110]", drawerOpen ? "pointer-events-auto" : "pointer-events-none")}
          aria-hidden={!drawerOpen}
        >
          <button
            type="button"
            aria-label="Close menu"
            className={clsx(
              "absolute inset-0 bg-black/70 transition-opacity duration-300",
              drawerOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={closeDrawer}
          />
          <div
            className={clsx(
              "absolute left-0 top-0 flex h-full w-[min(21rem,90vw)] max-w-full flex-col border-r transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isLight ? "border-slate-300 bg-white" : "border-[#222] bg-[#111]",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:py-3">
              <p className={clsx("min-w-0 text-sm font-semibold tracking-tight", isLight ? "text-slate-900" : "text-white")}>
                All pages
              </p>
              <button
                type="button"
                aria-label="Close menu"
                className={clsx(
                  "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg transition",
                  isLight
                    ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200"
                    : "text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 active:bg-white/[0.12]",
                )}
                onClick={closeDrawer}
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              {renderNav({ drawer: true, onNavigate: closeDrawer })}
            </div>
            <div className={clsx("shrink-0 border-t p-4", isLight ? "border-slate-200" : "border-white/[0.07]")}>
              {toggleThemeButton}
            </div>
            {sidebarFooter ? (
              <div
                className={clsx(
                  "shrink-0 space-y-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
                  isLight ? "border-slate-200 bg-slate-50/80" : "border-white/[0.07] bg-black/25",
                )}
              >
                {sidebarFooter}
              </div>
            ) : null}
          </div>
        </div>

        {globalStyles}
      </div>
    );

    return mobileChrome;
  }

  return (
    <div className={clsx("flex min-h-svh min-w-0 max-w-full overflow-x-hidden", shellCanvas)}>
      <aside className={clsx("relative flex w-[17.5rem] shrink-0 flex-col border-r sm:w-72", chromePanel)}>
        {asideTop ?? (
          <div className="relative border-b border-[#222] px-3 py-4 sm:px-4 sm:py-5">
            <div className="flex min-h-[220px] items-center justify-center sm:min-h-[248px]">
              <div
                onMouseEnter={() => setLogoSpinY((n) => n + 1)}
                className="transform-gpu transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `perspective(900px) rotateY(${logoSpinY * 360}deg)` }}
              >
                <Image
                  src="/brand-logo.png?v=8"
                  alt="Web Friendly logo"
                  width={320}
                  height={320}
                  priority
                  unoptimized
                  className="h-auto w-full max-w-[188px] object-contain [animation:logoPulse_3.8s_ease-in-out_infinite]"
                />
              </div>
            </div>
          </div>
        )}

        {renderNav({ drawer: false })}

        <div className={clsx("mb-4 space-y-2 border-t p-3", isLight ? "border-slate-200" : "border-[#222]")}>
          {toggleThemeButton}
          {sidebarFooter}
        </div>
      </aside>
      {/* No @container here: pages use viewport breakpoints on desktop. Mobile shell uses @container on its own <main>. */}
      <main className={clsx("min-h-0 min-w-0 flex-1 overflow-x-hidden px-4 py-5 md:px-7 md:py-8 lg:px-10 lg:py-10", mainCanvas)}>
        {children}
      </main>
      {globalStyles}
    </div>
  );
}
