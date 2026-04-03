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
      <div className="flex min-h-svh items-center justify-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  if (error && !lead) {
    return (
      <AppShell>
        <div className="p-8 text-center text-sm text-red-400">
          {error}{" "}
          <Link href="/pipeline" className="text-cyan-400 underline hover:text-cyan-300">
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
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/pipeline" className="text-xs font-medium text-cyan-400/90 hover:text-cyan-300 hover:underline">
          ← Pipeline
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">{lead.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {STAGE_LABELS[lead.stage]} · {fmtMoney(lead.dealValue)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void deleteLead()}
              className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/15"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white">Contact</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Name</dt>
                <dd className="text-slate-200">{lead.contactName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="text-slate-200">{lead.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="text-slate-200">{lead.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Owner</dt>
                <dd className="text-slate-200">
                  {lead.assignee ? lead.assignee.name ?? lead.assignee.email : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <form
            onSubmit={saveMeta}
            className="rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl"
          >
            <h2 className="text-sm font-semibold text-white">Activity & reminders</h2>
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
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Next action</label>
                <input
                  name="nextAction"
                  defaultValue={lead.nextAction ?? ""}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                  placeholder="e.g. Call back Tuesday"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Next action date</label>
                <input
                  type="datetime-local"
                  name="nextActionAt"
                  defaultValue={lead.nextActionAt ? lead.nextActionAt.slice(0, 16) : ""}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Save activity fields
              </button>
            </div>
          </form>
        </div>

        {lead.notes && (
          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white">Notes (summary)</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{lead.notes}</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-[var(--color-surface)] p-5 shadow-card backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-white">Call notes</h2>
          <form onSubmit={addNote} className="mt-3 space-y-2">
            <textarea
              className="min-h-[100px] w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              placeholder="Log outcome of this call…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={touchContact}
                onChange={(e) => setTouchContact(e.target.checked)}
                className="rounded border-white/20 bg-black/40"
              />
              Set last contacted to now when saving
            </label>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Add note
            </button>
          </form>
          <ul className="mt-6 space-y-4 border-t border-white/[0.06] pt-4">
            {lead.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-xs text-slate-500">
                  {new Date(a.createdAt).toLocaleString()}
                  {a.author?.name ? ` · ${a.author.name}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">{a.content}</p>
              </li>
            ))}
            {lead.activities.length === 0 && (
              <li className="text-sm text-slate-500">No call notes yet.</li>
            )}
          </ul>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
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
