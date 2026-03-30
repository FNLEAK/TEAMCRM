import { PipelineStage } from "@prisma/client";

export const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.NEW,
  PipelineStage.ATTEMPTED_CONTACT,
  PipelineStage.CONNECTED,
  PipelineStage.QUALIFIED,
  PipelineStage.APPOINTMENT_BOOKED,
  PipelineStage.CLOSED_WON,
  PipelineStage.CLOSED_LOST,
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  [PipelineStage.NEW]: "New",
  [PipelineStage.ATTEMPTED_CONTACT]: "Attempted Contact",
  [PipelineStage.CONNECTED]: "Connected",
  [PipelineStage.QUALIFIED]: "Qualified",
  [PipelineStage.APPOINTMENT_BOOKED]: "Appointment Booked",
  [PipelineStage.CLOSED_WON]: "Closed Won",
  [PipelineStage.CLOSED_LOST]: "Closed Lost",
};

/** Probability weight for weighted pipeline revenue */
export const STAGE_WEIGHT: Record<PipelineStage, number> = {
  [PipelineStage.NEW]: 0.05,
  [PipelineStage.ATTEMPTED_CONTACT]: 0.1,
  [PipelineStage.CONNECTED]: 0.25,
  [PipelineStage.QUALIFIED]: 0.45,
  [PipelineStage.APPOINTMENT_BOOKED]: 0.7,
  [PipelineStage.CLOSED_WON]: 1,
  [PipelineStage.CLOSED_LOST]: 0,
};

export function parseStage(s: string): PipelineStage | null {
  const upper = s.trim().toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, PipelineStage> = {
    NEW: PipelineStage.NEW,
    ATTEMPTED_CONTACT: PipelineStage.ATTEMPTED_CONTACT,
    ATTEMPTEDCONTACT: PipelineStage.ATTEMPTED_CONTACT,
    CONNECTED: PipelineStage.CONNECTED,
    QUALIFIED: PipelineStage.QUALIFIED,
    APPOINTMENT_BOOKED: PipelineStage.APPOINTMENT_BOOKED,
    APPOINTMENTBOOKED: PipelineStage.APPOINTMENT_BOOKED,
    CLOSED_WON: PipelineStage.CLOSED_WON,
    CLOSEDWON: PipelineStage.CLOSED_WON,
    CLOSED_LOST: PipelineStage.CLOSED_LOST,
    CLOSEDLOST: PipelineStage.CLOSED_LOST,
  };
  return map[upper] ?? null;
}
