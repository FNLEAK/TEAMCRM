"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type Props = {
  token: string;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

type JobStatus = {
  status: string;
  processed: number;
  total: number;
  created: number;
  errors: { row: number; message: string }[];
  errorMessage?: string;
};

export function ImportCsvModal({ token, open, onClose, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setJobId(null);
      setProgress(null);
      setError(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open]);

  if (!open) return null;

  async function startImport() {
    setError(null);
    setProgress(null);
    if (!file) {
      setError("Choose a CSV file");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/import/csv`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const text = await res.text();
    let data: { jobId?: string; error?: unknown } = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Upload failed");
      return;
    }
    if (!data.jobId) {
      setError("No job id returned");
      return;
    }
    setJobId(data.jobId);
    if (pollRef.current) clearInterval(pollRef.current);
    poll(data.jobId);
  }

  function poll(id: string) {
    pollRef.current = setInterval(async () => {
      try {
        const s = await api<JobStatus>(`/import/csv/${id}/status`, token);
        setProgress(s);
        if (s.status === "done" || s.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (s.status === "done") {
            onComplete();
          }
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setError("Lost connection to import job");
      }
    }, 450);
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[var(--color-surface-strong)] p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Bulk import (CSV)</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Map columns using headers such as{" "}
          <span className="font-mono text-xs">Title</span>,{" "}
          <span className="font-mono text-xs">Contact Name</span>,{" "}
          <span className="font-mono text-xs">Email</span>,{" "}
          <span className="font-mono text-xs">Phone</span>,{" "}
          <span className="font-mono text-xs">Deal Value</span>. Missing emails get placeholders. All rows
          start in <strong className="text-slate-200">New</strong>.
        </p>
        <div className="mt-4">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200"
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {progress && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                {progress.status === "done"
                  ? "Complete"
                  : progress.status === "error"
                    ? "Failed"
                    : "Importing…"}
              </span>
              <span>
                {progress.processed} / {progress.total} rows · {progress.created} created
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {progress.errorMessage && (
              <p className="text-xs text-red-400">{progress.errorMessage}</p>
            )}
            {progress.errors.length > 0 && (
              <ul className="max-h-28 overflow-auto text-xs text-amber-200/90">
                {progress.errors.slice(0, 20).map((er, i) => (
                  <li key={i}>
                    Row {er.row}: {er.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Close
          </button>
          <button
            type="button"
            disabled={!file || !!jobId}
            onClick={() => void startImport()}
            className="rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            Start import
          </button>
        </div>
      </div>
    </div>
  );
}
