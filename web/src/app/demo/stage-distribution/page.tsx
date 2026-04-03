import { DemoEnvMissing, DemoSignInPrompt } from "@/components/demo/DemoGateViews";
import { fetchStatusDistribution } from "@/lib/demoSupabaseData";
import { requireSupabaseForDemo } from "@/lib/demoPageServer";

export default async function StageDistributionDemoPage() {
  const gate = await requireSupabaseForDemo();
  if (gate.kind === "env") return <DemoEnvMissing />;
  if (gate.kind === "anon") return <DemoSignInPrompt />;

  const { rows, otherCount, error } = await fetchStatusDistribution(gate.supabase);
  const max = Math.max(1, ...rows.map((r) => r.count), otherCount);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">
        Demo · live Supabase
      </p>
      <h1 className="mt-2 text-xl font-semibold text-white">Stage distribution</h1>
      <p className="mt-1 text-sm text-slate-500">
        Counts per <code className="text-slate-400">leads.status</code> (same values as Command).
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <div key={r.status} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-sm text-slate-300">{r.status}</div>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500/80 to-cyan-500/80"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-200">{r.count}</div>
            </div>
          ))}
          {otherCount > 0 ? (
            <div className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-sm text-slate-400">Other / non-canonical</div>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-slate-500/60"
                  style={{ width: `${(otherCount / max) * 100}%` }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-200">{otherCount}</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
