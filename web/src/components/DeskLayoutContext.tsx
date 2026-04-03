"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

type DeskLayoutContextValue = {
  /** True when the viewport uses the compact mobile shell (drawer + bottom tabs). */
  isMobileShell: boolean;
};

const DeskLayoutContext = createContext<DeskLayoutContextValue | null>(null);

export function DeskLayoutProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [mqMobile, setMqMobile] = useState(false);

  useLayoutEffect(() => {
    setMqMobile(window.matchMedia("(max-width: 1023px)").matches);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setMqMobile(mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const isMobileShell = useMemo(() => {
    if (!hydrated) return false;
    return mqMobile;
  }, [hydrated, mqMobile]);

  const value = useMemo(() => ({ isMobileShell }), [isMobileShell]);

  return <DeskLayoutContext.Provider value={value}>{children}</DeskLayoutContext.Provider>;
}

export function useDeskLayout(): DeskLayoutContextValue {
  const ctx = useContext(DeskLayoutContext);
  if (!ctx) {
    throw new Error("useDeskLayout must be used within DeskLayoutProvider");
  }
  return ctx;
}
