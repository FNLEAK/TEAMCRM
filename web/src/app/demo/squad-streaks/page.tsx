import { DemoEnvMissing, DemoSignInPrompt } from "@/components/demo/DemoGateViews";
import { fetchSquadStreaks } from "@/lib/demoSupabaseData";
import { requireSupabaseForDemo } from "@/lib/demoPageServer";

export default async function SquadStreaksDemoPage() {
  const gate = await requireSupabaseForDemo();
  if (gate.kind === "env") return <DemoEnvMissing />;
  if (gate.kind === "anon") return <DemoSignInPrompt />;

  const { rows, error } = await fetchSquadStreaks(gate.supabase);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">
        Demo · live Supabase
      </p>
      <h1 className="mt-2 text-xl font-semibold text-white">Squad streaks</h1>
      <p className="mt-1 text-sm text-slate-500">
        Weekly &quot;Appt Set&quot; appointments by <code className="text-slate-400">appt_scheduled_by</code> (same
        logic as Command leaderboard).
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No scheduled appointments in the current or previous ISO week.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.06] bg-[var(--color-surface)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs uppercase text-slate-500">
                <th className="px-4 py-3 font-medium">Teammate</th>
                <th className="px-4 py-3 font-medium">This week</th>
                <th className="px-4 py-3 font-medium">Prev week</th>
                <th className="px-4 py-3 font-medium">Momentum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-white/[0.04]">
                  <td className="px-4 py-3 font-medium text-slate-200">{r.displayName}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-300">{r.thisWeekAppts}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">{r.prevWeekAppts}</td>
                  <td className="px-4 py-3 text-sm text-violet-200/90">{r.streakLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
