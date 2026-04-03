import { DemoEnvMissing, DemoSignInPrompt } from "@/components/demo/DemoGateViews";
import { fetchArenaSnapshot } from "@/lib/demoSupabaseData";
import { requireSupabaseForDemo } from "@/lib/demoPageServer";

export default async function SquadArenaPage() {
  const gate = await requireSupabaseForDemo();
  if (gate.kind === "env") return <DemoEnvMissing />;
  if (gate.kind === "anon") return <DemoSignInPrompt />;

  const { squadRows, profileCount, error } = await fetchArenaSnapshot(gate.supabase);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">
        Demo · live Supabase
      </p>
      <h1 className="mt-2 text-xl font-semibold text-white">Squad arena</h1>
      <p className="mt-1 text-sm text-slate-500">
        Profiles in workspace: <span className="text-slate-300">{profileCount}</span> · Weekly appt momentum from{" "}
        <code className="text-slate-400">leads</code> (same queries as Command).
      </p>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white">This week vs last week</h2>
        {squadRows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No appt data in range.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06] bg-[var(--color-surface)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-medium">Teammate</th>
                  <th className="px-4 py-3 font-medium">This week</th>
                  <th className="px-4 py-3 font-medium">Last week</th>
                </tr>
              </thead>
              <tbody>
                {squadRows.map((r) => (
                  <tr key={r.userId} className="border-b border-white/[0.04]">
                    <td className="px-4 py-3 font-medium text-slate-200">{r.displayName}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-300/90">{r.thisWeekAppts}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-400">{r.prevWeekAppts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
