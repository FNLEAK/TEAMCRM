import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportBatchRow = {
  import_batch_id: string;
  import_filename: string | null;
  lead_count: number;
  imported_at: string | null;
};

type RpcRow = {
  import_batch_id: string;
  import_filename: string | null;
  lead_count: number | string;
  imported_at: string | null;
};

/** Normalize rows returned by `get_recent_import_batches` RPC. */
export function normalizeImportBatchRpcRows(data: unknown): ImportBatchRow[] {
  if (!Array.isArray(data)) return [];
  return (data as RpcRow[]).map((r) => ({
    import_batch_id: String(r.import_batch_id),
    import_filename: r.import_filename ?? null,
    lead_count: typeof r.lead_count === "string" ? parseInt(r.lead_count, 10) : Number(r.lead_count),
    imported_at: r.imported_at ?? null,
  }));
}

function aggregateFromLeads(
  rows: { import_batch_id: string | null; import_filename: string | null; created_at: string | null }[],
  limit: number,
): ImportBatchRow[] {
  const m = new Map<
    string,
    { filename: string; count: number; importedAt: string | null }
  >();
  for (const r of rows) {
    const id = r.import_batch_id;
    if (!id) continue;
    const cur = m.get(id);
    const t = r.created_at;
    if (!cur) {
      m.set(id, {
        filename: (r.import_filename ?? "").trim(),
        count: 1,
        importedAt: t,
      });
    } else {
      cur.count++;
      if ((r.import_filename ?? "").trim() && !cur.filename) {
        cur.filename = (r.import_filename ?? "").trim();
      }
      if (t && (!cur.importedAt || t < cur.importedAt)) {
        cur.importedAt = t;
      }
    }
  }
  return [...m.entries()]
    .map(([import_batch_id, v]) => ({
      import_batch_id,
      import_filename: v.filename || null,
      lead_count: v.count,
      imported_at: v.importedAt,
    }))
    .sort((a, b) => (b.imported_at ?? "").localeCompare(a.imported_at ?? ""))
    .slice(0, limit);
}

/**
 * Recent CSV import batches (newest first). Uses RPC when available; otherwise aggregates client-side.
 */
export async function fetchRecentImportBatches(
  supabase: SupabaseClient,
  limit = 35,
): Promise<{ rows: ImportBatchRow[]; error: string | null }> {
  const cap = Math.min(100, Math.max(5, limit));

  const rpc = await supabase.rpc("get_recent_import_batches", { limit_n: cap });
  if (!rpc.error && rpc.data && Array.isArray(rpc.data)) {
    return { rows: normalizeImportBatchRpcRows(rpc.data), error: null };
  }

  const { data, error } = await supabase
    .from("leads")
    .select("import_batch_id, import_filename, created_at")
    .not("import_batch_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(12000);

  if (error) {
    return {
      rows: [],
      error: error.message || "Could not load import history.",
    };
  }

  return { rows: aggregateFromLeads(data ?? [], cap), error: null };
}
