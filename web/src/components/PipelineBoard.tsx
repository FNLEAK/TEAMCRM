"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api } from "@/lib/api";
import { STAGE_ORDER, type Stage } from "@/lib/stages";
import type { BoardColumn, Lead } from "@/lib/types";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";

type Props = {
  token: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  boardVersion: number;
};

function emptyItems(): Record<Stage, string[]> {
  return STAGE_ORDER.reduce(
    (acc, s) => {
      acc[s] = [];
      return acc;
    },
    {} as Record<Stage, string[]>,
  );
}

function zeroTotals(): Record<Stage, number> {
  return STAGE_ORDER.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<Stage, number>,
  );
}

export function PipelineBoard({ token, selectedIds, onToggleSelect, boardVersion }: Props) {
  const [items, setItems] = useState<Record<Stage, string[]>>(() => emptyItems());
  const [leadsById, setLeadsById] = useState<Record<string, Lead>>({});
  const [totals, setTotals] = useState<Record<Stage, number>>(() => zeroTotals());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const applyBoard = useCallback((cols: BoardColumn[], replace: boolean) => {
    setTotals(
      STAGE_ORDER.reduce(
        (acc, s) => {
          const col = cols.find((c) => c.stage === s);
          acc[s] = col?.total ?? 0;
          return acc;
        },
        {} as Record<Stage, number>,
      ),
    );

    if (replace) {
      const nextItems = emptyItems();
      const nextLeads: Record<string, Lead> = {};
      for (const col of cols) {
        const stage = col.stage as Stage;
        nextItems[stage] = col.leads.map((l) => l.id);
        for (const l of col.leads) {
          nextLeads[l.id] = l;
        }
      }
      setItems(nextItems);
      setLeadsById(nextLeads);
      return;
    }

    setItems((prevItems) => {
      const next = { ...prevItems };
      for (const col of cols) {
        const stage = col.stage as Stage;
        const seen = new Set(next[stage]);
        const appended: string[] = [];
        for (const l of col.leads) {
          if (!seen.has(l.id)) {
            seen.add(l.id);
            appended.push(l.id);
          }
        }
        next[stage] = [...next[stage], ...appended];
      }
      return next;
    });
    setLeadsById((prev) => {
      const next = { ...prev };
      for (const col of cols) {
        for (const l of col.leads) {
          next[l.id] = l;
        }
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await api<{ stages: BoardColumn[] }>(
          `/leads/board?perStage=200&page=${pageNum}`,
          token,
        );
        applyBoard(res.stages, replace);
        setPage(pageNum);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [applyBoard, token],
  );

  useEffect(() => {
    void load(1, true);
  }, [boardVersion, load]);

  const findContainer = useCallback(
    (id: string): Stage | undefined => {
      if (STAGE_ORDER.includes(id as Stage)) return id as Stage;
      for (const s of STAGE_ORDER) {
        if (items[s].includes(id)) return s;
      }
      return undefined;
    },
    [items],
  );

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const lid = String(e.active.id);
      const lead = leadsById[lid];
      if (lead) setActiveLead(lead);
    },
    [leadsById],
  );

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      setActiveLead(null);
      const { active, over } = e;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const activeContainer = findContainer(activeId);
      let overContainer = findContainer(overId);
      if (!overContainer && STAGE_ORDER.includes(overId as Stage)) {
        overContainer = overId as Stage;
      }
      if (!activeContainer || !overContainer) return;

      if (activeContainer === overContainer) {
        const list = items[activeContainer];
        const oldIndex = list.indexOf(activeId);
        const newIndex = list.indexOf(overId);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          setItems((prev) => ({
            ...prev,
            [activeContainer]: arrayMove(prev[activeContainer], oldIndex, newIndex),
          }));
        }
        return;
      }

      setItems((prev) => {
        const next = { ...prev, [activeContainer]: prev[activeContainer].filter((x) => x !== activeId) };
        const dest = [...next[overContainer]];
        const overIndex = dest.indexOf(overId);
        if (overIndex === -1) dest.push(activeId);
        else dest.splice(overIndex, 0, activeId);
        next[overContainer] = dest;
        return next;
      });

      setLeadsById((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], stage: overContainer },
      }));

      try {
        await api(`/leads/${activeId}`, token, {
          method: "PATCH",
          json: { stage: overContainer },
        });
      } catch (err) {
        console.error(err);
        void load(page, true);
      }
    },
    [findContainer, items, load, page, token],
  );

  const onDragCancel = useCallback(() => setActiveLead(null), []);

  const loadMore = useCallback(() => {
    void load(page + 1, false);
  }, [load, page]);

  const dropAnimation = useMemo(
    () => ({
      sideEffects: defaultDropAnimationSideEffects({
        styles: { active: { opacity: "0.5" } },
      }),
    }),
    [],
  );

  if (loading && Object.keys(leadsById).length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-slate-500">
        Loading pipeline…
      </div>
    );
  }

  const anyColumnHasMore = STAGE_ORDER.some((s) => (totals[s] ?? 0) > items[s].length);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex flex-col flex-1">
        {anyColumnHasMore && (
          <div className="flex shrink-0 justify-end px-4 pb-2 sm:px-6">
            <button
              type="button"
              onClick={() => loadMore()}
              disabled={loadingMore}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more (next page per column)"}
            </button>
          </div>
        )}
        <div className="board-scroll flex flex-1 flex-col gap-4 overflow-x-hidden px-4 pb-6 pt-1 sm:px-6 md:flex-row md:overflow-x-auto md:overflow-y-hidden">
          {STAGE_ORDER.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leadIds={items[stage]}
              leadsById={leadsById}
              total={totals[stage] ?? 0}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={dropAnimation}>
        {activeLead ? (
          <div className="w-[280px] opacity-95">
            <LeadCard
              lead={activeLead}
              selected={selectedIds.has(activeLead.id)}
              onToggleSelect={onToggleSelect}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

