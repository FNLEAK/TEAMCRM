import { DemoEnvMissing, DemoSignInPrompt } from "@/components/demo/DemoGateViews";
import { fetchSearchSourcesSnapshot } from "@/lib/demoSupabaseData";
import { requireSupabaseForDemo } from "@/lib/demoPageServer";

export default async function SearchSourcesDemoPage() {
  const gate = await requireSupabaseForDemo();
  if (gate.kind === "env") return <DemoEnvMissing />;
  if (gate.kind === "anon") return <DemoSignInPrompt />;

  const { data, error } = await fetchSearchSourcesSnapshot(gate.supabase);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">
        Demo · live Supabase
      </p>
      <h1 className="mt-2 text-xl font-semibold text-white">Search · owner · stages · sources</h1>
      <p className="mt-1 text-sm text-slate-500">
        Snapshot: import filenames as source, status counts, and top claimers when{" "}
        <code className="text-slate-400">claimed_by</code> is enabled.
      </p>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white">Recent imports</h2>
        {data.importError ? (
          <p className="mt-2 text-xs text-amber-200/80">Import: {data.importError}</p>
        ) : null}
        {data.importBatches.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No import batches.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {data.importBatches.map((b) => (
              <li key={b.import_batch_id} className="flex justify-between gap-4 text-slate-400">
                <span className="truncate text-slate-300">{b.import_filename ?? "—"}</span>
                <span className="shrink-0 tabular-nums">{b.lead_count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white">Status counts</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.statusCounts.map((s) => (
            <li
              key={s.status}
              className="flex justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-sm"
            >
              <span className="text-slate-400">{s.status}</span>
              <span className="tabular-nums text-slate-200">{s.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white">Top claimers</h2>
        {data.claimedByTop.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No <code className="text-slate-400">claimed_by</code> data — set{" "}
            <code className="text-slate-400">NEXT_PUBLIC_LEADS_HAS_CLAIMED_BY=true</code> if your schema supports it.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {data.claimedByTop.map((c) => (
              <li key={c.userId} className="flex justify-between gap-4 border-b border-white/[0.04] pb-2">
                <span>{c.label}</span>
                <span className="tabular-nums text-slate-500">{c.count} claims</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
