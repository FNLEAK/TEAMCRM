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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[var(--color-surface-strong)] p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Quick add leads</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Paste one business name per line. Leads are created instantly in <strong className="text-slate-200">New</strong> with
          placeholder emails.
        </p>
        <form onSubmit={submit} className="mt-4">
          <textarea
            className="min-h-[200px] w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600"
            placeholder={"Acme Roofing\nSummit HVAC\n..."}
            value={lines}
            onChange={(e) => setLines(e.target.value)}
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          {result !== null && (
            <p className="mt-2 text-sm text-emerald-400">Created {result} leads.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Close
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create leads"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
