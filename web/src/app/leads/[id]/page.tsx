"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LeadFormModal } from "@/components/LeadFormModal";
import { api } from "@/lib/api";
import { STAGE_LABELS } from "@/lib/stages";
import type { Lead } from "@/lib/types";
import { useAuthStore } from "@/store/auth";

type UserOpt = { id: string; email: string; name: string | null };

type LeadDetail = Lead & {
  activities: { id: string; content: string; createdAt: string; author: { id: string; name: string | null } | null }[];
};

export default function LeadDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [note, setNote] = useState("");
  const [touchContact, setTouchContact] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const l = await api<LeadDetail>(`/leads/${id}`, token);
      setLead(l);
    } catch {
      setError("Lead not found");
    }
  }, [id, token]);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await api<{ users: UserOpt[] }>("/users", token);
        setUsers(res.users);
      } catch {
        /* ignore */
      }
    })();
  }, [token]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !note.trim()) return;
    try {
      await api(`/leads/${id}/notes`, token, {
        method: "POST",
        json: { content: note.trim(), touchLastContacted: touchContact },
      });
      setNote("");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    }
  }

  async function deleteLead() {
    if (!token || !confirm("Delete this lead?")) return;
    try {
      await api(`/leads/${id}`, token, { method: "DELETE" });
      router.push("/pipeline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !lead) return;
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      const lc = (fd.get("lastContactedAt") as string)?.trim();
      const na = (fd.get("nextActionAt") as string)?.trim();
      await api(`/leads/${id}`, token, {
        method: "PATCH",
        json: {
          nextAction: (fd.get("nextAction") as string)?.trim() || null,
          nextActionAt: na ? new Date(na).toISOString() : null,
          lastContactedAt: lc ? new Date(lc).toISOString() : null,
        },
      });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  if (error && !lead) {
    return (
      <AppShell>
        <div className="p-8 text-center text-sm text-red-600">
          {error}{" "}
          <Link href="/pipeline" className="text-accent underline">
            Back
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  const fmtMoney = (v: string) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(parseFloat(v));

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/pipeline" className="text-xs font-medium text-accent hover:underline">
          ← Pipeline
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{lead.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {STAGE_LABELS[lead.stage]} · {fmtMoney(lead.dealValue)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void deleteLead()}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-sm font-semibold text-slate-900">Contact</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Name</dt>
                <dd className="text-slate-800">{lead.contactName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="text-slate-800">{lead.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="text-slate-800">{lead.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Owner</dt>
                <dd className="text-slate-800">
                  {lead.assignee ? lead.assignee.name ?? lead.assignee.email : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <form
            onSubmit={saveMeta}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
          >
            <h2 className="text-sm font-semibold text-slate-900">Activity & reminders</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs text-slate-500">Last contacted</label>
                <input
                  type="datetime-local"
                  name="lastContactedAt"
                  defaultValue={
                    lead.lastContactedAt
                      ? lead.lastContactedAt.slice(0, 16)
                      : ""
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Next action</label>
                <input
                  name="nextAction"
                  defaultValue={lead.nextAction ?? ""}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. Call back Tuesday"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Next action date</label>
                <input
                  type="datetime-local"
                  name="nextActionAt"
                  defaultValue={lead.nextActionAt ? lead.nextActionAt.slice(0, 16) : ""}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Save activity fields
              </button>
            </div>
          </form>
        </div>

        {lead.notes && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-sm font-semibold text-slate-900">Notes (summary)</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{lead.notes}</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900">Call notes</h2>
          <form onSubmit={addNote} className="mt-3 space-y-2">
            <textarea
              className="min-h-[100px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Log outcome of this call…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={touchContact}
                onChange={(e) => setTouchContact(e.target.checked)}
              />
              Set last contacted to now when saving
            </label>
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Add note
            </button>
          </form>
          <ul className="mt-6 space-y-4 border-t border-slate-100 pt-4">
            {lead.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-xs text-slate-400">
                  {new Date(a.createdAt).toLocaleString()}
                  {a.author?.name ? ` · ${a.author.name}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.content}</p>
              </li>
            ))}
            {lead.activities.length === 0 && (
              <li className="text-sm text-slate-500">No call notes yet.</li>
            )}
          </ul>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      <LeadFormModal
        token={token}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
        lead={lead}
        users={users}
      />
    </AppShell>
  );
}
