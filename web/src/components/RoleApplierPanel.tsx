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
    return <p className="text-sm text-zinc-500">Loading team members…</p>;
  }

  return (
    <section className="@container min-w-0 rounded-xl border border-white/10 bg-[#070709] p-4 ring-1 ring-white/10 shadow-[0_0_42px_-24px_rgba(244,63,94,0.65)] @md:p-5">
      <div className="mb-4 flex flex-col gap-3 @md:flex-row @md:items-start @md:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Role Applier</h2>
          <p className="mt-1 text-xs text-zinc-500">
            New joiners show as <span className="text-amber-200/90">New</span> until you assign Team or Owner. They sort to the top.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 self-start rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {info}
        </p>
      ) : null}
      <section className="rounded-xl border border-white/12 bg-black/30 p-3 ring-1 ring-white/10 shadow-[0_0_26px_-16px_rgba(148,163,184,0.55)]">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Role Manager</p>

        <div className="space-y-3 @md:hidden">
          {members.map((m) => (
            <article
              key={m.id}
              className="rounded-lg border border-white/[0.08] bg-black/40 p-3 ring-1 ring-white/[0.04]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[11px] font-semibold text-zinc-200">
                  {m.initials.slice(0, 2)}
                </span>
                <span className="min-w-0 truncate font-medium text-zinc-200">{m.display}</span>
                {m.isNewJoiner ? (
                  <span className="shrink-0 rounded-md border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                    New
                  </span>
                ) : null}
              </div>
              <p className="mt-2 break-words text-[12px] text-zinc-400">
                <span className="text-zinc-500">Account </span>
                {m.email ?? "—"}
              </p>
              <p className="mt-1.5 break-all font-mono text-[11px] leading-snug text-zinc-500" title={m.id}>
                {m.id}
              </p>
              <div className="mt-3 min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Role</p>
                <UiSelect
                  className="w-full max-w-full"
                  value={m.selectValue}
                  disabled={savingId === m.id}
                  onChange={(v) => {
                    if (v === "team" || v === "owner") void onSetRole(m.id, v);
                  }}
                  options={m.isNewJoiner ? NEW_JOINER_SELECT_OPTIONS : ROLE_SELECT_OPTIONS}
                />
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto @md:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 font-medium">User ID</th>
                <th className="pb-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-white/[0.04]">
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[11px] font-semibold text-zinc-200">
                        {m.initials.slice(0, 2)}
                      </span>
                      <span className="font-medium text-zinc-200">{m.display}</span>
                      {m.isNewJoiner ? (
                        <span className="shrink-0 rounded-md border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                          New
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[200px] break-words py-2.5 text-[12px] text-zinc-400">{m.email ?? "—"}</td>
                  <td className="max-w-[240px] py-2.5 @lg:max-w-[280px]">
                    <span className="break-all font-mono text-[11px] text-zinc-500" title={m.id}>
                      {m.id}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <UiSelect
                      className="w-44"
                      value={m.selectValue}
                      disabled={savingId === m.id}
                      onChange={(v) => {
                        if (v === "team" || v === "owner") void onSetRole(m.id, v);
                      }}
                      options={m.isNewJoiner ? NEW_JOINER_SELECT_OPTIONS : ROLE_SELECT_OPTIONS}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
