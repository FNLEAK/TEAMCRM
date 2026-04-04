"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BulkActionsBar } from "@/components/BulkActionsBar";

const PipelineBoard = dynamic(
  () => import("@/components/PipelineBoard").then((m) => ({ default: m.PipelineBoard })),
  {
    loading: () => (
      <div className="flex min-h-[min(60dvh,520px)] items-center justify-center text-sm text-slate-500">
        Loading board…
      </div>
    ),
  },
);
const LeadFormModal = dynamic(() =>
  import("@/components/LeadFormModal").then((m) => ({ default: m.LeadFormModal })),
);
const ImportCsvModal = dynamic(() =>
  import("@/components/ImportCsvModal").then((m) => ({ default: m.ImportCsvModal })),
);
const QuickAddModal = dynamic(() =>
  import("@/components/QuickAddModal").then((m) => ({ default: m.QuickAddModal })),
);
import { useBoardRefresh } from "@/hooks/useBoardRefresh";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

type UserOpt = { id: string; email: string; name: string | null };

export default function PipelinePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const { boardVersion, refresh } = useBoardRefresh();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [leadOpen, setLeadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api<{ users: UserOpt[] }>("/users", token);
      setUsers(res.users);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  if (!token) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-[1600px] flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] bg-[var(--color-surface)] px-0 py-4 backdrop-blur-xl sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Sales pipeline</h1>
            <p className="text-xs text-slate-500">Drag cards across stages · Select for bulk actions</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLeadOpen(true)}
              className="rounded-xl bg-gradient-to-r from-violet-600/85 to-cyan-600/85 px-3 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(167,139,250,0.22)] hover:brightness-110"
            >
              Add lead
            </button>
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.08]"
            >
              Quick add
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.08]"
            >
              Import CSV
            </button>
          </div>
        </div>
        <div className="px-4 pt-3 sm:px-6">
          <BulkActionsBar
            token={token}
            selectedIds={[...selectedIds]}
            users={users}
            onClear={clearSelection}
            onDone={refresh}
          />
        </div>
        <PipelineBoard
          token={token}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          boardVersion={boardVersion}
        />
      </div>

      {leadOpen ? (
        <LeadFormModal
          token={token}
          open
          onClose={() => setLeadOpen(false)}
          onSaved={refresh}
          users={users}
        />
      ) : null}
      {importOpen ? (
        <ImportCsvModal
          token={token}
          open
          onClose={() => setImportOpen(false)}
          onComplete={refresh}
        />
      ) : null}
      {quickOpen ? (
        <QuickAddModal
          token={token}
          open
          onClose={() => setQuickOpen(false)}
          onComplete={refresh}
        />
      ) : null}
    </AppShell>
  );
}
