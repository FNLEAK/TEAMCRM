import { DemoEnvMissing, DemoSignInPrompt } from "@/components/demo/DemoGateViews";
import { fetchOpsCoverage } from "@/lib/demoSupabaseData";
import { requireSupabaseForDemo } from "@/lib/demoPageServer";

export default async function OpsCoverageDemoPage() {
  const gate = await requireSupabaseForDemo();
  if (gate.kind === "env") return <DemoEnvMissing />;
  if (gate.kind === "anon") return <DemoSignInPrompt />;

  const { data, error } = await fetchOpsCoverage(gate.supabase);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">
        Demo · live Supabase
      </p>
      <h1 className="mt-2 text-xl font-semibold text-white">Open pipeline · appointments · coverage</h1>
      <p className="mt-1 text-sm text-slate-500">
        Head counts from <code className="text-slate-400">leads</code> and recent import batches (RPC or fallback).
      </p>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 backdrop-blur-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Total leads</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{data.totalLeads}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 backdrop-blur-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Appointments today (UTC)</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-emerald-400">{data.appointmentsToday}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 backdrop-blur-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Status &quot;Appt Set&quot;</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-cyan-300">{data.apptSetLeads}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 backdrop-blur-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Not interested</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-200">{data.notInterestedLeads}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white">Recent import batches</h2>
        {data.importRpcError ? (
          <p className="mt-2 text-xs text-amber-200/80">RPC note: {data.importRpcError} — using table fallback when possible.</p>
        ) : null}
        {data.importBatches.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No import batches found.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {data.importBatches.map((b) => (
              <li key={b.import_batch_id} className="flex justify-between gap-4 border-b border-white/[0.04] pb-2">
                <span className="truncate text-slate-300">{b.import_filename ?? b.import_batch_id.slice(0, 8)}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{b.lead_count} leads</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
