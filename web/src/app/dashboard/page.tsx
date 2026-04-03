"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { STAGE_LABELS, type Stage } from "@/lib/stages";

type Stats = {
  totalLeads: number;
  leadsPerStage: {
    stage: Stage;
    label: string;
    count: number;
    dealSum: string;
    weightPercent: number;
  }[];
  estimatedRevenue: string;
  conversionRates: {
    wonVsClosed: number | null;
    qualifiedPipelineShare: number | null;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const s = await api<Stats>("/dashboard/stats", token);
        setStats(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [token]);

  if (!token) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Pipeline health and weighted revenue</p>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {!stats && !error && (
          <p className="mt-8 text-sm text-slate-500">Loading metrics…</p>
        )}

        {stats && (
          <div className="mt-8 space-y-8">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total leads</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
                  {stats.totalLeads}
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Est. revenue (weighted)
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-emerald-400">
                  {new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(parseFloat(stats.estimatedRevenue))}
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Win rate (closed)
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
                  {stats.conversionRates.wonVsClosed !== null
                    ? `${stats.conversionRates.wonVsClosed}%`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Qualified+ share:{" "}
                  {stats.conversionRates.qualifiedPipelineShare !== null
                    ? `${stats.conversionRates.qualifiedPipelineShare}%`
                    : "—"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-6 shadow-card backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-white">Leads per stage</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs uppercase text-slate-500">
                      <th className="pb-2 font-medium">Stage</th>
                      <th className="pb-2 font-medium">Count</th>
                      <th className="pb-2 font-medium">Deal sum</th>
                      <th className="pb-2 font-medium">Stage %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.leadsPerStage.map((row) => (
                      <tr key={row.stage} className="border-b border-white/[0.04]">
                        <td className="py-2.5 font-medium text-slate-200">{STAGE_LABELS[row.stage]}</td>
                        <td className="py-2.5 tabular-nums text-slate-400">{row.count}</td>
                        <td className="py-2.5 tabular-nums text-slate-400">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 0,
                          }).format(parseFloat(row.dealSum))}
                        </td>
                        <td className="py-2.5 text-slate-500">{row.weightPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
