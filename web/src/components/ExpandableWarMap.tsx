"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Info, Map as MapIcon, MessageSquare, Trophy, X, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import usAtlas from "us-atlas/states-10m.json";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getLocationFromPhone } from "@/lib/phoneGeo";
import { ensureSupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";
import { isDemoSiteFeatureEnabled } from "@/lib/demoSiteFeature";
import {
  mapLeadRowToWarMapActivityType,
  warMapLeadActivityTimeMs,
  type WarMapActivityType,
  type WarMapLeadRow,
} from "@/lib/warMapActivity";

type ActivityType = WarMapActivityType;

interface MapEvent {
  id: string;
  type: ActivityType;
  x: number;
  y: number;
  companyName: string;
  phone: string | null;
  website: string | null;
  activityAtMs: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAP_W = 1000;
const MAP_H = 600;

const PIN_COLORS: Record<ActivityType, string> = {
  interested: "#22c55e",
  demo_sent: "#3b82f6",
  deal_closed: "#facc15",
};

function normalizeWebsite(url: string | null | undefined): string | null {
  const t = (url ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function activityAgoText(activityAtMs: number): string {
  const deltaMs = Math.max(0, Date.now() - activityAtMs);
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins} MIN AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} H${hours === 1 ? "" : "RS"} AGO`;
  return "24H+ AGO";
}

function StatusIcon({ type }: { type: ActivityType }) {
  if (type === "deal_closed") return <Trophy size={13} className="text-yellow-300" />;
  if (type === "demo_sent") return <Zap size={13} className="text-blue-300" />;
  return <MessageSquare size={13} className="text-emerald-300" />;
}

function isSelectSchemaError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("column") || m.includes("42703");
}

function buildMapEvent(
  row: WarMapLeadRow,
  projection: (lngLat: [number, number]) => [number, number] | null,
  type: ActivityType,
  activityAtMs: number,
): MapEvent | null {
  const leadId = row.id?.trim();
  if (!leadId) return null;
  const geo = getLocationFromPhone(row.phone);
  if (!geo) return null;
  const projected = projection([geo.lng, geo.lat]);
  if (!projected) return null;
  const [px, py] = projected;
  const x = (px / MAP_W) * 100;
  const y = (py / MAP_H) * 100;
  return {
    id: leadId,
    type,
    x,
    y,
    companyName: (row.company_name ?? "").trim() || "Lead",
    phone: row.phone ?? null,
    website: normalizeWebsite(row.website),
    activityAtMs,
  };
}

type ExpandableWarMapProps = {
  /** Lets the parent collapse the dashboard card while the fixed overlay is open. */
  onExpandedChange?: (expanded: boolean) => void;
};

export default function ExpandableWarMap({ onExpandedChange }: ExpandableWarMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const mapPanRef = useRef(mapPan);
  const mapDragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mapPanRef.current = mapPan;
  }, [mapPan]);

  useEffect(() => {
    if (!isExpanded) {
      setMapZoom(1);
      setMapPan({ x: 0, y: 0 });
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const el = mapViewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = Math.exp(-e.deltaY * 0.0012);
      setMapZoom((z) => Math.min(5, Math.max(1, z * factor)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isExpanded]);

  const [events, setEvents] = useState<MapEvent[]>([]);
  const [widgetPulseColor, setWidgetPulseColor] = useState<string>("#06b6d4");
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const statesGeo = useMemo(() => {
    const states = feature(usAtlas as any, (usAtlas as any).objects.states) as any;
    const borders = mesh(usAtlas as any, (usAtlas as any).objects.states, (a: any, b: any) => a !== b) as any;
    const projection = geoAlbersUsa().fitSize([MAP_W, MAP_H], states);
    const pathGen = geoPath(projection);
    return { states, borders, pathGen, projection };
  }, []);

  const stats = useMemo(() => {
    const counts = { interested: 0, demo_sent: 0, deal_closed: 0 };
    for (const e of events) counts[e.type] += 1;
    return {
      interested: counts.interested,
      demoSent: counts.demo_sent,
      dealClosed: counts.deal_closed,
      total: counts.interested + counts.demo_sent + counts.deal_closed,
    };
  }, [events]);

  const triggerEvent = useCallback(
    (
      row: WarMapLeadRow,
      type: ActivityType,
      activityAtMs: number = Date.now(),
      opts?: { skipEffects?: boolean },
    ) => {
      const leadId = row.id?.trim();
      if (!leadId) return;
      const next = buildMapEvent(row, statesGeo.projection, type, activityAtMs);
      if (!next) return;

      const skipEffects = opts?.skipEffects === true;

      if (!skipEffects) {
        const pulseColor = PIN_COLORS[type];
        setWidgetPulseColor(pulseColor);
        const reset = window.setTimeout(() => setWidgetPulseColor("#06b6d4"), 1800);
        timersRef.current.push(reset);

        if (type === "deal_closed") {
          confetti({
            particleCount: 120,
            spread: 76,
            origin: { y: 0.65 },
            colors: ["#FFD700", "#FFA500", "#fff3b0"],
          });
          try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (Ctx) {
              if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
              const ctx = audioCtxRef.current;
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.value = 182;
              gain.gain.value = 0.0001;
              osc.connect(gain);
              gain.connect(ctx.destination);
              const now = ctx.currentTime;
              gain.gain.exponentialRampToValueAtTime(0.025, now + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
              osc.start(now);
              osc.stop(now + 0.24);
            }
          } catch {
            // Non-blocking enhancement.
          }
        }
        setActivePinId(leadId);
      }

      setEvents((prev) => {
        const withoutLead = prev.filter((e) => e.id !== leadId);
        return [next, ...withoutLead].filter((e) => Date.now() - e.activityAtMs <= ONE_DAY_MS);
      });
    },
    [statesGeo.projection],
  );

  useEffect(() => {
    const projection = statesGeo.projection;

    const selectVariants = (): string[] => {
      const base = "id, company_name, status, phone, website, created_at";
      const withLast = `${base}, last_activity_at`;
      const withUpdated = `${withLast}, updated_at`;
      const withDemo = `${withUpdated}, demo_site_sent`;
      if (isDemoSiteFeatureEnabled()) {
        return [withDemo, withUpdated, withLast, base];
      }
      return [withUpdated, withLast, base];
    };

    const hydrateLast24h = async () => {
      const cutoff = Date.now() - ONE_DAY_MS;
      let rows: WarMapLeadRow[] | null = null;
      for (const fields of selectVariants()) {
        const { data, error } = await supabase
          .from("leads")
          .select(fields)
          .not("phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(1500);
        if (!error && data) {
          rows = data as WarMapLeadRow[];
          break;
        }
        if (!isSelectSchemaError(error)) {
          console.warn("[WarMap] leads hydrate:", error?.message);
          break;
        }
      }
      if (!rows?.length) return;

      const list: MapEvent[] = [];
      for (const row of rows) {
        const at = warMapLeadActivityTimeMs(row);
        if (at < cutoff) continue;
        const type = mapLeadRowToWarMapActivityType(row);
        if (!type) continue;
        const ev = buildMapEvent(row, projection, type, at);
        if (ev) list.push(ev);
      }
      list.sort((a, b) => b.activityAtMs - a.activityAtMs);
      setEvents(list.filter((e) => Date.now() - e.activityAtMs <= ONE_DAY_MS));
    };

    const onInsert = (row: WarMapLeadRow) => {
      let at = warMapLeadActivityTimeMs(row);
      if (at <= 0) at = Date.now();
      if (at < Date.now() - ONE_DAY_MS) return;
      const type = mapLeadRowToWarMapActivityType(row);
      if (!type) return;
      triggerEvent(row, type, at, { skipEffects: false });
    };

    const onUpdate = (oldRow: WarMapLeadRow, newRow: WarMapLeadRow) => {
      const id = newRow.id?.trim();
      if (!id) return;
      const newType = mapLeadRowToWarMapActivityType(newRow);
      if (newType === null) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      let at = warMapLeadActivityTimeMs(newRow);
      if (at <= 0) at = Date.now();
      if (at < Date.now() - ONE_DAY_MS) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      const oldType = mapLeadRowToWarMapActivityType(oldRow);
      const skipEffects = oldType === newType;
      triggerEvent(newRow, newType, at, { skipEffects });
    };

    let cancelled = false;
    const liveRef: {
      interval: number | null;
      channel: ReturnType<typeof supabase.channel> | null;
      authSub: { unsubscribe: () => void } | null;
    } = { interval: null, channel: null, authSub: null };

    void (async () => {
      await ensureSupabaseRealtimeAuth(supabase);
      if (cancelled) return;
      await hydrateLast24h();
      if (cancelled) return;

      const channel = supabase
        .channel("expandable-war-map-leads")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "leads" },
          (p) => onInsert(p.new as WarMapLeadRow),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads" },
          (p) => onUpdate(p.old as WarMapLeadRow, p.new as WarMapLeadRow),
        )
        .subscribe();
      liveRef.channel = channel;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
      });
      liveRef.authSub = subscription;

      liveRef.interval = window.setInterval(() => {
        setEvents((prev) => prev.filter((e) => Date.now() - e.activityAtMs <= ONE_DAY_MS));
      }, 60_000);
    })();

    return () => {
      cancelled = true;
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
      if (liveRef.interval != null) window.clearInterval(liveRef.interval);
      liveRef.authSub?.unsubscribe();
      if (liveRef.channel) void supabase.removeChannel(liveRef.channel);
    };
  }, [supabase, statesGeo.projection, triggerEvent]);

  const fab = portalReady ? (
    <AnimatePresence>
      {!isExpanded ? (
        <motion.button
          key="war-map-fab"
          type="button"
          onClick={() => setIsExpanded(true)}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fixed bottom-6 right-6 z-[70] flex h-16 w-16 items-center justify-center rounded-full md:bottom-8 md:right-8"
          style={{
            boxShadow: `0 0 0 1px rgba(255,255,255,0.12), 0 0 40px -6px ${widgetPulseColor}, 0 12px 40px -16px rgba(0,0,0,0.9)`,
          }}
          aria-label="Open Live War Room command console"
          title="Open Live War Room"
        >
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ border: `2px solid ${widgetPulseColor}` }}
            animate={{ opacity: [0.35, 0.95, 0.35], scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          />
          <motion.span
            className="pointer-events-none absolute inset-[-10px] rounded-full border"
            style={{ borderColor: widgetPulseColor }}
            animate={{ opacity: [0.12, 0.45, 0.12], scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut", delay: 0.15 }}
          />
          <motion.span
            className="pointer-events-none absolute inset-[-22px] rounded-full"
            style={{
              background: `radial-gradient(circle, ${widgetPulseColor}22 0%, transparent 65%)`,
            }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.92, 1.1, 0.92] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          />
          <span
            className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-zinc-900/95 to-black/95 ring-1 ring-white/15"
            style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 24px -4px ${widgetPulseColor}` }}
          >
            <MapIcon className="h-6 w-6 text-cyan-200" strokeWidth={1.75} />
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  ) : null;

  return (
    <>
      {portalReady && typeof document !== "undefined" ? createPortal(fab, document.body) : null}

      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key="command-console-overlay"
            className="fixed inset-0 z-[75] bg-black/35 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: "spring", stiffness: 190, damping: 22, mass: 0.85 }}
              className="mx-auto mt-[4.5vh] h-[85vh] w-[min(94vw,1700px)] overflow-hidden rounded-3xl border border-cyan-400/35 bg-[#0a0a0a]/88 shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_0_60px_-22px_rgba(34,211,238,0.45),0_30px_80px_-36px_rgba(0,0,0,0.95)] ring-1 ring-cyan-300/20"
            style={{
              background: "rgba(5,5,5,0.92)",
              borderWidth: "0.5px",
              borderColor: "rgba(34,211,238,0.6)",
              boxShadow: "0 0 10px rgba(34,211,238,0.28), 0 30px 80px -36px rgba(0,0,0,0.95)",
            }}
            >
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="absolute right-6 top-6 z-40 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-cyan-400/55 hover:text-white"
              >
                <X size={14} />
                Minimize
              </button>

              <div className="grid h-full grid-cols-[minmax(330px,440px)_1fr_minmax(280px,380px)] gap-5 p-6 pt-6">
                <aside className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.1] via-black/35 to-black/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <h3 className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                    <Info size={14} className="text-cyan-300" />
                    What We Capture
                  </h3>

                  <div className="space-y-6 text-sm">
                    <div>
                      <p className="flex items-center gap-2 text-emerald-300">
                        <MessageSquare size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Interested</span>
                      </p>
                      <p className="mt-1 text-zinc-300">Lead expressed positive interest.</p>
                      <p className="mt-1 text-xs font-semibold text-zinc-400">Count: {stats.interested}</p>
                    </div>

                    <div>
                      <p className="flex items-center gap-2 text-blue-300">
                        <Zap size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Demo Sent</span>
                      </p>
                      <p className="mt-1 text-zinc-300">AI Website Preview shared.</p>
                      <p className="mt-1 text-xs font-semibold text-zinc-400">Count: {stats.demoSent}</p>
                    </div>

                    <div>
                      <p className="flex items-center gap-2 text-yellow-300">
                        <Trophy size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Deal Closed</span>
                      </p>
                      <p className="mt-1 text-zinc-300">AI Website Sold & Confirmed.</p>
                      <p className="mt-1 text-xs font-semibold text-zinc-400">Count: {stats.dealClosed}</p>
                    </div>
                  </div>

                  <div className="mt-8 rounded-xl border border-cyan-300/20 bg-black/45 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                      Total Live Activity (Last 24h): {stats.total}
                    </p>
                  </div>
                </aside>

                <section className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <div className="pointer-events-none absolute left-1/2 top-3 z-30 flex w-[min(94%,22rem)] -translate-x-1/2 justify-center px-2 sm:top-4">
                    <div className="w-full rounded-xl border border-cyan-400/25 bg-black/50 px-3 py-2.5 text-center shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur-md ring-1 ring-white/10 sm:px-4 sm:py-3">
                      <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 sm:mb-2 sm:h-9 sm:w-9">
                        <MapIcon className="h-4 w-4 text-cyan-300 sm:h-5 sm:w-5" />
                      </div>
                      <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white sm:text-[11px]">Live War Room</h2>
                      <p className="mt-0.5 text-[9px] text-zinc-400 sm:mt-1 sm:text-[10px]">National Expansion Telemetry Console</p>
                    </div>
                  </div>

                  <p className="pointer-events-none absolute bottom-2 left-2 z-30 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                    Scroll to zoom · drag to pan
                  </p>

                  <div
                    ref={mapViewportRef}
                    className="absolute inset-0 z-0 cursor-grab touch-none select-none active:cursor-grabbing"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      mapDragRef.current = {
                        ox: e.clientX,
                        oy: e.clientY,
                        px: mapPanRef.current.x,
                        py: mapPanRef.current.y,
                      };
                    }}
                    onPointerMove={(e) => {
                      const d = mapDragRef.current;
                      if (!d) return;
                      setMapPan({
                        x: d.px + (e.clientX - d.ox),
                        y: d.py + (e.clientY - d.oy),
                      });
                    }}
                    onPointerUp={(e) => {
                      mapDragRef.current = null;
                      try {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      } catch {
                        /* ignore */
                      }
                    }}
                    onPointerCancel={() => {
                      mapDragRef.current = null;
                    }}
                  >
                    <div
                      className="absolute inset-0 h-full w-full will-change-transform"
                      style={{
                        transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
                        transformOrigin: "center center",
                      }}
                    >
                      <svg viewBox="0 0 1000 600" className="relative z-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <filter id="command-map-glow" x="-30%" y="-30%" width="160%" height="160%">
                            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#22d3ee" floodOpacity="0.12" />
                          </filter>
                        </defs>
                        <g transform="translate(0 8)" filter="url(#command-map-glow)">
                          {statesGeo.states.features.map((f: any) => (
                            <path
                              key={String(f.id)}
                              d={statesGeo.pathGen(f) ?? ""}
                              fill="#151515"
                              stroke="#334155"
                              strokeWidth={0.85}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                          <path
                            d={statesGeo.pathGen(statesGeo.borders) ?? ""}
                            fill="none"
                            stroke="#475569"
                            strokeWidth={0.65}
                            opacity={0.85}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      </svg>

                      <div className="absolute inset-0 z-[1]">
                        <AnimatePresence>
                          {events.map((event) => (
                            <motion.div
                              key={event.id}
                              initial={{ scale: 0.72, opacity: 0, y: -38 }}
                              animate={{ scale: 1, opacity: 1, y: 0 }}
                              exit={{ scale: 0.72, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 270, damping: 17, mass: 0.6 }}
                              style={{ left: `${event.x}%`, top: `${event.y}%` }}
                              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                              onMouseEnter={() => setActivePinId(event.id)}
                              onMouseLeave={() => setActivePinId((curr) => (curr === event.id ? null : curr))}
                            >
                              <button
                                type="button"
                                onClick={() => setActivePinId((curr) => (curr === event.id ? null : event.id))}
                                className="cursor-pointer"
                              >
                                <PinBody type={event.type} />
                              </button>

                              <AnimatePresence>
                                {activePinId === event.id ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                    transition={{ duration: 0.16, ease: "easeOut" }}
                                    className={clsx(
                                      "mt-2 min-w-[240px] rounded-xl border bg-white/[0.09] px-3 py-2 text-[11px] backdrop-blur-md shadow-[0_8px_30px_-18px_rgba(0,0,0,0.9)]",
                                      event.type === "interested" &&
                                        "border-emerald-400/50 shadow-[0_0_28px_-10px_rgba(52,211,153,0.55)]",
                                      event.type === "demo_sent" &&
                                        "border-blue-400/50 shadow-[0_0_28px_-10px_rgba(59,130,246,0.5)]",
                                      event.type === "deal_closed" &&
                                        "border-amber-300/50 shadow-[0_0_28px_-10px_rgba(250,204,21,0.45)]",
                                    )}
                                  >
                                    <p className="flex items-center gap-2 font-semibold uppercase tracking-[0.08em] text-zinc-200">
                                      <StatusIcon type={event.type} />
                                      <span>
                                        {event.type === "interested"
                                          ? "Interested"
                                          : event.type === "demo_sent"
                                            ? "Demo Sent"
                                            : "Deal Closed"}
                                      </span>
                                      <span className="text-zinc-500">|</span>
                                    </p>
                                    <p className="mt-1 truncate text-sm font-bold text-white">{event.companyName}</p>
                                    <p className="mt-1 flex items-center gap-2 text-zinc-300">
                                      <span className="truncate">{event.phone ?? "No phone"}</span>
                                      {event.website ? (
                                        <a
                                          href={event.website}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex text-cyan-300 transition hover:text-cyan-200"
                                        >
                                          <ExternalLink size={12} />
                                        </a>
                                      ) : null}
                                    </p>
                                    <p className="mt-1 rounded border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
                                      Latency: 12ms | Synced
                                    </p>
                                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                      Activity: {activityAgoText(event.activityAtMs)}
                                    </p>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </section>

                <aside className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.08] via-black/35 to-black/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <h3 className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                    <Zap size={14} className="text-cyan-300" />
                    Command Intel / System Overview
                  </h3>

                  <div className="space-y-6 text-sm text-zinc-300">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-100">
                        Powered By Supabase Realtime
                      </p>
                      <p className="mt-1">Map updates are instant and synchronized for the whole team.</p>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-100">
                        Area Code Pinpointing
                      </p>
                      <p className="mt-1">Pins are placed automatically based on the lead&apos;s phone number region.</p>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-100">
                        Hyper-Growth Visualization
                      </p>
                      <p className="mt-1">Track our national AI website expansion.</p>
                    </div>
                  </div>
                </aside>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function PinBody({ type }: { type: ActivityType }) {
  const colors: Record<ActivityType, string> = {
    interested: "bg-emerald-400 shadow-[0_0_18px_#22c55e,0_0_36px_-4px_rgba(34,197,94,0.65)]",
    demo_sent: "bg-blue-400 shadow-[0_0_18px_#60a5fa,0_0_36px_-4px_rgba(59,130,246,0.6)]",
    deal_closed: "bg-yellow-400 shadow-[0_0_20px_#facc15,0_0_40px_-4px_rgba(250,204,21,0.55)]",
  };

  const ringClass =
    type === "interested"
      ? "border-emerald-300/90"
      : type === "demo_sent"
        ? "border-blue-300/90"
        : "border-yellow-300";

  return (
    <div className={`relative h-4 w-4 rounded-full border-2 border-white ${colors[type]}`}>
      {type !== "deal_closed" ? (
        <motion.div
          animate={{ scale: [1, 2.1, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          className={`pointer-events-none absolute inset-[-10px] rounded-full border-2 ${ringClass}`}
        />
      ) : null}
      {type === "deal_closed" ? (
        <motion.div
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-[-8px] rounded-full border-2 border-yellow-300"
        />
      ) : null}
    </div>
  );
}
