"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteLeadsByImportBatchAction } from "@/app/actions/deleteLeadsByImportBatchAction";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { normalizeImportBatchRpcRows, type ImportBatchRow } from "@/lib/importBatchHistory";

export type ImportHistoryProps = {
  open: boolean;
  onClose: () => void;
  onDataChanged: () => void;
  onNotify: (message: string, tone: "success" | "error") => void;
  /** When false, batch delete is hidden — only account owners should pass true (see `canManageRoles` on the server). */
  canDeleteImportBatches: boolean;
};

/**
 * Lists CSV import batches via `get_recent_import_batches` (see Supabase RPC) and allows deleting by `import_batch_id`.
 */
export function ImportHistory({
  open,
  onClose,
  onDataChanged,
  onNotify,
  canDeleteImportBatches,
}: ImportHistoryProps) {
  const [rows, setRows] = useState<ImportBatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error: rpcError } = await supabase.rpc("get_recent_import_batches", {
      limit_n: 40,
    } as never);
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
      return;
    }
    setRows(normalizeImportBatchRpcRows(data));
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleDelete = useCallback(
    async (row: ImportBatchRow) => {
      if (!canDeleteImportBatches) return;
      const n = row.lead_count;
      if (
        !window.confirm(
          `Delete all leads from this import?\n\n${row.import_filename ?? "Untitled"}\n${n.toLocaleString()} lead(s) will be removed. This cannot be undone.`,
        )
      ) {
        return;
      }
      setDeletingId(row.import_batch_id);
      const r = await deleteLeadsByImportBatchAction(row.import_batch_id);
      setDeletingId(null);
      if (!r.ok) {
        onNotify(r.error ?? "Could not delete import batch.", "error");
        return;
      }
      onNotify(`Deleted ${n.toLocaleString()} leads.`, "success");
      onDataChanged();
      void load();
    },
    [canDeleteImportBatches, load, onDataChanged, onNotify],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => onClose()}
      />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0c0c0e] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06]">
        <h2 className="text-lg font-semibold text-white">Recent imports</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Data from <code className="text-emerald-400/90">get_recent_import_batches</code>.
          {canDeleteImportBatches
            ? " Delete removes every lead with that batch id."
            : " Only account owners can delete an import batch."}
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-400">Loading…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-rose-300">{error}</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">No CSV imports found yet.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((row) => (
              <li
                key={row.import_batch_id}
                className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-[#09090b] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {row.import_filename?.trim() ? row.import_filename : "Untitled import"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {row.lead_count.toLocaleString()} leads
                    {row.imported_at ? (
                      <span className="text-zinc-600"> · {new Date(row.imported_at).toLocaleString()}</span>
                    ) : null}
                  </p>
                </div>
                {canDeleteImportBatches ? (
                  <button
                    type="button"
                    disabled={deletingId === row.import_batch_id}
                    onClick={() => void handleDelete(row)}
                    className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-900/60 disabled:opacity-50"
                  >
                    {deletingId === row.import_batch_id ? "Deleting…" : "Delete"}
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] font-medium text-zinc-600">Owner only</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/[0.1] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-medium text-white hover:bg-white/[0.12]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
