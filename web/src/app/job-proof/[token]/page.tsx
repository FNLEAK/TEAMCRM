import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Job proof",
    description: "View job photos shared with you.",
    robots: { index: false, follow: false },
  };
}

function looksLikeDirectImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url.trim());
}

export default async function JobProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw?.trim() ?? "";
  if (!UUID_RE.test(token)) notFound();

  const admin = getSupabaseAdmin();
  if (!admin) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-[#070708] px-6 text-center text-zinc-400">
        <p className="max-w-md text-sm">
          This page needs a server-side Supabase configuration. Add{" "}
          <code className="text-zinc-200">SUPABASE_SERVICE_ROLE_KEY</code> to the app environment so share links can load
          safely without a login.
        </p>
      </main>
    );
  }

  const { data, error } = await admin
    .from("leads")
    .select("company_name, selected_demo_url")
    .eq("demo_share_token", token)
    .maybeSingle();

  if (error) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-[#070708] px-6 text-center">
        <p className="text-sm text-rose-300/90">Could not load this share link.</p>
      </main>
    );
  }
  if (!data) notFound();

  const row = data as { company_name?: string | null; selected_demo_url?: string | null };
  const company = row.company_name?.trim() || "Your contractor";
  const url = row.selected_demo_url?.trim() ?? "";

  return (
    <main className="min-h-svh bg-gradient-to-b from-[#0a0a0c] via-[#070708] to-[#050506] text-zinc-100">
      <div className="mx-auto flex min-h-svh max-w-lg flex-col px-5 py-10">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-500/85">Job proof</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{company}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Photos from a recent project, shared with you during your call.
          </p>
        </header>

        {!url ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">
            No demo has been linked to this share page yet.
          </div>
        ) : looksLikeDirectImageUrl(url) ? (
          <div className="overflow-hidden rounded-2xl border border-emerald-950/40 bg-[#0c0c0e] shadow-[0_0_60px_-24px_rgba(16,185,129,0.35)] ring-1 ring-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element -- customer-facing arbitrary image URL */}
            <img src={url} alt={`Work preview for ${company}`} className="w-full object-contain" />
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-950/40 bg-[#0c0c0e] p-8 text-center shadow-[0_0_60px_-24px_rgba(16,185,129,0.25)] ring-1 ring-black/40">
            <p className="text-sm text-zinc-400">Open the link below to view the full job photos or folder.</p>
            <a
              href={url.startsWith("http") ? url : `https://${url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-xl border border-emerald-500/45 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
            >
              View job photos
            </a>
          </div>
        )}

        <footer className="mt-auto pt-12 text-center text-[11px] text-zinc-600">
          Shared securely · if you did not expect this page, you can close it.
        </footer>
      </div>
    </main>
  );
}
