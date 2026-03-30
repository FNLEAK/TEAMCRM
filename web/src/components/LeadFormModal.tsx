"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { STAGE_ORDER, STAGE_LABELS, type Stage } from "@/lib/stages";
import type { Lead } from "@/lib/types";

type UserOpt = { id: string; email: string; name: string | null };

type Props = {
  token: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lead?: Lead | null;
  users: UserOpt[];
};

export function LeadFormModal({ token, open, onClose, onSaved, lead, users }: Props) {
  const [title, setTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dealValue, setDealValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<Stage>("NEW");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (lead) {
      setTitle(lead.title);
      setContactName(lead.contactName ?? "");
      setEmail(lead.email ?? "");
      setPhone(lead.phone ?? "");
      setDealValue(lead.dealValue ?? "0");
      setNotes(lead.notes ?? "");
      setStage(lead.stage);
      setAssigneeId(lead.assigneeId ?? "");
    } else {
      setTitle("");
      setContactName("");
      setEmail("");
      setPhone("");
      setDealValue("0");
      setNotes("");
      setStage("NEW");
      setAssigneeId("");
    }
  }, [open, lead]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        dealValue: dealValue,
        notes: notes || null,
        stage,
        assigneeId: assigneeId || null,
      };
      if (lead) {
        await api(`/leads/${lead.id}`, token, { method: "PATCH", json: payload });
      } else {
        await api("/leads", token, { method: "POST", json: payload });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{lead ? "Edit lead" : "New lead"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-700">Title *</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Contact name</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Phone</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Deal value</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Stage</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
              >
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Assign to</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Notes</label>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
