"use client";

import { useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import type { Stage } from "@/lib/stages";
import { STAGE_LABELS } from "@/lib/stages";
import type { Lead } from "@/lib/types";
import { VirtualLeadList } from "./VirtualLeadList";

type Props = {
  stage: Stage;
  leadIds: string[];
  leadsById: Record<string, Lead>;
  total: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
};

export function KanbanColumn({
  stage,
  leadIds,
  leadsById,
  total,
  selectedIds,
  onToggleSelect,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const useVirtual = leadIds.length > 50;

  return (
    <div className="flex w-[min(100vw-2rem,300px)] shrink-0 flex-col rounded-2xl bg-column-bg p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-slate-800">{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums shadow-sm">
          {total}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          "flex min-h-[140px] flex-1 flex-col rounded-xl border-2 border-dashed p-1.5 transition-colors",
          isOver ? "border-accent/60 bg-teal-50/40" : "border-transparent bg-white/40",
        )}
      >
        <VirtualLeadList
          leadIds={leadIds}
          leadsById={leadsById}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          useVirtual={useVirtual}
        />
      </div>
    </div>
  );
}
