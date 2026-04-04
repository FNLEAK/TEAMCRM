"use client";

import { useRef, useSyncExternalStore } from "react";
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

const MD_UP = "(min-width: 768px)";

function subscribeMdUp(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(MD_UP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMdUpSnapshot() {
  if (typeof window === "undefined") return true;
  return window.matchMedia(MD_UP).matches;
}

/** Below `md`, pipeline columns stack — virtual list should follow the page scroll, not a nested pane. */
function usePipelinePageScrollVirtual() {
  const mdUp = useSyncExternalStore(subscribeMdUp, getMdUpSnapshot, () => true);
  return !mdUp;
}

export function VirtualLeadList({
  leadIds,
  leadsById,
  selectedIds,
  onToggleSelect,
  useVirtual,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const pageScrollVirtual = usePipelinePageScrollVirtual();

  const virtualizer = useVirtualizer({
    count: leadIds.length,
    getScrollElement: () => {
      if (pageScrollVirtual) {
        return typeof document !== "undefined" ? document.documentElement : null;
      }
      return parentRef.current;
    },
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

  const listBody = (
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
  );

  return (
    <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
      {pageScrollVirtual ? (
        listBody
      ) : (
        <div ref={parentRef} className="max-h-[calc(100vh-10rem)] overflow-auto pr-1">
          {listBody}
        </div>
      )}
    </SortableContext>
  );
}
