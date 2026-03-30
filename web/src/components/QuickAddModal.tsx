"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Props = {
  token: string;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

export function QuickAddModal({ token, open, onClose, onComplete }: Props) {
  const [lines, setLines] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await api<{ created: number }>("/leads/quick-add", token, {
        method: "POST",
        json: { lines },
      });
      setResult(res.created);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quick add failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Quick add leads</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Paste one business name per line. Leads are created instantly in <strong>New</strong> with
          placeholder emails.
        </p>
        <form onSubmit={submit} className="mt-4">
          <textarea
            className="min-h-[200px] w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
            placeholder={"Acme Roofing\nSummit HVAC\n..."}
            value={lines}
            onChange={(e) => setLines(e.target.value)}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {result !== null && (
            <p className="mt-2 text-sm text-emerald-700">Created {result} leads.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">
              Close
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create leads"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
