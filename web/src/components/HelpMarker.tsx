"use client";

import clsx from "clsx";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Accent = "crimson" | "cyan" | "emerald";
type ExtendedAccent = Accent | "neonGreenCrimson" | "neonGreen";

const ACCENT_STYLES: Record<ExtendedAccent, { chip: string; popup: string }> = {
  crimson: {
    chip: "border-rose-400/45 text-rose-200 shadow-[0_0_10px_rgba(251,113,133,0.35)]",
    popup: "border-rose-400/50 shadow-[0_0_28px_-8px_rgba(251,113,133,0.6)]",
  },
  cyan: {
    chip: "border-cyan-400/45 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.35)]",
    popup: "border-cyan-400/50 shadow-[0_0_28px_-8px_rgba(34,211,238,0.6)]",
  },
  emerald: {
    chip: "border-emerald-400/45 text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.35)]",
    popup: "border-emerald-400/50 shadow-[0_0_28px_-8px_rgba(52,211,153,0.6)]",
  },
  neonGreenCrimson: {
    chip: "border-emerald-300/70 text-emerald-200 shadow-[0_0_12px_rgba(74,222,128,0.75)]",
    popup: "border-red-500/80 shadow-[0_0_30px_-8px_rgba(239,68,68,0.7)]",
  },
  neonGreen: {
    chip: "border-emerald-300/75 text-emerald-200 shadow-[0_0_12px_rgba(74,222,128,0.8)]",
    popup: "border-emerald-400/80 shadow-[0_0_30px_-8px_rgba(74,222,128,0.75)]",
  },
};

export function HelpMarker({
  text,
  accent = "cyan",
  className,
  popupSide = "default",
}: {
  text: string;
  accent?: ExtendedAccent;
  className?: string;
  popupSide?: "default" | "right";
}) {
  const a = ACCENT_STYLES[accent];
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 9999,
  });
  const [animClass, setAnimClass] = useState("opacity-0 scale-95");

  const tooltipWidth = 320;
  const gap = 10;
  const edgePad = 8;
  const preferRight = popupSide === "right";

  useEffect(() => setMounted(true), []);

  const recomputePosition = useMemo(
    () => () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      /** Reserve space for mobile DeskShell bottom tabs (~3.75rem) + safe area so tooltip doesn’t sit under the bar. */
      const mobileBottomReserve = vw < 1024 ? 72 + 20 : 16;

      // Default placement: below-right of icon (existing behavior).
      let left = r.right - tooltipWidth;
      let top = r.bottom + gap;

      if (preferRight) {
        left = r.right + gap;
        top = r.top;
      }

      // Collision detection / flip when near right edge.
      if (left + tooltipWidth > vw - edgePad) {
        left = Math.max(edgePad, r.left - tooltipWidth - gap);
      }
      // Clamp for left edge.
      if (left < edgePad) left = edgePad;
      // Keep within viewport vertically (above mobile bottom tab bar).
      const bottomLimit = vh - mobileBottomReserve;
      if (top > bottomLimit - 80) top = Math.max(edgePad, bottomLimit - 80);
      if (top < edgePad) top = edgePad;

      setStyle({
        position: "fixed",
        top,
        left,
        width: tooltipWidth,
        zIndex: 9999,
      });
    },
    [preferRight],
  );

  useEffect(() => {
    if (!open) return;
    recomputePosition();
    const onMove = () => recomputePosition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, recomputePosition]);

  useEffect(() => {
    if (!open) {
      setAnimClass("opacity-0 scale-95");
      return;
    }
    const t = window.setTimeout(() => setAnimClass("opacity-100 scale-100"), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <div className={clsx("pointer-events-auto absolute right-[10px] top-[10px] z-20", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Show help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-full border bg-black/50 text-xs font-bold transition sm:h-5 sm:w-5 sm:text-[11px]",
          "hover:brightness-110 active:brightness-110",
          a.chip,
        )}
      >
        ?
      </button>
      {mounted && open
        ? createPortal(
            <div
              style={style}
              className={clsx(
                "pointer-events-none origin-top-left rounded-xl border-2 bg-[#08090c]/95 p-3.5",
                "text-sm font-bold leading-relaxed text-white transition duration-200",
                animClass,
                a.popup,
              )}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
