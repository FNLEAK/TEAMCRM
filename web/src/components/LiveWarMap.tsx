"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Map as MapIcon, MessageSquare, Trophy, X, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import usAtlas from "us-atlas/states-10m.json";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getLocationFromPhone } from "@/lib/phoneGeo";

type ActivityType = "interested" | "demo_sent" | "deal_closed";

interface MapEvent {
  id: string; // lead id
  type: ActivityType;
  x: number;
  y: number;
  label: string;
  createdAtMs: number;
}

type LeadRealtimeRow = {
  id?: string | null;
  company_name?: string | null;
  status?: string | null;
  phone?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const PIN_COLORS: Record<ActivityType, string> = {
  interested: "#22c55e",
  demo_sent: "#3b82f6",
  deal_closed: "#facc15",
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAP_W = 1000;
const MAP_H = 600;
/** Must match `<g transform="translate(0, …)">` around state paths in this component. */
const MAP_STATE_LAYER_OFFSET_Y = 10;

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function mapStatusToEventType(status: string): ActivityType | null {
  if (status.includes("interested")) return "interested";
  if (status.includes("demo sent")) return "demo_sent";
  if (status.includes("deal closed")) return "deal_closed";
  return null;
}

function normalizeLabel(company: string | null | undefined, phone: string | null | undefined): string {
  const name = (company ?? "").trim() || "Lead";
  const ph = (phone ?? "").trim();
  return ph ? `${name} (${ph})` : name;
}

export default function LiveWarMap() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [widgetPulseColor, setWidgetPulseColor] = useState<string>("#06b6d4");
  const timersRef = useRef<number[]>([]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const statesGeo = useMemo(() => {
    const states = feature(usAtlas as any, (usAtlas as any).objects.states) as any;
    const borders = mesh(usAtlas as any, (usAtlas as any).objects.states, (a: any, b: any) => a !== b) as any;
    const projection = geoAlbersUsa().fitSize([MAP_W, MAP_H], states);
    const pathGen = geoPath(projection);
    return { states, borders, pathGen, projection };
  }, []);

  const triggerEvent = useCallback(
    (
      leadId: string,
      type: ActivityType,
      label: string,
      phone: string | null | undefined,
      createdAtMs: number = Date.now(),
    ) => {
      const geo = getLocationFromPhone(phone);
      if (!geo) return;
      const point = statesGeo.projection([geo.lng, geo.lat]);
      if (!point) return;
      const [px, py] = point;
      const x = (px / MAP_W) * 100;
      const y = ((py + MAP_STATE_LAYER_OFFSET_Y) / MAP_H) * 100;

      const nextEvent: MapEvent = { id: leadId, type, x, y, label, createdAtMs };

      const pulse = PIN_COLORS[type];
      setWidgetPulseColor(pulse);
      const resetPulse = window.setTimeout(() => setWidgetPulseColor("#06b6d4"), 1800);
      timersRef.current.push(resetPulse);

      if (type === "deal_closed") {
        confetti({
          particleCount: 100,
          spread: 72,
          origin: { y: 0.65 },
          colors: ["#FFD700", "#FFA500"],
        });
      }

      setEvents((prev) => {
        const withoutLead = prev.filter((e) => e.id !== leadId);
        return [nextEvent, ...withoutLead].filter((e) => Date.now() - e.createdAtMs <= ONE_DAY_MS);
      });
    },
    [statesGeo.projection],
  );

  useEffect(() => {
    const loadRecentActivePins = async () => {
      const sinceIso = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const fields = "id, company_name, status, phone, updated_at, created_at";

      let rows: LeadRealtimeRow[] = [];
      const first = await supabase
        .from("leads")
        .select(fields)
        .gte("updated_at", sinceIso)
        .not("phone", "is", null)
        .limit(750);

      if (!first.error && first.data) {
        rows = first.data as LeadRealtimeRow[];
      } else {
        const fallback = await supabase
          .from("leads")
          .select(fields)
          .gte("created_at", sinceIso)
          .not("phone", "is", null)
          .limit(750);
        if (!fallback.error && fallback.data) rows = fallback.data as LeadRealtimeRow[];
      }

      for (const row of rows) {
        const leadId = row.id?.trim();
        if (!leadId) continue;
        const type = mapStatusToEventType(normalizeStatus(row.status));
        if (!type) continue;
        const createdAtMs = Date.parse(row.updated_at ?? row.created_at ?? "") || Date.now();
        triggerEvent(leadId, type, normalizeLabel(row.company_name, row.phone), row.phone, createdAtMs);
      }
    };

    const handleInsertedLead = (row: LeadRealtimeRow) => {
      const leadId = row.id?.trim();
      if (!leadId) return;
      const type = mapStatusToEventType(normalizeStatus(row.status));
      if (!type) return;
      const createdAtMs = Date.parse(row.created_at ?? row.updated_at ?? "") || Date.now();
      triggerEvent(leadId, type, normalizeLabel(row.company_name, row.phone), row.phone, createdAtMs);
    };

    const handleUpdatedLead = (oldRow: LeadRealtimeRow, newRow: LeadRealtimeRow) => {
      const leadId = newRow.id?.trim();
      if (!leadId) return;
      const oldStatus = normalizeStatus(oldRow.status);
      const newStatus = normalizeStatus(newRow.status);
      if (!newStatus || newStatus === oldStatus) return;
      const type = mapStatusToEventType(newStatus);
      if (!type) return;
      const prefix = type === "interested" ? "Interested" : type === "demo_sent" ? "Demo Sent" : "Deal Closed";
      const createdAtMs = Date.parse(newRow.updated_at ?? newRow.created_at ?? "") || Date.now();
      triggerEvent(leadId, type, `${prefix}: ${normalizeLabel(newRow.company_name, newRow.phone)}`, newRow.phone, createdAtMs);
    };

    void loadRecentActivePins();

    const channel = supabase
      .channel("live-war-map-leads")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => handleInsertedLead(payload.new as LeadRealtimeRow),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => handleUpdatedLead(payload.old as LeadRealtimeRow, payload.new as LeadRealtimeRow),
      )
      .subscribe();

    const pruneInterval = window.setInterval(() => {
      setEvents((prev) => prev.filter((e) => Date.now() - e.createdAtMs <= ONE_DAY_MS));
    }, 60_000);

    return () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
      window.clearInterval(pruneInterval);
      void supabase.removeChannel(channel);
    };
  }, [supabase, triggerEvent]);

  return (
    <>
      <AnimatePresence>
        {!isExpanded ? (
          <motion.button
            key="war-map-mini"
            type="button"
            onClick={() => setIsExpanded(true)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full border-2 bg-[#0a0a0a] shadow-[0_0_24px_-8px_rgba(6,182,212,0.7)]"
            style={{ borderColor: widgetPulseColor, boxShadow: `0 0 24px -8px ${widgetPulseColor}` }}
            aria-label="Open Live War Room map"
            title="Open Live War Room"
          >
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${widgetPulseColor}` }}
              animate={{ scale: [1, 1.18, 1], opacity: [0.8, 0.15, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            />
            <MapIcon className="relative z-10 h-6 w-6 text-cyan-300" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key="war-map-expanded"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-3 z-[75] overflow-hidden rounded-3xl border border-slate-800 bg-[#050505] font-sans shadow-2xl @md:inset-6"
          >
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="absolute right-5 top-5 z-20 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white"
            >
              <X size={14} />
              Minimize
            </button>

            <div className="absolute left-6 top-6 z-10 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-md">
              <div className="rounded-lg bg-cyan-500/20 p-2">
                <MapIcon className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-white">Live War Room</h2>
                <p className="text-[10px] text-slate-400">Realtime Territory Acquisition</p>
              </div>
            </div>

            <div className="absolute bottom-6 right-6 z-10 w-64 rounded-2xl border border-cyan-500/30 bg-[#0a0a0a]/90 p-5 shadow-[0_0_20px_rgba(6,182,212,0.15)] backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2">
                <Info className="h-4 w-4 text-cyan-400" />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-100">What We Capture</h3>
              </div>

              <div className="space-y-4">
                <LegendItem color="bg-emerald-400" label="Interested" icon={<MessageSquare size={12} />} pulse />
                <LegendItem color="bg-blue-400" label="Demo Sent" icon={<Zap size={12} />} />
                <LegendItem color="bg-yellow-400" label="Deal Closed" icon={<Trophy size={12} />} glow />
              </div>
            </div>

            <svg viewBox="0 0 1000 600" className="h-full w-full">
              <defs>
                <filter id="map-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#22d3ee" floodOpacity="0.12" />
                </filter>
              </defs>
              <g transform="translate(0 10)" filter="url(#map-glow)">
                {statesGeo.states.features.map((f: any) => (
                  <path
                    key={String(f.id)}
                    d={statesGeo.pathGen(f) ?? ""}
                    fill="#1a1a1a"
                    stroke="#334155"
                    strokeWidth={0.9}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path
                  d={statesGeo.pathGen(statesGeo.borders) ?? ""}
                  fill="none"
                  stroke="#475569"
                  strokeWidth={0.7}
                  opacity={0.8}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            </svg>

            <AnimatePresence>
              {events.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ scale: 0, opacity: 0, y: -20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0, opacity: 0 }}
                  style={{ left: `${event.x}%`, top: `${event.y}%` }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <PinBody type={event.type} />
                  <div className="mt-2 whitespace-nowrap rounded border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-bold uppercase tracking-tighter text-white">
                    {event.label}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function LegendItem({
  color,
  label,
  icon,
  pulse,
  glow,
}: {
  color: string;
  label: string;
  icon: React.ReactNode;
  pulse?: boolean;
  glow?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className={`h-2.5 w-2.5 rounded-full ${color} ${glow ? "shadow-[0_0_10px_#facc15]" : ""}`} />
        {pulse ? <div className={`absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full ${color} opacity-75`} /> : null}
      </div>
      <span className="flex items-center gap-2 text-[11px] font-medium tracking-tight text-slate-300">
        {icon}
        {label}
      </span>
    </div>
  );
}

function PinBody({ type }: { type: ActivityType }) {
  const colors: Record<ActivityType, string> = {
    interested: "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.95)]",
    demo_sent: "bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.9)]",
    deal_closed: "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.95)]",
  };

  const ringClass =
    type === "interested"
      ? "border-emerald-400/70"
      : type === "demo_sent"
        ? "border-blue-400/70"
        : "border-yellow-300/90";

  return (
    <div className={`relative h-2.5 w-2.5 rounded-full border border-white/95 ${colors[type]}`}>
      {type !== "deal_closed" ? (
        <motion.div
          animate={{ scale: [1, 1.55, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className={`pointer-events-none absolute inset-[-3px] rounded-full border ${ringClass}`}
        />
      ) : null}
      {type === "deal_closed" ? (
        <motion.div
          animate={{ scale: [1, 1.35, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ repeat: Infinity, duration: 2.2 }}
          className="pointer-events-none absolute inset-[-4px] rounded-full border border-yellow-300/80"
        />
      ) : null}
    </div>
  );
}
