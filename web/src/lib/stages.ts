export const STAGE_ORDER = [
  "NEW",
  "ATTEMPTED_CONTACT",
  "CONNECTED",
  "QUALIFIED",
  "APPOINTMENT_BOOKED",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

export type Stage = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  NEW: "New",
  ATTEMPTED_CONTACT: "Attempted Contact",
  CONNECTED: "Connected",
  QUALIFIED: "Qualified",
  APPOINTMENT_BOOKED: "Appointment Booked",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};
