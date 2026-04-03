"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { UiSelect } from "@/components/UiSelect";
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

  const stageOptions = useMemo(
    () => [
      { value: "", label: "Move to stage…" },
      ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
    ],
    [],
  );

  const assigneeOptions = useMemo(
    () => [
      { value: "", label: "Assign to…" },
      { value: "__unassign", label: "Unassign" },
      ...users.map((u) => ({ value: u.id, label: u.name ?? u.email })),
    ],
    [users],
  );

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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
      <span className="font-medium text-slate-200">{selectedIds.length} selected</span>
      <UiSelect
        className="min-w-[10.5rem]"
        size="sm"
        value={stage}
        onChange={(v) => setStage((v || "") as Stage | "")}
        options={stageOptions}
      />
      <UiSelect
        className="min-w-[10.5rem]"
        size="sm"
        value={assigneeId}
        onChange={setAssigneeId}
        options={assigneeOptions}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => void apply()}
        className="rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Applying…" : "Apply"}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-medium text-slate-400 hover:text-slate-200"
      >
        Clear
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
