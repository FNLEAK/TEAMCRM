"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { STAGE_ORDER, STAGE_LABELS, type Stage } from "@/lib/stages";

type UserOpt = { id: string; email: string; name: string | null };

type Props = {
  token: string;
  selectedIds: string[];
  users: UserOpt[];
  onClear: () => void;
  onDone: () => void;
};

export function BulkActionsBar({ token, selectedIds, users, onClear, onDone }: Props) {
  const [stage, setStage] = useState<Stage | "">("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  async function apply() {
    setError(null);
    if (!stage && assigneeId === "") {
      setError("Choose a stage and/or assignee");
      return;
    }
    setLoading(true);
    try {
      const json: { leadIds: string[]; stage?: Stage; assigneeId?: string | null } = {
        leadIds: selectedIds,
      };
      if (stage) json.stage = stage;
      if (assigneeId === "__unassign") json.assigneeId = null;
      else if (assigneeId) json.assigneeId = assigneeId;

      await api<{ updated: number }>("/leads/bulk/update", token, { method: "PATCH", json });
      onDone();
      onClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-teal-50/80 px-4 py-3 text-sm shadow-sm">
      <span className="font-medium text-slate-800">{selectedIds.length} selected</span>
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
        value={stage}
        onChange={(e) => setStage((e.target.value || "") as Stage | "")}
      >
        <option value="">Move to stage…</option>
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
      >
        <option value="">Assign to…</option>
        <option value="__unassign">Unassign</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name ?? u.email}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={loading}
        onClick={() => void apply()}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Applying…" : "Apply"}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        Clear
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
