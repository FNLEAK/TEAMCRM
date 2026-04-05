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

  const gap = 8;
  const edgePad = 10;
  const preferRight = popupSide === "right";

  useEffect(() => setMounted(true), []);

  const recomputePosition = useMemo(
    () => () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      /** Narrow popover on phones; a bit wider on tablet/desktop */
      const tw =
        vw < 400 ? vw - edgePad * 2 : vw < 640 ? Math.min(280, vw - edgePad * 2) : Math.min(300, vw - 24);
      const maxPopoverH = vw < 1024 ? Math.min(Math.round(vh * 0.42), 240) : Math.min(Math.round(vh * 0.55), 360);

      /** Reserve space for mobile DeskShell bottom tabs (~3.75rem) + safe area. */
      const mobileBottomReserve = vw < 1024 ? 72 + 20 : 16;

      let left = r.right - tw;
      let top = r.bottom + gap;

      if (preferRight) {
        left = r.right + gap;
        top = r.top;
      }

      if (left + tw > vw - edgePad) {
        left = Math.max(edgePad, r.left - tw - gap);
      }
      if (left < edgePad) left = edgePad;

      const bottomLimit = vh - mobileBottomReserve;
      if (top + maxPopoverH > bottomLimit) {
        top = Math.max(edgePad, r.top - maxPopoverH - gap);
      }
      if (top < edgePad) top = edgePad;

      setStyle({
        position: "fixed",
        top,
        left,
        width: tw,
        maxHeight: maxPopoverH,
        overflowY: "auto",
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={clsx("pointer-events-auto absolute right-[10px] top-[10px] z-20", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Show help"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={clsx(
          "flex h-5 w-5 items-center justify-center rounded-full border bg-black/55 text-[10px] font-bold leading-none transition md:h-[18px] md:w-[18px] md:text-[11px]",
          "hover:brightness-110 active:scale-95",
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
                "origin-top-left rounded-lg border-2 bg-[#08090c]/95 p-2.5 sm:rounded-xl sm:p-3",
                "text-[11px] font-semibold leading-snug text-white transition duration-200 sm:text-sm sm:font-bold sm:leading-relaxed",
                "pointer-events-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
                animClass,
                a.popup,
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
