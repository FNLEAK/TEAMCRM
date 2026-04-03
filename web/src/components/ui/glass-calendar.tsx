"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";

// --- datetime-local <-> Date (local) ---

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function dateToDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalValue(s: string): Date | null {
  if (!s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function to24h(hour12: number, ap: "AM" | "PM"): number {
  if (ap === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function from24h(h24: number): { h12: number; ap: "AM" | "PM" } {
  const ap: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const mod = h24 % 12;
  const h12 = mod === 0 ? 12 : mod;
  return { h12, ap };
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const scrollbarHide = (
  <style>{`
    .gc-scrollbar-hide::-webkit-scrollbar { display: none; }
    .gc-scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
);

function TimeScrollColumn({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", className)}>
      <span className="mb-1.5 text-center text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="gc-scrollbar-hide max-h-[148px] overflow-y-auto rounded-lg border border-white/10 bg-black/30">
        {children}
      </div>
    </div>
  );
}

export interface GlassAppointmentDatetimePickerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Same format as `<input type="datetime-local" />` — `YYYY-MM-DDTHH:mm` in local time. */
  value: string;
  onChange: (local: string) => void;
  disabled?: boolean;
  /** Called when user clears the appointment */
  onClear?: () => void;
  /** For `label htmlFor` / a11y */
  triggerId?: string;
}

/**
 * Glass-style date + time picker for scheduling client appointments.
 * Intended for use in the lead drawer only; pairs with debounced `appt_date` persistence.
 */
export function GlassAppointmentDatetimePicker({
  className,
  value,
  onChange,
  disabled,
  onClear,
  triggerId,
  ...props
}: GlassAppointmentDatetimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const parsed = React.useMemo(() => parseDatetimeLocalValue(value), [value]);
  const [viewMonth, setViewMonth] = React.useState(() => parsed ?? new Date());
  const [draft, setDraft] = React.useState<Date>(() => parsed ?? new Date());

  React.useEffect(() => setMounted(true), []);

  React.useLayoutEffect(() => {
    if (open && parsed) {
      setDraft(new Date(parsed.getTime()));
      setViewMonth(startOfMonth(parsed));
    } else if (open && !parsed) {
      const n = new Date();
      setDraft(n);
      setViewMonth(startOfMonth(n));
    }
  }, [open, parsed]);

  React.useLayoutEffect(() => {
    if (!parsed) return;
    setDraft(new Date(parsed.getTime()));
  }, [value, parsed]);

  const syncPosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(520, Math.max(320, window.innerWidth - 16));
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 6, left, width: w });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    syncPosition();
  }, [open, syncPosition]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const onScroll = () => syncPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, syncPosition]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const gridDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const { h12, ap } = from24h(draft.getHours());
  const minute = draft.getMinutes();

  const commitDraft = React.useCallback(
    (d: Date) => {
      setDraft(d);
      onChange(dateToDatetimeLocalValue(d));
    },
    [onChange],
  );

  const displayStr = parsed
    ? format(parsed, "MM/dd/yyyy hh:mm aa")
    : "Select date & time";

  const handlePickDay = (day: Date) => {
    const next = setMinutes(setHours(day, to24h(h12, ap)), minute);
    commitDraft(next);
  };

  const handleToday = () => {
    const n = new Date();
    const next = setMinutes(setHours(n, to24h(h12, ap)), minute);
    setViewMonth(startOfMonth(next));
    commitDraft(next);
  };

  const handleClear = () => {
    onChange("");
    onClear?.();
    setOpen(false);
  };

  const panel =
    open &&
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: 10000,
        }}
        className={cn(
          "overflow-hidden rounded-2xl border border-white/12 bg-[#0c0e12]/95 p-4 shadow-2xl shadow-black/60 ring-1 ring-white/[0.06] backdrop-blur-xl",
        )}
        role="dialog"
        aria-label="Choose appointment date and time"
      >
        {scrollbarHide}
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          {/* Calendar */}
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p key={format(viewMonth, "yyyy-MM")} className="text-sm font-semibold text-white">
                {format(viewMonth, "MMMM yyyy")}
              </p>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase text-zinc-500">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const sel = isSameDay(day, draft);
                const today = isToday(day);
                return (
                  <button
                    key={format(day, "yyyy-MM-dd")}
                    type="button"
                    onClick={() => handlePickDay(day)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium transition",
                      !inMonth && "text-zinc-600",
                      inMonth && !sel && "text-zinc-200 hover:bg-white/10",
                      sel && "border border-white bg-white/[0.12] text-white shadow-inner",
                      today && !sel && "ring-1 ring-cyan-500/35",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-cyan-400/90 hover:text-cyan-300"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="text-xs font-medium text-cyan-400/90 hover:text-cyan-300"
              >
                Today
              </button>
            </div>
          </div>

          {/* Time columns */}
          <div className="flex w-full shrink-0 gap-2 border-t border-white/10 pt-3 sm:w-[200px] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <TimeScrollColumn label="Hour">
              {HOURS_12.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    const next = setMinutes(setHours(draft, to24h(h, ap)), minute);
                    commitDraft(next);
                  }}
                  className={cn(
                    "block w-full py-1.5 text-center text-sm transition hover:bg-white/10",
                    h === h12 ? "bg-white/[0.14] font-semibold text-white ring-1 ring-white/25" : "text-zinc-300",
                  )}
                >
                  {h}
                </button>
              ))}
            </TimeScrollColumn>
            <TimeScrollColumn label="Min">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const next = setMinutes(setHours(draft, to24h(h12, ap)), m);
                    commitDraft(next);
                  }}
                  className={cn(
                    "block w-full py-1.5 text-center text-sm tabular-nums transition hover:bg-white/10",
                    m === minute ? "bg-white/[0.14] font-semibold text-white ring-1 ring-white/25" : "text-zinc-300",
                  )}
                >
                  {pad(m)}
                </button>
              ))}
            </TimeScrollColumn>
            <TimeScrollColumn label="">
              {(["AM", "PM"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    const next = setMinutes(setHours(draft, to24h(h12, p)), minute);
                    commitDraft(next);
                  }}
                  className={cn(
                    "block w-full py-2 text-center text-sm font-medium transition hover:bg-white/10",
                    p === ap ? "bg-white/[0.14] text-white ring-1 ring-white/25" : "text-zinc-300",
                  )}
                >
                  {p}
                </button>
              ))}
            </TimeScrollColumn>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={cn("relative w-full", className)} {...props}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-emerald-950/50 bg-[#0c0c0e] px-3 text-left text-sm text-zinc-100 transition",
          "focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !parsed && "text-zinc-500",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="min-w-0 truncate">{displayStr}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-emerald-500/80" aria-hidden />
      </button>
      {panel}
    </div>
  );
}

