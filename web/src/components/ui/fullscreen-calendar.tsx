"use client";

import * as React from "react";
import {
  add,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isEqual,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from "date-fns";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PlusCircleIcon,
  SearchIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface Event {
  id: number;
  name: string;
  time: string;
  datetime: string;
  leadId?: string;
  /** CRM: who scheduled the appointment (`appt_scheduled_by` display name). */
  scheduledBy?: string;
}

export interface CalendarData {
  day: Date;
  events: Event[];
}

interface FullScreenCalendarProps {
  data: CalendarData[];
  onSelectDay?: (day: Date) => void;
  onSelectEvent?: (event: Event) => void;
  onMonthChange?: (monthStart: Date) => void;
  /** CRM: appointments are created on leads — use this to scroll to leads or open add flow. */
  onNewEvent?: () => void;
}

const colStartClasses = [
  "",
  "col-start-2",
  "col-start-3",
  "col-start-4",
  "col-start-5",
  "col-start-6",
  "col-start-7",
];

export function FullScreenCalendar({
  data,
  onSelectDay,
  onSelectEvent,
  onMonthChange,
  onNewEvent,
}: FullScreenCalendarProps) {
  const today = startOfToday();
  const [selectedDay, setSelectedDay] = React.useState(today);
  const [currentMonth, setCurrentMonth] = React.useState(format(today, "MMM-yyyy"));
  const firstDayCurrentMonth = React.useMemo(
    () => parse(currentMonth, "MMM-yyyy", new Date()),
    [currentMonth],
  );
  const days = eachDayOfInterval({
    start: startOfWeek(firstDayCurrentMonth),
    end: endOfWeek(endOfMonth(firstDayCurrentMonth)),
  });

  function previousMonth() {
    const firstDayNextMonth = add(firstDayCurrentMonth, { months: -1 });
    setCurrentMonth(format(firstDayNextMonth, "MMM-yyyy"));
  }

  function nextMonth() {
    const firstDayNextMonth = add(firstDayCurrentMonth, { months: 1 });
    setCurrentMonth(format(firstDayNextMonth, "MMM-yyyy"));
  }

  function previousYear() {
    const next = startOfMonth(add(firstDayCurrentMonth, { years: -1 }));
    setCurrentMonth(format(next, "MMM-yyyy"));
  }

  function nextYear() {
    const next = startOfMonth(add(firstDayCurrentMonth, { years: 1 }));
    setCurrentMonth(format(next, "MMM-yyyy"));
  }

  function jumpToMonthYyyyMm(yyyyMm: string) {
    if (!yyyyMm) return;
    const d = parse(`${yyyyMm}-01`, "yyyy-MM-dd", new Date());
    if (Number.isNaN(d.getTime())) return;
    setCurrentMonth(format(startOfMonth(d), "MMM-yyyy"));
  }

  function goToToday() {
    setCurrentMonth(format(today, "MMM-yyyy"));
    setSelectedDay(today);
    onSelectDay?.(today);
  }

  React.useEffect(() => {
    onMonthChange?.(firstDayCurrentMonth);
  }, [currentMonth, firstDayCurrentMonth, onMonthChange]);

  function selectDay(day: Date) {
    setSelectedDay(day);
    onSelectDay?.(day);
  }

  return (
    <div className="@container flex min-w-0 flex-1 flex-col overflow-x-hidden rounded-2xl border border-zinc-700/80 bg-[radial-gradient(120%_60%_at_12%_0%,rgba(34,211,238,0.1),transparent_52%),radial-gradient(100%_50%_at_85%_18%,rgba(167,139,250,0.09),transparent_58%),linear-gradient(180deg,#0b0d12_0%,#0a0c10_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_30px_-22px_rgba(34,211,238,0.35)]">
      <div className="flex flex-col space-y-4 border-b border-zinc-700/80 bg-gradient-to-r from-cyan-500/[0.05] via-transparent to-violet-500/[0.05] p-3 @md:flex-row @md:items-center @md:justify-between @md:space-y-0 @md:p-4 @lg:flex-none">
        <div className="flex min-w-0 flex-auto">
          <div className="flex min-w-0 items-center gap-2 @md:gap-4">
            <div className="hidden w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-cyan-300/20 bg-black/35 p-0.5 @md:flex @md:w-20">
              <h1 className="p-1 text-xs uppercase text-cyan-200/75">{format(today, "MMM")}</h1>
              <div className="flex w-full items-center justify-center rounded-lg border border-cyan-300/20 bg-zinc-950/80 p-0.5 text-lg font-bold text-zinc-100">
                <span>{format(today, "d")}</span>
              </div>
            </div>
            <div className="min-w-0 flex flex-col">
              <h2 className="truncate text-base font-semibold text-zinc-100 @md:text-lg">
                {format(firstDayCurrentMonth, "MMMM, yyyy")}
              </h2>
              <p className="hidden text-sm text-zinc-300/80 @md:block">
                {format(firstDayCurrentMonth, "MMM d, yyyy")} - {format(endOfMonth(firstDayCurrentMonth), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 @md:flex-row @md:items-center @md:gap-6">
          <Button type="button" variant="outline" size="icon" className="hidden border-cyan-300/20 bg-black/35 @lg:flex">
            <SearchIcon size={16} strokeWidth={2} aria-hidden="true" />
          </Button>

          <Separator orientation="vertical" className="hidden h-6 bg-cyan-300/20 @lg:block" />

          <div className="inline-flex w-full min-w-0 -space-x-px rounded-lg shadow-sm shadow-black/5 @md:w-auto rtl:space-x-reverse">
            <Button
              type="button"
              onClick={previousMonth}
              className="rounded-none border-cyan-300/20 bg-black/35 shadow-none first:rounded-s-lg last:rounded-e-lg focus-visible:z-10"
              variant="outline"
              size="icon"
              aria-label="Navigate to previous month"
            >
              <ChevronLeftIcon size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              onClick={goToToday}
              className="w-full rounded-none border-cyan-300/20 bg-black/35 shadow-none first:rounded-s-lg last:rounded-e-lg focus-visible:z-10 @md:w-auto"
              variant="outline"
            >
              Today
            </Button>
            <Button
              type="button"
              onClick={nextMonth}
              className="rounded-none border-cyan-300/20 bg-black/35 shadow-none first:rounded-s-lg last:rounded-e-lg focus-visible:z-10"
              variant="outline"
              size="icon"
              aria-label="Navigate to next month"
            >
              <ChevronRightIcon size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 @md:w-auto">
            <Button
              type="button"
              onClick={previousYear}
              variant="outline"
              size="icon"
              className="shrink-0 border-cyan-300/20 bg-black/35"
              aria-label="Previous year"
              title="Previous year"
            >
              <ChevronsLeftIcon size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
            <label htmlFor="crm-cal-jump-month" className="sr-only">
              Jump to month and year
            </label>
            <input
              id="crm-cal-jump-month"
              type="month"
              value={format(firstDayCurrentMonth, "yyyy-MM")}
              onChange={(e) => jumpToMonthYyyyMm(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-cyan-300/25 bg-black/50 px-2 text-sm text-zinc-100 shadow-inner shadow-black/30 [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 @md:min-w-[10.5rem] @md:flex-none"
            />
            <Button
              type="button"
              onClick={nextYear}
              variant="outline"
              size="icon"
              className="shrink-0 border-cyan-300/20 bg-black/35"
              aria-label="Next year"
              title="Next year"
            >
              <ChevronsRightIcon size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>

          <Separator orientation="vertical" className="hidden h-6 bg-cyan-300/20 @md:block" />
          <Separator orientation="horizontal" className="block w-full bg-cyan-300/20 @md:hidden" />

          <Button
            type="button"
            onClick={() => onNewEvent?.()}
            title="Appointments are set on a lead: open the Leads list, pick a lead, set status to Appt Set and choose date & time."
            className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-emerald-950 shadow-[0_0_22px_-10px_rgba(16,185,129,0.75)] hover:from-emerald-400 hover:to-cyan-400 @md:w-auto"
          >
            <PlusCircleIcon size={16} strokeWidth={2} aria-hidden="true" />
            <span>New Event</span>
          </Button>
        </div>
      </div>

      <div className="@lg:flex @lg:flex-auto @lg:flex-col">
        <div className="grid grid-cols-7 border-b border-zinc-700/80 text-center text-[11px] font-semibold leading-tight text-zinc-300 @lg:flex-none @lg:text-sm @lg:leading-6">
          <div className="border-r border-zinc-700/80 py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">S</span>
            <span className="hidden @lg:inline">Sun</span>
          </div>
          <div className="border-r border-zinc-700/80 py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">M</span>
            <span className="hidden @lg:inline">Mon</span>
          </div>
          <div className="border-r border-zinc-700/80 py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">T</span>
            <span className="hidden @lg:inline">Tue</span>
          </div>
          <div className="border-r border-zinc-700/80 py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">W</span>
            <span className="hidden @lg:inline">Wed</span>
          </div>
          <div className="border-r border-zinc-700/80 py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">T</span>
            <span className="hidden @lg:inline">Thu</span>
          </div>
          <div className="border-r border-zinc-700/80 py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">F</span>
            <span className="hidden @lg:inline">Fri</span>
          </div>
          <div className="py-1.5 @lg:py-2.5">
            <span className="@lg:hidden">S</span>
            <span className="hidden @lg:inline">Sat</span>
          </div>
        </div>

        <div className="flex min-h-0 text-xs leading-6 @lg:flex-auto">
          <div className="hidden w-full bg-[linear-gradient(180deg,rgba(255,255,255,0.01)_0%,rgba(255,255,255,0)_100%)] @lg:grid @lg:grid-cols-7 @lg:grid-rows-5">
            {days.map((day, dayIdx) => (
              <div
                key={dayIdx}
                onClick={() => selectDay(day)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectDay(day);
                  }
                }}
                role="button"
                tabIndex={0}
                className={cn(
                  dayIdx === 0 && colStartClasses[getDay(day)],
                  !isEqual(day, selectedDay) &&
                    !isToday(day) &&
                    !isSameMonth(day, firstDayCurrentMonth) &&
                    "bg-zinc-900/70 text-zinc-500",
                  "relative flex min-h-[8rem] flex-col border-b border-zinc-700/80 hover:bg-cyan-500/[0.035] focus:z-10 focus:outline-none focus:ring-2 focus:ring-cyan-500/30",
                  dayIdx % 7 !== 6 && "border-r border-zinc-700/80",
                  !isEqual(day, selectedDay) && "hover:bg-zinc-900/80",
                )}
              >
                <header className="flex items-center justify-between p-2.5">
                  <button
                    type="button"
                    className={cn(
                      isEqual(day, selectedDay) && "text-emerald-950",
                      !isEqual(day, selectedDay) &&
                        !isToday(day) &&
                        isSameMonth(day, firstDayCurrentMonth) &&
                        "text-zinc-100",
                      !isEqual(day, selectedDay) &&
                        !isToday(day) &&
                        !isSameMonth(day, firstDayCurrentMonth) &&
                        "text-zinc-500",
                      isEqual(day, selectedDay) && isToday(day) && "border-none bg-emerald-500",
                      isEqual(day, selectedDay) && !isToday(day) && "bg-zinc-200",
                      (isEqual(day, selectedDay) || isToday(day)) && "font-semibold",
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs hover:border hover:border-zinc-700",
                    )}
                  >
                    <time dateTime={format(day, "yyyy-MM-dd")}>{format(day, "d")}</time>
                  </button>
                </header>
                <div className="flex-1 p-2">
                  {data
                    .filter((event) => isSameDay(event.day, day))
                    .map((entry) => (
                      <div key={entry.day.toString()} className="space-y-2">
                        {entry.events.slice(0, 2).map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEvent?.(event);
                            }}
                            className="group flex w-full min-w-0 flex-col items-start gap-1 rounded-xl border border-cyan-300/20 bg-zinc-900/95 px-2.5 py-2.5 text-left transition hover:border-cyan-300/45 hover:bg-zinc-900"
                          >
                            <p className="text-[13px] font-semibold leading-none text-cyan-200">{event.time}</p>
                            <p className="w-full truncate text-[13.5px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
                              {event.name}
                            </p>
                            {event.scheduledBy ? (
                              <p className="w-full truncate text-xs font-medium leading-snug text-emerald-200/95">
                                Set by <span className="font-semibold text-emerald-100">{event.scheduledBy}</span>
                              </p>
                            ) : null}
                          </button>
                        ))}
                        {entry.events.length > 2 && (
                          <div className="px-1 text-xs font-medium text-zinc-400">
                            + {entry.events.length - 2} more
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="isolate grid max-h-[min(78dvh,680px)] w-full grid-cols-7 grid-rows-5 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] @lg:hidden">
            {days.map((day, dayIdx) => {
              const dayEvents = data
                .filter((date) => isSameDay(date.day, day))
                .flatMap((date) => date.events);
              const totalEv = dayEvents.length;
              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "flex min-h-[5.25rem] flex-col border-b border-zinc-700/80 @md:min-h-[6rem]",
                    dayIdx % 7 !== 6 && "border-r border-zinc-700/80",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectDay(day)}
                    className={cn(
                      "flex w-full shrink-0 items-center justify-center px-1 pt-1 @md:justify-end @md:px-2 @md:pt-1.5",
                      isEqual(day, selectedDay) && "text-primary-foreground",
                      !isEqual(day, selectedDay) &&
                        !isToday(day) &&
                        isSameMonth(day, firstDayCurrentMonth) &&
                        "text-zinc-100",
                      !isEqual(day, selectedDay) &&
                        !isToday(day) &&
                        !isSameMonth(day, firstDayCurrentMonth) &&
                        "text-zinc-500",
                      (isEqual(day, selectedDay) || isToday(day)) && "font-semibold",
                      "hover:bg-cyan-500/[0.035] focus:z-10 focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                    )}
                  >
                    <time
                      dateTime={format(day, "yyyy-MM-dd")}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] @md:size-6 @md:text-xs",
                        isEqual(day, selectedDay) && isToday(day) && "bg-emerald-600 text-emerald-950",
                        isEqual(day, selectedDay) && !isToday(day) && "bg-emerald-600 text-emerald-950",
                      )}
                    >
                      {format(day, "d")}
                    </time>
                  </button>
                  {totalEv > 0 ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-0.5 pb-1 @md:gap-1 @md:px-1.5 @md:pb-1.5">
                      {dayEvents.slice(0, 2).map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onSelectEvent?.(event)}
                          className="w-full min-w-0 rounded-md border border-cyan-500/20 bg-zinc-950/80 px-1.5 py-1 text-left shadow-sm shadow-black/20 transition hover:border-cyan-400/40 hover:bg-zinc-900/90 @md:px-2 @md:py-1.5"
                        >
                          <p className="truncate text-[11px] font-bold leading-tight text-cyan-200 @md:text-xs">
                            {event.time}
                          </p>
                          <p className="truncate text-[10px] font-semibold leading-snug text-zinc-100 @md:text-[11px]">
                            {event.name}
                          </p>
                          {event.scheduledBy ? (
                            <p className="mt-0.5 truncate text-[10px] font-medium leading-snug text-emerald-200/95 @md:text-[11px]">
                              Set by {event.scheduledBy}
                            </p>
                          ) : null}
                        </button>
                      ))}
                      {totalEv > 2 ? (
                        <p className="text-center text-[10px] font-semibold text-zinc-400 @md:text-xs">
                          +{totalEv - 2} more
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
