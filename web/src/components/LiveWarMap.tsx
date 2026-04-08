"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Map as MapIcon, MessageSquare, Trophy, Trash2, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

type ActivityType = "demo_sent" | "deal_requested" | "activity" | "lead_deleted";

interface MapEvent {
  id: string;
  type: ActivityType;
  x: number;
  y: number;
  label: string;
}

type LeadRealtimeRow = {
  id?: string | null;
  company_name?: string | null;
  status?: string | null;
  state?: string | null;
  State?: string | null;
};

const STATE_COORDS: Record<string, { x: number; y: number }> = {
  AL: { x: 72, y: 67 },
  AK: { x: 14, y: 86 },
  AZ: { x: 30, y: 66 },
  AR: { x: 58, y: 62 },
  CA: { x: 20, y: 58 },
  CO: { x: 40, y: 54 },
  CT: { x: 85, y: 41 },
  DE: { x: 84, y: 48 },
  FL: { x: 78, y: 78 },
  GA: { x: 74, y: 67 },
  HI: { x: 24, y: 90 },
  ID: { x: 27, y: 38 },
  IL: { x: 59, y: 47 },
  IN: { x: 63, y: 48 },
  IA: { x: 52, y: 44 },
  KS: { x: 49, y: 56 },
  KY: { x: 66, y: 56 },
  LA: { x: 60, y: 72 },
  ME: { x: 90, y: 30 },
  MD: { x: 82, y: 49 },
  MA: { x: 87, y: 38 },
  MI: { x: 62, y: 38 },
  MN: { x: 51, y: 34 },
  MS: { x: 65, y: 68 },
  MO: { x: 57, y: 54 },
  MT: { x: 33, y: 31 },
  NE: { x: 47, y: 49 },
  NV: { x: 24, y: 52 },
  NH: { x: 88, y: 34 },
  NJ: { x: 85, y: 45 },
  NM: { x: 37, y: 63 },
  NY: { x: 83, y: 39 },
  NC: { x: 77, y: 58 },
  ND: { x: 44, y: 29 },
  OH: { x: 67, y: 46 },
  OK: { x: 50, y: 61 },
  OR: { x: 20, y: 40 },
  PA: { x: 79, y: 44 },
  RI: { x: 88, y: 40 },
  SC: { x: 76, y: 63 },
  SD: { x: 45, y: 39 },
  TN: { x: 68, y: 60 },
  TX: { x: 50, y: 74 },
  UT: { x: 31, y: 54 },
  VT: { x: 86, y: 35 },
  VA: { x: 80, y: 54 },
  WA: { x: 21, y: 32 },
  WV: { x: 73, y: 52 },
  WI: { x: 56, y: 39 },
  WY: { x: 37, y: 43 },
  DC: { x: 82, y: 50 },
};

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function stateToMapCoords(stateValue: string | null | undefined): { x: number; y: number } {
  const raw = (stateValue ?? "").trim();
  if (!raw) return { x: 50, y: 56 };
  const upper = raw.toUpperCase();
  const abbr = STATE_COORDS[upper] ? upper : STATE_NAME_TO_ABBR[raw.toLowerCase()];
  return (abbr && STATE_COORDS[abbr]) || { x: 50, y: 56 };
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function normalizeLabel(company: string | null | undefined, state: string | null | undefined): string {
  const name = (company ?? "").trim() || "New Lead";
  const st = (state ?? "").trim();
  if (!st) return name;
  return `${name} (${st.toUpperCase()})`;
}

export default function LiveWarMap() {
  const [events, setEvents] = useState<MapEvent[]>([]);
  const timersRef = useRef<number[]>([]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const triggerEvent = useCallback((type: ActivityType, label: string, stateValue?: string | null) => {
    const { x, y } = stateToMapCoords(stateValue);
    const id = `${Date.now()}-${Math.random()}`;
    const newEvent: MapEvent = { id, type, x, y, label };

    if (type === "deal_requested") {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: ["#FFD700", "#FFA500"] });
    }

    setEvents((prev) => [...prev, newEvent]);

    const t = window.setTimeout(() => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }, 15000);
    timersRef.current.push(t);
  }, []);

  useEffect(() => {
    const handleInsertedLead = (row: LeadRealtimeRow) => {
      const stateVal = row.state ?? row.State ?? null;
      triggerEvent("activity", `New lead: ${normalizeLabel(row.company_name, stateVal)}`, stateVal);
    };

    const handleUpdatedLead = (oldRow: LeadRealtimeRow, newRow: LeadRealtimeRow) => {
      const oldStatus = normalizeStatus(oldRow.status);
      const newStatus = normalizeStatus(newRow.status);
      if (newStatus === "demo sent" && oldStatus !== "demo sent") {
        const stateVal = newRow.state ?? newRow.State ?? null;
        triggerEvent("demo_sent", `Demo Sent: ${normalizeLabel(newRow.company_name, stateVal)}`, stateVal);
      }
    };

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

    return () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
      void supabase.removeChannel(channel);
    };
  }, [supabase, triggerEvent]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-[#050505] font-sans shadow-2xl">
      <div className="absolute left-6 top-6 z-10 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-md">
        <div className="rounded-lg bg-cyan-500/20 p-2">
          <MapIcon className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">Live War Room</h2>
          <p className="text-[10px] text-slate-400">Realtime Territory Activity</p>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-10 w-64 rounded-2xl border border-cyan-500/30 bg-[#0a0a0a]/90 p-5 shadow-[0_0_20px_rgba(6,182,212,0.15)] backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-cyan-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-100">What We Capture</h3>
        </div>

        <div className="space-y-4">
          <LegendItem color="bg-emerald-400" label="Demo Sent" icon={<Zap size={12} />} pulse />
          <LegendItem color="bg-purple-500" label="New Leads" icon={<MessageSquare size={12} />} />
          <LegendItem color="bg-rose-500" label="Lead Deletions" icon={<Trash2 size={12} />} />
          <LegendItem color="bg-yellow-400" label="Deal Requests" icon={<Trophy size={12} />} glow />
        </div>
      </div>

      <svg viewBox="0 0 1000 600" className="h-full w-full fill-slate-800 opacity-40 stroke-slate-700 stroke-[0.5]">
        <path d="M150,150 L850,150 L850,450 L150,450 Z" fill="none" />
        <text
          x="500"
          y="300"
          textAnchor="middle"
          className="pointer-events-none fill-slate-700 text-[100px] font-bold uppercase"
        >
          United States
        </text>
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
    </div>
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
    demo_sent: "bg-emerald-400 shadow-[0_0_15px_#34d399]",
    deal_requested: "bg-yellow-400 shadow-[0_0_20px_#facc15]",
    activity: "bg-purple-500",
    lead_deleted: "bg-rose-500",
  };

  return (
    <div className={`relative h-4 w-4 rounded-full border-2 border-white ${colors[type]}`}>
      {type === "deal_requested" ? (
        <motion.div
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-[-8px] rounded-full border-2 border-yellow-400"
        />
      ) : null}
    </div>
  );
}
