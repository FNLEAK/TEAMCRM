"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PipelineBoard } from "@/components/PipelineBoard";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { LeadFormModal } from "@/components/LeadFormModal";
import { ImportCsvModal } from "@/components/ImportCsvModal";
import { QuickAddModal } from "@/components/QuickAddModal";
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
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-[1600px] flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white/60 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Sales pipeline</h1>
            <p className="text-xs text-slate-500">Drag cards across stages · Select for bulk actions</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLeadOpen(true)}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-accent-hover"
            >
              Add lead
            </button>
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              Quick add
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
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

      <LeadFormModal
        token={token}
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        onSaved={refresh}
        users={users}
      />
      <ImportCsvModal
        token={token}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={refresh}
      />
      <QuickAddModal
        token={token}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onComplete={refresh}
      />
    </AppShell>
  );
}
