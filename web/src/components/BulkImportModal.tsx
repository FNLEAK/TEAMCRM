"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { autoDetectLeadsFromText } from "@/lib/autoDetectLeadsFromText";
import { CSV_IMPORT_BATCH_SIZE, type LeadInsertPayload } from "@/lib/csvLeadMapping";

const PREVIEW_DISPLAY_CAP = 200;

type BulkPhase = "pick" | "review" | "importing" | "done";

export type BulkImportModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import or partial failure that changed data. */
  onDataChanged: () => void;
  onNotify: (message: string, tone: "success" | "error") => void;
};

export function BulkImportModal({ open, onClose, onDataChanged, onNotify }: BulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<BulkPhase>("pick");
  const [fileName, setFileName] = useState("");
  const [payloads, setPayloads] = useState<LeadInsertPayload[]>([]);
  const [linesScanned, setLinesScanned] = useState(0);
  const [skippedLines, setSkippedLines] = useState(0);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("pick");
    setFileName("");
    setPayloads([]);
    setLinesScanned(0);
    setSkippedLines(0);
    setDuplicatesRemoved(0);
    setProgress({ done: 0, total: 0 });
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const parseFile = (file: File) => {
    setError(null);
    setFileName(file.name);
    void file.text().then(
      (text) => {
        try {
          const result = autoDetectLeadsFromText(text);
          if (result.leads.length === 0) {
            setError("No leads detected. Add lines with a business name, phone, or website.");
            setPhase("pick");
            return;
          }
          setPayloads(result.leads);
          setLinesScanned(result.linesScanned);
          setSkippedLines(result.skippedLines);
          setDuplicatesRemoved(result.duplicatesRemoved);
          setPhase("review");
        } catch (e) {
          console.error(e);
          setError(e instanceof Error ? e.message : "Failed to read file.");
          setPhase("pick");
        }
      },
      () => {
        setError("Failed to read file.");
        setPhase("pick");
      },
    );
  };

  const runImport = async () => {
    if (payloads.length === 0) {
      onNotify("Nothing to import.", "error");
      return;
    }
    const importBatchId = crypto.randomUUID();
    const importFilename = fileName.trim() || "import.txt";

    setPhase("importing");
    setProgress({ done: 0, total: payloads.length });
    const supabase = createSupabaseBrowserClient();
    let uploaded = 0;

    for (let i = 0; i < payloads.length; i += CSV_IMPORT_BATCH_SIZE) {
      const chunk: LeadInsertPayload[] = payloads.slice(i, i + CSV_IMPORT_BATCH_SIZE).map((row) => ({
        ...row,
        import_batch_id: importBatchId,
        import_filename: importFilename,
      }));
      const { error: insertError } = await supabase.from("leads").insert(chunk);
      if (insertError) {
        console.error(insertError);
        setError(insertError.message || "Batch insert failed.");
        setPhase("review");
        const msg =
          uploaded > 0
            ? `Stopped after ${uploaded.toLocaleString()} leads: ${insertError.message}`
            : insertError.message;
        onNotify(msg, "error");
        onDataChanged();
        return;
      }
      uploaded += chunk.length;
      setProgress({ done: uploaded, total: payloads.length });
    }

    setPhase("done");
    onNotify(`Imported ${uploaded.toLocaleString()} leads.`, "success");
    onDataChanged();
  };

  const handleClose = () => {
    if (phase === "importing") return;
    reset();
    onClose();
  };

  const previewRows = payloads.slice(0, PREVIEW_DISPLAY_CAP);
  const previewHidden = Math.max(0, payloads.length - previewRows.length);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => (phase !== "importing" ? handleClose() : undefined)}
      />
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0c0c0e] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-white">Bulk import — auto-detect</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a <span className="text-zinc-300">.csv</span> or <span className="text-zinc-300">.txt</span> file. We
          scan each line with regex for phones (10–11 digits → formatted), websites (.com / .org / .io / …), and a
          company name (first meaningful text). Duplicates and placeholder tokens are removed. Each run still gets a
          unique <code className="text-emerald-400/90">import_batch_id</code> on every row; uploads use batches of{" "}
          {CSV_IMPORT_BATCH_SIZE}.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) parseFile(f);
          }}
        />

        {phase === "pick" ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.06] py-10 text-sm font-medium text-emerald-200/90 transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
            >
              Choose .csv or .txt file…
            </button>
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            {fileName && !error ? <p className="mt-2 text-xs text-zinc-500">Selected: {fileName}</p> : null}
          </div>
        ) : null}

        {phase === "review" ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-zinc-300">
              <span className="font-medium text-white">{fileName}</span> —{" "}
              <span className="text-emerald-300">{payloads.length.toLocaleString()}</span> leads detected
              {linesScanned > 0 ? (
                <span className="text-zinc-500">
                  {" "}
                  ({linesScanned.toLocaleString()} non-empty lines scanned
                  {skippedLines > 0 ? `, ${skippedLines.toLocaleString()} lines skipped` : ""}
                  {duplicatesRemoved > 0 ? `, ${duplicatesRemoved.toLocaleString()} duplicates removed` : ""})
                </span>
              ) : null}
              .
            </p>

            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">Detected leads</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Review formatting before importing. Showing {previewRows.length.toLocaleString()}
                {previewHidden > 0 ? ` of ${payloads.length.toLocaleString()}` : ""} rows.
              </p>
            </div>

            <div className="max-h-[min(50vh,420px)] overflow-auto rounded-xl border border-white/[0.08]">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0a0a0a]">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="px-3 py-2.5">Company</th>
                    <th className="px-3 py-2.5">Phone</th>
                    <th className="px-3 py-2.5">Website</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {previewRows.map((row, i) => (
                    <tr key={`${row.company_name}-${row.phone}-${row.website}-${i}`} className="bg-[#09090b]/80">
                      <td className="max-w-[220px] truncate px-3 py-2 font-medium text-zinc-100" title={row.company_name}>
                        {row.company_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-emerald-300/95">{row.phone ?? "—"}</td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-zinc-400" title={row.website ?? ""}>
                        {row.website ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewHidden > 0 ? (
              <p className="text-center text-xs text-zinc-500">
                + {previewHidden.toLocaleString()} more rows will import (preview capped at {PREVIEW_DISPLAY_CAP}).
              </p>
            ) : null}

            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  fileInputRef.current?.click();
                }}
                className="rounded-xl border border-white/[0.1] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
              >
                Different file
              </button>
              <button
                type="button"
                disabled={payloads.length === 0}
                onClick={() => void runImport()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-40"
              >
                Start import
              </button>
            </div>
          </div>
        ) : null}

        {phase === "importing" ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-emerald-200">
              Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()}…
            </p>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-300 ease-out"
                style={{
                  width: `${progress.total ? (100 * progress.done) / progress.total : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-zinc-500">Do not close this tab until finished.</p>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-emerald-200">Done — {progress.total.toLocaleString()} leads imported.</p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-medium text-white hover:bg-white/[0.12]"
            >
              Close
            </button>
          </div>
        ) : null}

        {phase !== "importing" && phase !== "done" ? (
          <button type="button" onClick={handleClose} className="mt-6 text-sm text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
