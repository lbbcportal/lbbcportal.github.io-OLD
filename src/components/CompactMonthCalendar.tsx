import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cake,
  CalendarDays,
  ArrowUpRight
} from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  toDateString,
  getRecurringDates
} from '../lib/dateTime';
import { Person } from '../types';

interface CompactMonthCalendarProps {
  onSelectDay: (date: Date) => void;
  people: Person[];
  selectedDate?: Date | null;
  onFullView?: () => void;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getBirthdaysForDate(people: Person[], date: Date): Person[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const isLeap = isLeapYear(date.getFullYear());

  return people.filter(p => {
    if (!p.birthdayMonth || !p.birthdayDay) return false;
    if (p.birthdayMonth === month && p.birthdayDay === day) return true;
    if (!isLeap && month === 2 && day === 28 && p.birthdayMonth === 2 && p.birthdayDay === 29) {
      return true;
    }
    return false;
  });
}

export const CompactMonthCalendar: React.FC<CompactMonthCalendarProps> = ({
  onSelectDay,
  people,
  selectedDate,
  onFullView
}) => {
  const { settings, regularServices, events, overrides } = useData();
  const [viewDate, setViewDate] = useState(() => new Date());

  const todayStr = toDateString(new Date());
  const selectedStr = selectedDate ? toDateString(selectedDate) : null;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleResetToday = () => {
    setViewDate(new Date());
  };

  // Weekday headers based on weekStartDay setting
  const weekHeaders = useMemo(() => {
    if (settings.weekStartDay === 'monday') {
      return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    }
    return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  }, [settings.weekStartDay]);

  // Calendar grid calculations
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun
    const adjustedStartDay = settings.weekStartDay === 'monday'
      ? (startDayOfWeek === 0 ? 6 : startDayOfWeek - 1)
      : startDayOfWeek;

    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    // Leading days from previous month
    for (let i = adjustedStartDay - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ date: d, isCurrentMonth: false });
    }

    // Days in current month
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      cells.push({ date: new Date(year, month, day), isCurrentMonth: true });
    }

    // Trailing days to fill standard 35 or 42 grid
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return cells;
  }, [year, month, settings.weekStartDay]);

  // Map of occurrences by date for fast dot lookup
  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, { serviceDots: string[]; eventDots: string[] }>();

    if (calendarCells.length === 0) return map;
    const startStr = toDateString(calendarCells[0].date);
    const endStr = toDateString(calendarCells[calendarCells.length - 1].date);

    // 1. Regular services
    for (const service of regularServices) {
      const dates = getRecurringDates(startStr, endStr, service.daysOfWeek);
      for (const d of dates) {
        const override = overrides.find(o => o.serviceId === service.id && o.date === d);
        if (override?.isCancelled) continue;

        if (!map.has(d)) {
          map.set(d, { serviceDots: [], eventDots: [] });
        }
        map.get(d)!.serviceDots.push(service.color || 'var(--accent-base)');
      }
    }

    // 2. Events
    for (const ev of events) {
      if (ev.isTemplate) continue;
      if (ev.startDate >= startStr && ev.startDate <= endStr) {
        if (!map.has(ev.startDate)) {
          map.set(ev.startDate, { serviceDots: [], eventDots: [] });
        }
        map.get(ev.startDate)!.eventDots.push(ev.color || 'var(--accent-base)');
      }
    }

    return map;
  }, [calendarCells, regularServices, events, overrides]);

  const monthTitle = viewDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 sm:p-5 flex flex-col justify-between">
      {/* Top Card Header: Monthly Calendar + Full View */}
      {onFullView && (
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent-tint text-accent shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-main tracking-tight truncate">
              Monthly Calendar
            </h2>
          </div>
          <button
            type="button"
            onClick={onFullView}
            className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Full View</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Month Navigation Row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {!onFullView && <CalendarDays className="w-4 h-4 text-accent shrink-0" />}
          <h3 className="text-xs sm:text-sm font-bold text-main tracking-tight truncate">
            {monthTitle}
          </h3>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleResetToday}
            className="text-[11px] font-semibold px-2 py-0.5 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer transition-colors"
            title="Jump to Today"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer transition-colors"
            title="Previous Month"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer transition-colors"
            title="Next Month"
            aria-label="Next Month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 gap-1 text-center pb-1.5 border-b border-subtle text-[10px] font-bold uppercase tracking-wider text-mut">
        {weekHeaders.map(day => (
          <div key={day}>{day}</div>
        ))}
      </div>

      {/* Day Cells Grid */}
      <div key={`${year}-${month}`} className="grid grid-cols-7 gap-1 pt-1.5 viewer-calendar-month-fade">
        {calendarCells.map(({ date, isCurrentMonth }, idx) => {
          const dStr = toDateString(date);
          const isToday = dStr === todayStr;
          const isSelected = selectedStr === dStr;
          const dayData = occurrencesByDate.get(dStr);
          const birthdays = getBirthdaysForDate(people, date);
          const hasBirthdays = birthdays.length > 0;

          const serviceDots = dayData?.serviceDots || [];
          const eventDots = dayData?.eventDots || [];

          const cellOutlineClass = isToday
            ? isSelected
              ? 'cal-day-cell-today-selected'
              : 'cal-day-cell-today'
            : isSelected
            ? 'cal-day-cell-selected'
            : isCurrentMonth
            ? 'cal-day-cell'
            : 'cal-day-cell-outside';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDay(date)}
              className={`h-[36px] sm:h-[40px] p-1 rounded-lg cursor-pointer flex flex-col items-center justify-between relative group ${cellOutlineClass} ${
                isToday ? 'font-bold' : ''
              }`}
            >
              {/* Day Number and Birthday Icon */}
              <div className="flex items-center gap-0.5 leading-none">
                <span
                  className={`text-[11px] font-semibold rounded-full w-[18px] h-[18px] flex items-center justify-center tabular-nums ${
                    isToday
                      ? 'bg-accent text-accent-contrast shadow-2xs font-bold'
                      : isCurrentMonth
                      ? 'text-main'
                      : 'text-mut/50 group-hover:text-sec'
                  }`}
                >
                  {date.getDate()}
                </span>
                {hasBirthdays && (
                  <Cake
                    className={`w-2.5 h-2.5 text-pink-500 shrink-0 ${
                      isCurrentMonth ? '' : 'opacity-50 group-hover:opacity-85'
                    }`}
                  />
                )}
              </div>

              {/* Dots row for services and events */}
              <div
                className={`flex items-center justify-center gap-0.5 h-1.5 max-w-full px-0.5 ${
                  isCurrentMonth ? '' : 'opacity-50 group-hover:opacity-85'
                }`}
              >
                {serviceDots.slice(0, 3).map((color, sIdx) => (
                  <span
                    key={`srv_${sIdx}`}
                    className="w-1.5 h-1.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: color }}
                  />
                ))}
                {eventDots.slice(0, 2).map((color, eIdx) => (
                  <span
                    key={`ev_${eIdx}`}
                    className="w-1.5 h-1.5 rounded-full shrink-0 ring-0.5 ring-surface"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Legend */}
      <div className="pt-2.5 mt-2 border-t border-subtle flex items-center justify-between gap-2 text-[10px] text-sec">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>Service</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            <span>Event</span>
          </span>
          <span className="flex items-center gap-1">
            <Cake className="w-2.5 h-2.5 text-pink-500" />
            <span>Birthday</span>
          </span>
        </div>
        <span className="text-mut text-[10px] shrink-0">Click day to view</span>
      </div>
    </div>
  );
};
