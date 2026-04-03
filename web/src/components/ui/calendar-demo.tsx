"use client";

import { FullScreenCalendar } from "@/components/ui/fullscreen-calendar";

const dummyEvents = [
  {
    day: new Date("2025-01-02"),
    events: [
      { id: 1, name: "Q1 Planning Session", time: "10:00 AM", datetime: "2025-01-02T00:00" },
      { id: 2, name: "Team Sync", time: "2:00 PM", datetime: "2025-01-02T00:00" },
    ],
  },
];

export function CalendarDemo() {
  return (
    <div className="flex h-screen flex-1 flex-col scale-90">
      <FullScreenCalendar data={dummyEvents} />
    </div>
  );
}
