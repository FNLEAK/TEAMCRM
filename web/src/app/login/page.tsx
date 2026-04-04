"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Lazy-load Three/WebGL only on desktop — keeps login JS small on phones. */
const Ballpit = dynamic(() => import("@/components/Ballpit"), { ssr: false, loading: () => null });
import { formatAuthError } from "@/lib/authErrors";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ensureTeamRoleFromSession, upsertTeamProfileFromSession } from "@/lib/syncTeamProfile";

type Mode = "signin" | "signup";
const BALLPIT_COLORS = [0x22d3ee, 0x10b981, 0x8b5cf6] as const;
/** Stable array reference — inline `[...BALLPIT_COLORS]` on `<Ballpit />` recreated every render and remounted WebGL. */
const LOGIN_BALLPIT_COLORS: number[] = [...BALLPIT_COLORS];

export default function LoginPage() {
  /** WebGL + full-viewport canvas breaks touch hit-testing on some mobile browsers; use static bg only. */
  const [allowBallpit, setAllowBallpit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setAllowBallpit(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [mode, setMode] = useState<Mode>("signin");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    let willHardRedirect = false;

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signup") {
        const fn = firstName.trim();
        if (!fn) {
          setError("Please enter your first name.");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          setLoading(false);
          return;
        }

        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              first_name: fn,
              full_name: fn,
            },
          },
        });

        if (signUpErr) {
          setError(formatAuthError(signUpErr));
          return;
        }

        if (data.session) {
          await upsertTeamProfileFromSession(supabase);
          await ensureTeamRoleFromSession(supabase);
          willHardRedirect = true;
          window.location.assign("/");
          return;
        }

        setInfo(
          "Check your email for a confirmation link. After you confirm, sign in — your profile syncs on first login.",
        );
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) {
        setError(formatAuthError(signInErr));
        return;
      }

      await upsertTeamProfileFromSession(supabase);
      await ensureTeamRoleFromSession(supabase);
      willHardRedirect = true;
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (!willHardRedirect) setLoading(false);
    }
  }

  const isSignUp = mode === "signup";

  return (
    <main className="relative min-h-svh w-full overflow-x-hidden overflow-y-auto bg-black px-4 py-12 antialiased">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-80 [background:radial-gradient(120%_100%_at_10%_0%,rgba(34,211,238,0.22),transparent_55%),radial-gradient(120%_100%_at_90%_0%,rgba(16,185,129,0.18),transparent_58%),radial-gradient(120%_100%_at_50%_100%,rgba(139,92,246,0.2),transparent_62%)] [animation:loginBgPulse_7s_ease-in-out_infinite]"
        aria-hidden
      />
      {allowBallpit ? (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <Ballpit
            className="pointer-events-none h-full w-full opacity-90"
            count={160}
            gravity={0.03}
            friction={0.9975}
            wallBounce={0.94}
            followCursor={false}
            colors={LOGIN_BALLPIT_COLORS}
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/38" aria-hidden />
      <div className="relative z-[100] mx-auto w-full max-w-[440px] pointer-events-auto touch-manipulation">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 shadow-[0_0_40px_-8px_rgba(34,211,238,0.35)] ring-1 ring-white/10">
            <span className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              LC
            </span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Web Friendly CRM</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
            {isSignUp
              ? "Invite your team — one workspace, Supabase Auth, real-time leads."
              : "Sign in to open the pipeline and collaborate live."}
          </p>
        </div>

        <div className="relative rounded-2xl p-[1px] shadow-[0_32px_100px_-24px_rgba(0,0,0,0.85)] [background:linear-gradient(135deg,rgba(255,255,255,0.1),rgba(16,185,129,0.12),rgba(34,211,238,0.1))]">
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/90 px-8 py-9 backdrop-blur-2xl">
            <form onSubmit={onSubmit} className="space-y-5">
              {isSignUp ? (
                <div>
                  <label htmlFor="firstName" className="text-xs font-medium text-zinc-400">
                    First name
                  </label>
                  <input
                    id="firstName"
                    className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Alex"
                    required={isSignUp}
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="email" className="text-xs font-medium text-zinc-400">
                  Email
                </label>
                <input
                  id="email"
                  className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="text-xs font-medium text-zinc-400">
                  Password
                </label>
                <input
                  id="password"
                  className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={isSignUp ? 6 : undefined}
                  required
                />
                {isSignUp ? (
                  <p className="mt-1.5 text-[11px] text-zinc-600">Minimum 6 characters.</p>
                ) : null}
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/35 bg-red-500/[0.12] px-4 py-3 text-sm leading-relaxed text-red-100/95"
                >
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-100/95">
                  {info}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
              >
                {loading
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Create account"
                    : "Continue"}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-zinc-500">
              {isSignUp ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-cyan-400 transition hover:text-emerald-300"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setInfo(null);
                    }}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-cyan-400 transition hover:text-emerald-300"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                      setInfo(null);
                    }}
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>

            <p className="mt-6 border-t border-white/[0.06] pt-6 text-center text-sm text-zinc-600">
              Legacy workspace?{" "}
              <Link href="/pipeline" className="font-medium text-cyan-400/90 hover:text-emerald-300">
                Open pipeline
              </Link>
            </p>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes loginBgPulse {
          0%,
          100% {
            filter: saturate(1) brightness(0.95);
          }
          50% {
            filter: saturate(1.15) brightness(1.05);
          }
        }
      `}</style>
    </main>
  );
}
