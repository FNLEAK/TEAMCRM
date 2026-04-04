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
    <div className="flex w-full min-w-0 shrink-0 flex-col rounded-2xl border border-white/[0.06] bg-column-bg p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl md:w-[min(100vw-2rem,300px)]">
      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-slate-200">{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.08] px-2.5 py-0.5 text-xs font-semibold text-slate-300 tabular-nums">
          {total}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          "flex min-h-[140px] flex-1 flex-col rounded-xl border-2 border-dashed p-1.5 transition-colors",
          isOver ? "border-cyan-400/50 bg-cyan-500/10" : "border-transparent bg-black/20",
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
