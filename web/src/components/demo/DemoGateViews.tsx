import Link from "next/link";

export function DemoEnvMissing() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-red-500/30 bg-red-950/30 p-6 text-sm text-red-100/90">
      <p className="font-semibold text-white">Supabase env missing</p>
      <p className="mt-2 text-slate-400">
        Add <code className="text-cyan-300">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-cyan-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
        <code className="text-cyan-300">web/.env.local</code>.
      </p>
    </div>
  );
}

export function DemoSignInPrompt() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-500/25 bg-amber-950/20 p-6 text-sm">
      <p className="font-semibold text-white">Sign in to load live Supabase data</p>
      <p className="mt-2 text-slate-400">
        Demo views read your <code className="text-slate-300">leads</code>, <code className="text-slate-300">profiles</code>
        , and RPCs (same RLS as Command). Pipeline workspace users use JWT — open Command after Supabase sign-in for
        these demos.
      </p>
      <Link href="/login" className="mt-4 inline-block font-medium text-cyan-400 hover:text-cyan-300">
        Sign in →
      </Link>
    </div>
  );
}
