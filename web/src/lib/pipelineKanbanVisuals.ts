import { NON_CANONICAL_STAGE_KEY } from "@/lib/leadTypes";

/** Card border / glow per stage — shared by Command Center and roofing pool Kanban. */
export const PIPELINE_STAGE_CARD_STYLE: Record<string, string> = {
  New: "border-emerald-500/35 bg-emerald-500/10 shadow-[0_0_32px_-12px_rgba(52,211,153,0.35)]",
  Called: "border-cyan-500/35 bg-cyan-500/10 shadow-[0_0_32px_-12px_rgba(34,211,238,0.25)]",
  Interested: "border-violet-500/35 bg-violet-500/10 shadow-[0_0_32px_-12px_rgba(167,139,250,0.3)]",
  "Appt Set": "border-amber-500/35 bg-amber-500/10 shadow-[0_0_32px_-12px_rgba(251,191,36,0.25)]",
  "Pending Close": "border-amber-300/50 bg-amber-500/12 shadow-[0_0_34px_-10px_rgba(251,191,36,0.45)]",
  "Not Interested": "border-rose-500/35 bg-rose-500/10 shadow-[0_0_32px_-12px_rgba(251,113,133,0.25)]",
  Quotes: "border-orange-500/35 bg-orange-500/10 shadow-[0_0_32px_-12px_rgba(249,115,22,0.28)]",
  Estimates: "border-lime-500/35 bg-lime-500/10 shadow-[0_0_32px_-12px_rgba(132,204,22,0.28)]",
  Inspections: "border-sky-500/35 bg-sky-500/10 shadow-[0_0_32px_-12px_rgba(14,165,233,0.28)]",
  [NON_CANONICAL_STAGE_KEY]:
    "border-slate-500/40 bg-slate-500/10 shadow-[0_0_24px_-12px_rgba(148,163,184,0.2)]",
};

export type PipelineKanbanColumnShell = {
  shell: string;
  topLine: string;
  heading: string;
  empty: string;
  card: string;
};

export const PIPELINE_KANBAN_COLUMN_STYLE: Record<string, PipelineKanbanColumnShell> = {
  New: {
    shell: "border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(52,211,153,0.8)]",
    topLine: "via-emerald-300/50",
    heading: "text-emerald-100/80",
    empty: "border-emerald-300/20 from-emerald-500/[0.07]",
    card: "hover:border-emerald-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(52,211,153,0.7)]",
  },
  Called: {
    shell: "border-cyan-400/20 bg-gradient-to-b from-cyan-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(34,211,238,0.8)]",
    topLine: "via-cyan-300/50",
    heading: "text-cyan-100/80",
    empty: "border-cyan-300/20 from-cyan-500/[0.07]",
    card: "hover:border-cyan-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(34,211,238,0.7)]",
  },
  Interested: {
    shell: "border-violet-400/20 bg-gradient-to-b from-violet-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(167,139,250,0.8)]",
    topLine: "via-violet-300/50",
    heading: "text-violet-100/80",
    empty: "border-violet-300/20 from-violet-500/[0.07]",
    card: "hover:border-violet-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(167,139,250,0.7)]",
  },
  "Appt Set": {
    shell: "border-amber-400/20 bg-gradient-to-b from-amber-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(251,191,36,0.8)]",
    topLine: "via-amber-300/50",
    heading: "text-amber-100/80",
    empty: "border-amber-300/20 from-amber-500/[0.07]",
    card: "hover:border-amber-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(251,191,36,0.7)]",
  },
  "Pending Close": {
    shell: "border-amber-300/25 bg-gradient-to-b from-amber-500/[0.09] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_30px_-18px_rgba(251,191,36,0.85)]",
    topLine: "via-amber-200/55",
    heading: "text-amber-100/85",
    empty: "border-amber-300/22 from-amber-500/[0.08]",
    card: "hover:border-amber-300/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_-10px_rgba(251,191,36,0.75)]",
  },
  "Not Interested": {
    shell: "border-rose-400/20 bg-gradient-to-b from-rose-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(251,113,133,0.8)]",
    topLine: "via-rose-300/50",
    heading: "text-rose-100/80",
    empty: "border-rose-300/20 from-rose-500/[0.07]",
    card: "hover:border-rose-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(251,113,133,0.7)]",
  },
  Quotes: {
    shell: "border-orange-400/20 bg-gradient-to-b from-orange-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(249,115,22,0.75)]",
    topLine: "via-orange-300/50",
    heading: "text-orange-100/82",
    empty: "border-orange-300/20 from-orange-500/[0.07]",
    card: "hover:border-orange-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(249,115,22,0.65)]",
  },
  Estimates: {
    shell: "border-lime-400/20 bg-gradient-to-b from-lime-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(132,204,22,0.72)]",
    topLine: "via-lime-300/50",
    heading: "text-lime-100/82",
    empty: "border-lime-300/20 from-lime-500/[0.07]",
    card: "hover:border-lime-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(132,204,22,0.62)]",
  },
  Inspections: {
    shell: "border-sky-400/20 bg-gradient-to-b from-sky-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_28px_-18px_rgba(14,165,233,0.75)]",
    topLine: "via-sky-300/50",
    heading: "text-sky-100/82",
    empty: "border-sky-300/20 from-sky-500/[0.07]",
    card: "hover:border-sky-400/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(14,165,233,0.65)]",
  },
  [NON_CANONICAL_STAGE_KEY]: {
    shell: "border-slate-400/20 bg-gradient-to-b from-slate-500/[0.08] via-[#121827]/95 to-[#0f1320]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_24px_-18px_rgba(148,163,184,0.8)]",
    topLine: "via-slate-300/45",
    heading: "text-slate-100/75",
    empty: "border-slate-300/20 from-slate-500/[0.06]",
    card: "hover:border-slate-300/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_16px_-10px_rgba(148,163,184,0.6)]",
  },
};
