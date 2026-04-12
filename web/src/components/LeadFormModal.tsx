"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { UiSelect } from "@/components/UiSelect";
import { STAGE_ORDER, STAGE_LABELS, type Stage } from "@/lib/stages";
import type { Lead } from "@/lib/types";
import { displayLeadPhone, normalizeLeadPhoneForStorage } from "@/lib/phone";

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

  const stageOptions = useMemo(
    () => STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
    [],
  );

  const assigneeOptions = useMemo(
    () => [
      { value: "", label: "Unassigned" },
      ...users.map((u) => ({ value: u.id, label: u.name ?? u.email })),
    ],
    [users],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (lead) {
      setTitle(lead.title);
      setContactName(lead.contactName ?? "");
      setEmail(lead.email ?? "");
      setPhone(displayLeadPhone(lead.phone) || lead.phone || "");
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
        phone: normalizeLeadPhoneForStorage(phone),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-[var(--color-surface-strong)] p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">{lead ? "Edit lead" : "New lead"}</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-400">Title *</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400">Contact name</label>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Phone</label>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400">Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400">Deal value</label>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Stage</label>
              <UiSelect
                className="mt-1"
                value={stage}
                onChange={(v) => setStage(v as Stage)}
                options={stageOptions}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400">Assign to</label>
            <UiSelect
              className="mt-1"
              value={assigneeId}
              onChange={setAssigneeId}
              options={assigneeOptions}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400">Notes</label>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
