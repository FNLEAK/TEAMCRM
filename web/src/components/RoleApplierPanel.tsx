"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { UiSelect } from "@/components/UiSelect";
import { teamProfileFromDb } from "@/lib/leadTypes";

type RoleValue = "owner" | "team";

type ProfileRow = {
  id: string;
  first_name: string | null;
  full_name: string | null;
  email?: string | null;
  avatar_initials: string | null;
};

type RoleRow = {
  user_id: string;
  role: RoleValue;
  account_name?: string | null;
  account_email?: string | null;
};

const ROLE_SELECT_OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "owner" as const, label: "Owner" },
];

/** Shown until a real `team_roles` row exists (no fake default to Team). */
const NEW_JOINER_SELECT_OPTIONS = [
  { value: "pending", label: "New — assign role", disabled: true },
  { value: "team", label: "Team" },
  { value: "owner", label: "Owner" },
];

export function RoleApplierPanel({ ownerId }: { ownerId: string }) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<Record<string, RoleValue>>({});
  /** user_id → true only if a row exists in `team_roles` (not inferred). */
  const [dbRolePresent, setDbRolePresent] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowserClient();

    const profilesFull = await (supabase as any)
      .from("profiles")
      .select("id, first_name, full_name, email, avatar_initials")
      .order("full_name", { ascending: true, nullsFirst: false });
    const profilesRes =
      profilesFull.error && String(profilesFull.error.message).toLowerCase().includes("email")
        ? await (supabase as any)
            .from("profiles")
            .select("id, first_name, full_name, avatar_initials")
            .order("full_name", { ascending: true, nullsFirst: false })
        : profilesFull;
    const rolesFull = await (supabase as any)
      .from("team_roles")
      .select("user_id, role, account_name, account_email");
    const rolesRes =
      rolesFull.error &&
      (String(rolesFull.error.message).toLowerCase().includes("account_name") ||
        String(rolesFull.error.message).toLowerCase().includes("account_email"))
        ? await (supabase as any).from("team_roles").select("user_id, role")
        : rolesFull;

    if (rolesRes.error) {
      const msg = rolesRes.error.message.toLowerCase();
      if (msg.includes("does not exist") || msg.includes("could not find")) {
        setError(
          "Missing table `team_roles`. Run `web/supabase/team-roles.sql` in Supabase SQL Editor first.",
        );
      } else {
        setError(rolesRes.error.message);
      }
    }

    const nextRows = (profilesRes.data ?? []) as ProfileRow[];
    const nextRoles: Record<string, RoleValue> = {};
    const nextDbPresent: Record<string, boolean> = {};
    const roleNames: Record<string, string> = {};
    const roleEmails: Record<string, string> = {};
    for (const r of (rolesRes.data ?? []) as RoleRow[]) {
      if (r.role === "owner" || r.role === "team") {
        nextRoles[r.user_id] = r.role;
        nextDbPresent[r.user_id] = true;
      }
      const rn = (r.account_name ?? "").trim();
      const re = (r.account_email ?? "").trim().toLowerCase();
      if (rn) roleNames[r.user_id] = rn;
      if (re) roleEmails[r.user_id] = re;
    }
    if (!nextRoles[ownerId]) nextRoles[ownerId] = "owner";

    const mergedRows = [...nextRows];
    for (const rid of Object.keys(nextRoles)) {
      if (mergedRows.some((r) => r.id === rid)) continue;
      mergedRows.push({
        id: rid,
        first_name: roleNames[rid] ?? null,
        full_name: roleNames[rid] ?? null,
        email: roleEmails[rid] ?? null,
        avatar_initials: null,
      });
    }

    try {
      const authRes = await fetch("/api/role-applier/pending-auth-users", {
        credentials: "same-origin",
      });
      const authJson = (await authRes.json().catch(() => null)) as {
        users?: { id: string; email: string | null }[];
        hint?: string;
      } | null;
      if (authRes.ok && authJson?.users?.length) {
        for (const u of authJson.users) {
          if (mergedRows.some((r) => r.id === u.id)) continue;
          const em = u.email?.trim() || null;
          const local = em?.split("@")[0] ?? null;
          mergedRows.push({
            id: u.id,
            first_name: local,
            full_name: local,
            email: em,
            avatar_initials: null,
          });
        }
      } else if (authRes.status === 503 && authJson?.hint) {
        setInfo((prev) => prev ?? authJson.hint ?? null);
      }
    } catch {
      /* optional enrichment */
    }

    setRows(mergedRows);
    setRoles(nextRoles);
    setDbRolePresent(nextDbPresent);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSetRole = useCallback(
    async (userId: string, role: RoleValue) => {
      setSavingId(userId);
      setError(null);
      setInfo(null);
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await (supabase as any).from("team_roles").upsert(
        {
          user_id: userId,
          role,
          updated_by: ownerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (upErr) {
        setError(upErr.message);
      } else {
        setRoles((prev) => ({ ...prev, [userId]: role }));
        setDbRolePresent((prev) => ({ ...prev, [userId]: true }));
        setInfo("Role updated.");
      }
      setSavingId(null);
    },
    [ownerId],
  );

  const members = useMemo(() => {
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.id);
    for (const rid of Object.keys(roles)) ids.add(rid);

    const list = [...ids].map((id) => {
      const r = rowMap.get(id);
      const p = teamProfileFromDb({
        id,
        first_name: r?.first_name ?? null,
        full_name: r?.full_name ?? null,
        avatar_initials: r?.avatar_initials ?? null,
        email: r?.email ?? null,
      });
      const usernameFromEmail = (r?.email ?? "").split("@")[0] ?? "";
      const isNewJoiner = id !== ownerId && !dbRolePresent[id];
      return {
        id,
        display: p.fullName || p.firstName || usernameFromEmail || `member-${id.slice(0, 8)}`,
        email: r?.email ?? null,
        initials: p.initials || "·",
        isNewJoiner,
        selectValue: isNewJoiner ? "pending" : (roles[id] ?? "team"),
      };
    });

    list.sort((a, b) => {
      if (a.isNewJoiner !== b.isNewJoiner) return a.isNewJoiner ? -1 : 1;
      return a.display.localeCompare(b.display, undefined, { sensitivity: "base" });
    });
    return list;
  }, [rows, roles, dbRolePresent, ownerId]);

  if (loading) {
    return (
      <p className="rounded-xl border border-white/[0.08] bg-[#0a0a0a]/80 px-4 py-6 text-center text-sm text-zinc-500 backdrop-blur-sm">
        Loading team members…
      </p>
    );
  }

  return (
    <section className="@container min-w-0 rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/90 p-4 backdrop-blur-md @md:p-5">
      <div className="mb-4 flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-zinc-50 @md:text-lg">Role Applier</h2>
          <p className="mt-1 text-sm text-zinc-500">
            <span className="text-amber-200/90">New</span> joiners sort first — assign Team or Owner.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 self-start rounded-full border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] @md:self-auto"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">{error}</p>
      ) : null}
      {info ? (
        <p className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200">
          {info}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-black/50">
        <div className="border-b border-white/[0.06] bg-black/40 px-3 py-2.5 @md:px-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 @md:text-sm">Role manager</p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-600 @md:text-xs">{members.length} people</p>
        </div>

        <div className="max-h-[min(440px,52dvh)] overflow-y-auto overscroll-contain @md:max-h-[min(520px,58vh)]">
          <div className="space-y-2 p-2 @md:hidden">
            {members.map((m) => (
              <article
                key={m.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition hover:bg-white/[0.05]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-zinc-200 ring-1 ring-white/[0.08]">
                    {m.initials.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-100">{m.display}</span>
                      {m.isNewJoiner ? (
                        <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-words text-sm text-zinc-400">{m.email ?? "—"}</p>
                    <p className="mt-1 break-all font-mono text-[11px] leading-snug text-zinc-600" title={m.id}>
                      {m.id}
                    </p>
                  </div>
                </div>
                <div className="mt-3 min-w-0 border-t border-white/[0.06] pt-3">
                  <UiSelect
                    className="w-full max-w-full"
                    value={m.selectValue}
                    disabled={savingId === m.id}
                    onChange={(v) => {
                      if (v === "team" || v === "owner") void onSetRole(m.id, v);
                    }}
                    options={m.isNewJoiner ? NEW_JOINER_SELECT_OPTIONS : ROLE_SELECT_OPTIONS}
                    triggerClassName="min-h-[2.75rem] border-white/[0.1] bg-black/40 text-[15px]"
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden @md:block">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-sm">
                <tr className="text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="hidden px-4 py-3 font-medium @lg:table-cell">User ID</th>
                  <th className="w-[11rem] px-4 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-zinc-200 ring-1 ring-white/[0.08]">
                          {m.initials.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-100">{m.display}</span>
                            {m.isNewJoiner ? (
                              <span className="shrink-0 rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                                New
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[220px] break-words px-4 py-3 align-middle text-sm text-zinc-400 @lg:max-w-[260px]">
                      {m.email ?? "—"}
                    </td>
                    <td className="hidden max-w-[200px] px-4 py-3 align-middle @lg:table-cell">
                      <span className="line-clamp-2 break-all font-mono text-xs text-zinc-600" title={m.id}>
                        {m.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <UiSelect
                        className="w-full min-w-[10rem] max-w-[12rem]"
                        value={m.selectValue}
                        disabled={savingId === m.id}
                        onChange={(v) => {
                          if (v === "team" || v === "owner") void onSetRole(m.id, v);
                        }}
                        options={m.isNewJoiner ? NEW_JOINER_SELECT_OPTIONS : ROLE_SELECT_OPTIONS}
                        triggerClassName="min-h-[2.5rem] border-white/[0.1] bg-black/50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
