"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { teamProfileFromDb } from "@/lib/leadTypes";
import { displayProfessionalName } from "@/lib/profileDisplay";

type ApprovalStatus = "pending" | "approved" | "rejected";

type CloseRequestRow = {
  id: string;
  lead_id: string;
  requested_by: string;
  amount: number | null;
  notes: string | null;
  approval_status: ApprovalStatus;
  created_at: string;
};

type LeadBrief = {
  id: string;
  company_name: string | null;
  status: string | null;
};

type ProfileBrief = {
  id: string;
  first_name: string | null;
  full_name: string | null;
  avatar_initials: string | null;
  email?: string | null;
};

function formatMoney(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CloseApprovalPanel({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<CloseRequestRow[]>([]);
  const [leadsById, setLeadsById] = useState<Record<string, LeadBrief>>({});
  const [profilesById, setProfilesById] = useState<Record<string, ProfileBrief>>({});
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error: loadErr } = await (supabase as any)
      .from("closed_deals")
      .select("id, lead_id, requested_by, amount, notes, approval_status, created_at")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });
    if (loadErr) {
      setRows([]);
      setLoading(false);
      setError(loadErr.message);
      return;
    }
    const requestRows = (data ?? []) as CloseRequestRow[];
    setRows(requestRows);

    const leadIds = [...new Set(requestRows.map((r) => r.lead_id).filter(Boolean))];
    const userIds = [...new Set(requestRows.map((r) => r.requested_by).filter(Boolean))];

    if (leadIds.length > 0) {
      const { data: leadsData } = await (supabase as any)
        .from("leads")
        .select("id, company_name, status")
        .in("id", leadIds);
      const nextLeads: Record<string, LeadBrief> = {};
      for (const l of (leadsData ?? []) as LeadBrief[]) {
        nextLeads[l.id] = l;
      }
      setLeadsById(nextLeads);
    } else {
      setLeadsById({});
    }

    if (userIds.length > 0) {
      const profilesFull = await (supabase as any)
        .from("profiles")
        .select("id, first_name, full_name, avatar_initials, email")
        .in("id", userIds);
      const profileRows =
        profilesFull.error && String(profilesFull.error.message).toLowerCase().includes("email")
          ? await (supabase as any)
              .from("profiles")
              .select("id, first_name, full_name, avatar_initials")
              .in("id", userIds)
          : profilesFull;
      const nextProfiles: Record<string, ProfileBrief> = {};
      for (const p of (profileRows.data ?? []) as ProfileBrief[]) {
        nextProfiles[p.id] = p;
      }
      setProfilesById(nextProfiles);
    } else {
      setProfilesById({});
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDecision = useCallback(
    async (row: CloseRequestRow, decision: "approve" | "deny") => {
      setActingId(row.id);
      setError(null);
      setInfo(null);
      const supabase = createSupabaseBrowserClient();
      const approvalStatus: ApprovalStatus = decision === "approve" ? "approved" : "rejected";
      const leadStatus = decision === "approve" ? "Closed Won" : "Appt Set";

      const { error: reqErr } = await (supabase as any)
        .from("closed_deals")
        .update({
          approval_status: approvalStatus,
          approved_by: ownerId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (reqErr) {
        setActingId(null);
        setError(reqErr.message);
        return;
      }

      const { error: leadErr } = await supabase
        .from("leads")
        .update({ status: leadStatus })
        .eq("id", row.lead_id);
      if (leadErr) {
        setActingId(null);
        setError(`Request updated, but lead status failed: ${leadErr.message}`);
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setInfo(
        decision === "approve"
          ? "Close request approved and lead marked Closed Won."
          : "Close request denied and lead moved back to Appt Set.",
      );
      setActingId(null);
      router.refresh();
    },
    [ownerId, router],
  );

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const p = profilesById[r.requested_by];
        const tp = teamProfileFromDb({
          id: r.requested_by,
          first_name: p?.first_name ?? null,
          full_name: p?.full_name ?? null,
          avatar_initials: p?.avatar_initials ?? null,
          email: p?.email ?? null,
        });
        return {
          ...r,
          company: leadsById[r.lead_id]?.company_name ?? `Lead ${r.lead_id.slice(0, 8)}`,
          requester: displayProfessionalName(r.requested_by, tp),
        };
      }),
    [rows, profilesById, leadsById],
  );

  return (
    <section className="@container mt-6 min-w-0 rounded-xl border border-amber-400/35 bg-[#0a0a0a] p-4 ring-1 ring-amber-500/20 @md:p-5">
      <div className="mb-4 flex flex-col gap-3 @md:flex-row @md:items-start @md:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-100">Close Approval Queue</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Owner review queue for all Pending Close requests submitted by team members.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 self-start rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/10"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : null}
      {info ? (
        <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {info}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading close requests...</p>
      ) : enriched.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-400">
          No pending close requests right now.
        </p>
      ) : (
        <>
          <div className="space-y-3 @min-[920px]:hidden">
            {enriched.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-amber-400/25 bg-black/35 p-3 ring-1 ring-amber-500/10"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lead</p>
                <p className="mt-0.5 font-medium text-zinc-200">{r.company}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-zinc-500" title={r.lead_id}>
                  {r.lead_id}
                </p>
                <div className="mt-3 grid gap-2 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Requester</p>
                    <p className="text-zinc-300">{r.requester}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Amount</p>
                    <p className="font-semibold text-amber-100">{formatMoney(r.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Notes</p>
                    <p className="break-words text-[12px] leading-relaxed text-zinc-300">{r.notes ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Submitted</p>
                    <p className="text-[12px] text-zinc-400">
                      {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actingId === r.id}
                    onClick={() => void onDecision(r, "approve")}
                    className="min-h-10 flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60 @min-[400px]:flex-none"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={actingId === r.id}
                    onClick={() => void onDecision(r, "deny")}
                    className="min-h-10 flex-1 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-60 @min-[400px]:flex-none"
                  >
                    Deny
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto @min-[920px]:block">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 font-medium">Lead</th>
                  <th className="pb-2 font-medium">Requester</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Notes</th>
                  <th className="pb-2 font-medium">Submitted</th>
                  <th className="pb-2 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] align-top">
                    <td className="py-2.5">
                      <p className="font-medium text-zinc-200">{r.company}</p>
                      <p className="break-all font-mono text-[11px] text-zinc-500" title={r.lead_id}>
                        {r.lead_id}
                      </p>
                    </td>
                    <td className="py-2.5 text-zinc-300">{r.requester}</td>
                    <td className="py-2.5 font-semibold text-amber-100">{formatMoney(r.amount)}</td>
                    <td className="max-w-[280px] break-words py-2.5 text-[12px] leading-relaxed text-zinc-300 @min-[1100px]:max-w-[320px]">
                      {r.notes ?? "—"}
                    </td>
                    <td className="py-2.5 text-[12px] text-zinc-400">
                      {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={actingId === r.id}
                          onClick={() => void onDecision(r, "approve")}
                          className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actingId === r.id}
                          onClick={() => void onDecision(r, "deny")}
                          className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

