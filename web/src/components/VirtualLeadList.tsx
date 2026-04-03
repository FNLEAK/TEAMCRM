"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Lead } from "@/lib/types";
import { LeadCard } from "./LeadCard";

type Props = {
  leadIds: string[];
  leadsById: Record<string, Lead>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  useVirtual: boolean;
};

const ESTIMATE = 118;

export function VirtualLeadList({
  leadIds,
  leadsById,
  selectedIds,
  onToggleSelect,
  useVirtual,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: leadIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE,
    overscan: 8,
    enabled: useVirtual,
  });

  if (!useVirtual) {
    return (
      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {leadIds.map((id) => {
            const lead = leadsById[id];
            if (!lead) return null;
            return (
              <LeadCard
                key={id}
                lead={lead}
                selected={selectedIds.has(id)}
                onToggleSelect={onToggleSelect}
              />
            );
          })}
        </div>
      </SortableContext>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
      <div ref={parentRef} className="max-h-[calc(100vh-10rem)] overflow-auto pr-1">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualRow) => {
            const id = leadIds[virtualRow.index];
            const lead = leadsById[id];
            if (!lead) return null;
            return (
              <div
                key={id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="pb-2"
              >
                <LeadCard
                  lead={lead}
                  selected={selectedIds.has(id)}
                  onToggleSelect={onToggleSelect}
                />
              </div>
            );
          })}
        </div>
      </div>
    </SortableContext>
  );
}
