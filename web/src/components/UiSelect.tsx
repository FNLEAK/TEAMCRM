"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

export type UiSelectOption = { value: string; label: string; disabled?: boolean };

type UiSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: UiSelectOption[];
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  triggerClassName?: string;
  id?: string;
  "aria-label"?: string;
};

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Styled listbox dropdown (replaces native `<select>`). Uses a fixed-position portal so menus
 * are not clipped inside scrollable modals or panels.
 */
export function UiSelect({
  value,
  onChange,
  options,
  disabled,
  size = "md",
  className,
  triggerClassName,
  id,
  "aria-label": ariaLabel,
}: UiSelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => setMounted(true), []);

  const syncPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPosition();
  }, [open, syncPosition]);

  useLayoutEffect(() => {
    if (!open) return;
    const onScroll = () => syncPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, syncPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
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

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? (options[0]?.label ?? "—");

  const sizeCls = size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm";
  const itemCls = size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm";

  const panel =
    open &&
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={menuRef}
        id={listId}
        role="listbox"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: Math.max(pos.width, 120),
          zIndex: 9999,
        }}
        className="max-h-60 overflow-auto rounded-xl border border-cyan-300/30 bg-gradient-to-b from-[#0d1320] to-[#0b0f17] py-1.5 shadow-[0_18px_42px_-20px_rgba(34,211,238,0.65)] ring-1 ring-cyan-300/15 backdrop-blur-xl"
      >
        {options.map((opt, i) => (
          <li key={`${opt.value}-${i}`} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === opt.value}
              disabled={opt.disabled}
              className={clsx(
                "mx-1 flex w-[calc(100%-0.5rem)] items-center rounded-lg text-left text-slate-100 transition",
                itemCls,
                value === opt.value &&
                  "bg-gradient-to-r from-cyan-500/25 to-violet-500/20 font-semibold text-cyan-50 ring-1 ring-cyan-300/30",
                value !== opt.value && "hover:bg-white/[0.08] hover:text-white",
                opt.disabled && "cursor-not-allowed opacity-50",
              )}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    );

  return (
    <div className={clsx("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={clsx(
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-cyan-300/25 bg-gradient-to-b from-[#0f1522] to-[#0b0f17] text-left text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition hover:border-cyan-300/40 focus-visible:ring-2 focus-visible:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-60",
          sizeCls,
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
        <Chevron className={clsx("h-4 w-4 shrink-0 text-cyan-300/80 transition", open && "rotate-180")} />
      </button>
      {panel}
    </div>
  );
}
