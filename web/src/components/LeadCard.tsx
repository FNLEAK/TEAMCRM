"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import clsx from "clsx";
import type { Lead } from "@/lib/types";
import { displayLeadPhone } from "@/lib/phone";

type Props = {
  lead: Lead;
  selected: boolean;
  onToggleSelect: (id: string) => void;
};

function formatMoney(v: string) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function LeadCard({ lead, selected, onToggleSelect }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: "lead", lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const preview =
    lead.notes && lead.notes.length > 0
      ? lead.notes.length > 100
        ? `${lead.notes.slice(0, 100)}…`
        : lead.notes
      : null;
  const phoneLabel = displayLeadPhone(lead.phone);

  return (
    <div ref={setNodeRef} style={style} className={clsx(isDragging && "z-50 opacity-90")}>
      <div
        className={clsx(
          "group relative rounded-xl border border-white/[0.08] bg-[var(--color-surface)] p-3 shadow-card backdrop-blur-xl transition",
          selected ? "border-cyan-400/70 ring-2 ring-cyan-400/25" : "hover:border-white/15",
        )}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(lead.id);
            }}
            className={clsx(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
              selected ? "border-cyan-400 bg-cyan-500 text-[#050508]" : "border-white/20 bg-black/30 text-transparent",
            )}
            aria-label={selected ? "Deselect lead" : "Select lead"}
          >
            ✓
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/leads/${lead.id}`}
                className="text-sm font-semibold text-slate-100 hover:text-cyan-300"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {lead.title}
              </Link>
              <button
                type="button"
                className="cursor-grab touch-none rounded p-1 text-slate-500 hover:bg-white/10 active:cursor-grabbing"
                {...attributes}
                {...listeners}
                aria-label="Drag to move stage"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7 4h2v2H7V4zm6 0h2v2h-2V4zM7 9h2v2H7V9zm6 0h2v2h-2V9zM7 14h2v2H7v-2zm6 0h2v2h-2v-2z" />
                </svg>
              </button>
            </div>
            {lead.contactName && (
              <p className="mt-1 truncate text-xs text-slate-400">{lead.contactName}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              {phoneLabel ? <span>{phoneLabel}</span> : null}
              <span className="font-medium text-slate-300">{formatMoney(lead.dealValue)}</span>
            </div>
            {preview && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{preview}</p>}
            {lead.assignee && (
              <p className="mt-2 text-[11px] text-slate-500">
                Owner: {lead.assignee.name ?? lead.assignee.email}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
