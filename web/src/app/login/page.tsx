"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatAuthError } from "@/lib/authErrors";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { upsertTeamProfileFromSession } from "@/lib/syncTeamProfile";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
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
          router.push("/");
          router.refresh();
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
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const isSignUp = mode === "signup";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#09090b] px-4 py-12 antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,rgba(139,92,246,0.18),transparent_55%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(217,70,239,0.08),transparent)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-fuchsia-600/10 shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)] ring-1 ring-white/10">
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

        <div className="relative rounded-2xl p-[1px] shadow-[0_32px_100px_-24px_rgba(0,0,0,0.85)] [background:linear-gradient(135deg,rgba(255,255,255,0.12),rgba(139,92,246,0.15),rgba(217,70,239,0.1))]">
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/90 px-8 py-9 backdrop-blur-2xl">
            <form onSubmit={onSubmit} className="space-y-5">
              {isSignUp ? (
                <div>
                  <label htmlFor="firstName" className="text-xs font-medium text-zinc-400">
                    First name
                  </label>
                  <input
                    id="firstName"
                    className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
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
                  className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
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
                  className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
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
                className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-fuchsia-600 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
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
                    className="font-semibold text-violet-400 transition hover:text-violet-300"
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
                    className="font-semibold text-violet-400 transition hover:text-violet-300"
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
              <Link href="/pipeline" className="font-medium text-violet-400/90 hover:text-violet-300">
                Open pipeline
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
