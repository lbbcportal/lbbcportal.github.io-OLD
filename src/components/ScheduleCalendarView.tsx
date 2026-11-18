import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  X
} from 'lucide-react';
import {
  formatDate,
  formatTime,
  getMonthGrid,
  toDateString
} from '../lib/dateTime';
import { Person, RoleAssignment, TimeFormat, WeekStartDay } from '../types';

export interface ScheduleOccurrenceSlot {
  date: string;
  targetType: 'regular_service' | 'event';
  targetId: string;
  name: string;
  color: string;
  startTime: string;
  endTime?: string;
  slotIndex: number;
  slotCount: number;
  isCancelled: boolean;
  noServiceOnDate: boolean;
  assignment?: RoleAssignment;
}

export interface ScheduleOccurrenceGroup {
  groupKey: string;
  date: string;
  targetType: 'regular_service' | 'event';
  targetId: string;
  name: string;
  color: string;
  startTime: string;
  endTime?: string;
  isCancelled: boolean;
  noServiceOnDate: boolean;
  slots: ScheduleOccurrenceSlot[];
}

interface ScheduleCalendarViewProps {
  roleId: string;
  activeMonths: string[];
  weekStartDay: WeekStartDay;
  timeFormat: TimeFormat;
  isViewer: boolean;
  activeRolePeople: Person[];
  groupedOccurrences: ScheduleOccurrenceGroup[];
  recentSavedSlot: string | null;
  checkConflict: (
    personId: string,
    personName: string,
    date: string,
    startTime: string,
    endTime?: string,
    currentSlotId?: string
  ) => { otherRoleName: string; otherTime: string } | null;
  onAssignPerson: (
    targetType: 'regular_service' | 'event',
    targetId: string,
    date: string,
    slotIndex: number,
    startTime: string,
    endTime: string | undefined,
    personIdOrCustom: string
  ) => Promise<void>;
}

function getInitialCalendarMonth(activeMonths: string[]): { year: number; month: number } {
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (activeMonths.includes(currentYm)) {
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  if (activeMonths.length > 0) {
    const [y, m] = activeMonths[0].split('-').map(Number);
    if (y && m) {
      return { year: y, month: m - 1 };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[0];
}

export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
  roleId,
  activeMonths,
  weekStartDay,
  timeFormat,
  isViewer,
  activeRolePeople,
  groupedOccurrences,
  recentSavedSlot,
  checkConflict,
  onAssignPerson
}) => {
  const [viewMonthDate, setViewMonthDate] = useState<{ year: number; month: number }>(() =>
    getInitialCalendarMonth(activeMonths)
  );
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [customNameInputs, setCustomNameInputs] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});
  const [savingSlotKey, setSavingSlotKey] = useState<string | null>(null);

  const todayStr = toDateString(new Date());

  const gridCells = useMemo(
    () => getMonthGrid(viewMonthDate.year, viewMonthDate.month, weekStartDay),
    [viewMonthDate.year, viewMonthDate.month, weekStartDay]
  );

  const weekdayLabels = useMemo(() => {
    const sunFirst = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return weekStartDay === 'monday'
      ? [...sunFirst.slice(1), sunFirst[0]]
      : sunFirst;
  }, [weekStartDay]);

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, ScheduleOccurrenceGroup[]>();
    for (const group of groupedOccurrences) {
      const existing = map.get(group.date);
      if (existing) {
        existing.push(group);
      } else {
        map.set(group.date, [group]);
      }
    }
    return map;
  }, [groupedOccurrences]);

  const monthLabel = useMemo(() => {
    const d = new Date(viewMonthDate.year, viewMonthDate.month, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [viewMonthDate.year, viewMonthDate.month]);

  const currentYm = `${viewMonthDate.year}-${String(viewMonthDate.month + 1).padStart(2, '0')}`;
  const isMonthInSchedule = activeMonths.includes(currentYm);

  const selectedDateGroups = useMemo(() => {
    if (!selectedDateStr) return [];
    return occurrencesByDate.get(selectedDateStr) || [];
  }, [selectedDateStr, occurrencesByDate]);

  const handlePrevMonth = () => {
    setViewMonthDate((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const handleNextMonth = () => {
    setViewMonthDate((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const handleToday = () => {
    const now = new Date();
    setViewMonthDate({ year: now.getFullYear(), month: now.getMonth() });
  };

  const handleAssignWithLoading = async (
    slotKey: string,
    targetType: 'regular_service' | 'event',
    targetId: string,
    date: string,
    slotIndex: number,
    startTime: string,
    endTime: string | undefined,
    personIdOrCustom: string
  ) => {
    setSavingSlotKey(slotKey);
    try {
      await onAssignPerson(
        targetType,
        targetId,
        date,
        slotIndex,
        startTime,
        endTime,
        personIdOrCustom
      );
    } finally {
      setSavingSlotKey((prev) => (prev === slotKey ? null : prev));
    }
  };

  return (
    <div className="space-y-3">
      {/* Calendar Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm sm:text-base font-bold text-main">
            {monthLabel}
          </h4>
          {!isMonthInSchedule && activeMonths.length > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-subtle text-mut border border-subtle">
              Not in schedule
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main transition-colors cursor-pointer"
            title="Previous month"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="px-2.5 py-1 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-xs font-semibold text-main transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main transition-colors cursor-pointer"
            title="Next month"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday Column Headings */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekdayLabels.map((day) => (
          <div
            key={day}
            className="text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-mut py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Month Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {gridCells.map(({ date, isCurrentMonth }) => {
          const dateStr = toDateString(date);
          const dayNum = date.getDate();
          const dayGroups = occurrencesByDate.get(dateStr) || [];
          const hasServices = dayGroups.length > 0;
          const isToday = dateStr === todayStr;

          if (!hasServices) {
            return (
              <div
                key={dateStr}
                className={`min-h-[68px] sm:min-h-[96px] rounded-xl p-1 sm:p-1.5 border transition-colors ${
                  isToday
                    ? 'border-accent bg-accent-tint/40'
                    : isCurrentMonth
                      ? 'border-subtle/70 bg-surface'
                      : 'border-subtle/40 bg-subtle/25 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[11px] sm:text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'bg-accent text-accent-contrast font-bold'
                        : isCurrentMonth
                          ? 'text-sec'
                          : 'text-mut'
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDateStr(dateStr)}
              className={`min-h-[68px] sm:min-h-[96px] rounded-xl p-1 sm:p-1.5 border text-left flex flex-col gap-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                isToday
                  ? 'border-accent bg-accent-tint/30 hover:bg-accent-tint/50'
                  : isCurrentMonth
                    ? 'border-subtle bg-surface hover:border-strong hover:bg-surface-hover/40'
                    : 'border-subtle/50 bg-subtle/30 opacity-75 hover:opacity-100'
              }`}
            >
              {/* Date Number */}
              <div className="flex items-center justify-between w-full">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[11px] sm:text-xs font-bold tabular-nums ${
                    isToday
                      ? 'bg-accent text-accent-contrast'
                      : isCurrentMonth
                        ? 'text-main'
                        : 'text-mut'
                  }`}
                >
                  {dayNum}
                </span>
              </div>

              {/* Stacked Service / Activity Boxes */}
              <div className="flex flex-col gap-1 w-full min-w-0">
                {dayGroups.map((group) => {
                  const firstSlot = group.slots[0];
                  const firstAssignedName = firstSlot?.assignment?.personName || '';
                  const firstShortName = firstAssignedName ? getFirstName(firstAssignedName) : '';
                  const anyUnassigned =
                    !group.isCancelled &&
                    group.slots.some((s) => !s.assignment?.personName);
                  const serviceTintBg = `color-mix(in srgb, ${group.color} 14%, var(--bg-surface))`;
                  const serviceTintBorder = `color-mix(in srgb, ${group.color} 32%, var(--border-subtle))`;

                  return (
                    <div
                      key={group.groupKey}
                      className={`rounded-lg px-1 sm:px-1.5 py-0.5 sm:py-1 border transition-colors min-w-0 ${
                        group.isCancelled ? 'opacity-65' : ''
                      }`}
                      style={{
                        backgroundColor: serviceTintBg,
                        borderColor: serviceTintBorder,
                        borderLeftWidth: '3.5px',
                        borderLeftColor: group.color
                      }}
                    >
                      {/* Phone compact cell: color bar + short service name + first name */}
                      <div className="sm:hidden space-y-0.5 min-w-0">
                        <div className="text-[9px] font-semibold text-main truncate leading-tight">
                          {group.name}
                        </div>
                        {group.isCancelled ? (
                          <div className="text-[9px] text-mut line-through truncate leading-tight">
                            Cancelled
                          </div>
                        ) : anyUnassigned && !firstShortName ? (
                          <div className="inline-block px-1 py-0.2 rounded bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 text-[8.5px] font-semibold truncate max-w-full leading-tight">
                            Unassigned
                          </div>
                        ) : (
                          <div className="text-[9px] font-medium text-sec truncate leading-tight">
                            {firstShortName}
                            {group.slots.length > 1 ? ` +${group.slots.length - 1}` : ''}
                          </div>
                        )}
                      </div>

                      {/* Tablet / Desktop cell: service name, time, assigned name */}
                      <div className="hidden sm:block space-y-0.5 min-w-0">
                        <div className="text-[11px] font-bold text-main truncate leading-tight">
                          {group.name}
                        </div>
                        <div className="text-[10px] text-sec tabular-nums leading-tight truncate">
                          {formatTime(group.startTime, timeFormat)}
                        </div>
                        {group.isCancelled ? (
                          <div className="text-[10px] text-mut line-through leading-tight">
                            Cancelled
                          </div>
                        ) : (
                          <div className="space-y-0.5 pt-0.5">
                            {group.slots.map((slot) => {
                              const assignedName = slot.assignment?.personName || '';
                              const slotKey = `${slot.targetId}_${slot.date}_${roleId}_${slot.slotIndex}`;
                              if (!assignedName) {
                                return (
                                  <div
                                    key={slotKey}
                                    className="inline-block px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 text-[10px] font-semibold leading-tight max-w-full truncate"
                                  >
                                    {slot.slotCount > 1 ? `S${slot.slotIndex + 1}: ` : ''}
                                    Unassigned
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={slotKey}
                                  className="text-[11px] font-semibold text-main truncate leading-tight"
                                  title={assignedName}
                                >
                                  {slot.slotCount > 1 ? `S${slot.slotIndex + 1}: ` : ''}
                                  {assignedName}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Date Occurrence Popup (Secretary = Edit, Viewer = Read-only) */}
      {selectedDateStr && selectedDateGroups.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in"
          onClick={() => setSelectedDateStr(null)}
        >
          <div
            className="w-full max-w-md bg-surface border border-subtle rounded-2xl shadow-xl text-main overflow-hidden motion-popup-in max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Popup Header */}
            <div className="px-4 py-3.5 border-b border-subtle flex items-center justify-between gap-2 bg-surface shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-accent shrink-0" />
                <h4 className="text-sm sm:text-base font-bold text-main truncate">
                  {formatDate(selectedDateStr, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer shrink-0"
                aria-label="Close date details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Popup Body */}
            <div className="p-4 space-y-3 overflow-y-auto">
              {selectedDateGroups.map((group) => {
                const serviceTintBg = `color-mix(in srgb, ${group.color} 12%, var(--bg-surface))`;
                const serviceTintBorder = `color-mix(in srgb, ${group.color} 32%, var(--border-subtle))`;

                return (
                  <div
                    key={group.groupKey}
                    className="rounded-xl p-3 border space-y-2.5"
                    style={{
                      backgroundColor: serviceTintBg,
                      borderColor: serviceTintBorder,
                      borderLeftWidth: '4px',
                      borderLeftColor: group.color
                    }}
                  >
                    {/* Service/Activity header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color }}
                          />
                          <span className="text-sm font-bold text-main break-words">
                            {group.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-sec mt-0.5 pl-4 tabular-nums">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>
                            {formatTime(group.startTime, timeFormat)}
                            {group.endTime ? ` – ${formatTime(group.endTime, timeFormat)}` : ''}
                          </span>
                        </div>
                      </div>

                      {group.isCancelled && (
                        <span className="px-2 py-0.5 rounded bg-subtle text-mut border border-subtle text-[10px] font-semibold line-through shrink-0">
                          Cancelled
                        </span>
                      )}
                      {group.noServiceOnDate && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 text-[10px] font-medium shrink-0">
                          No service on this date
                        </span>
                      )}
                    </div>

                    {/* Assigned Slots */}
                    {group.isCancelled ? (
                      <div className="text-xs text-mut italic">
                        Cancelled for this date
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {group.slots.map((slot) => {
                          const slotKey = `${slot.targetId}_${slot.date}_${roleId}_${slot.slotIndex}`;
                          const isAssigned = !!slot.assignment?.personName;
                          const isCustomMode = !!showCustomInput[slotKey];
                          const isSaving = savingSlotKey === slotKey;
                          const justSaved = recentSavedSlot === slotKey;
                          const conflict = isAssigned
                            ? checkConflict(
                                slot.assignment!.personId,
                                slot.assignment!.personName,
                                slot.date,
                                slot.startTime,
                                slot.endTime,
                                slot.assignment!.id
                              )
                            : null;

                          return (
                            <div key={slotKey} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-sec uppercase tracking-wider">
                                  {slot.slotCount > 1
                                    ? `Assigned to (Spot ${slot.slotIndex + 1})`
                                    : 'Assigned to'}
                                </span>
                                {!isViewer && isSaving && (
                                  <span className="text-[11px] font-semibold text-sec">
                                    Saving...
                                  </span>
                                )}
                                {!isViewer && !isSaving && justSaved && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                    <Check className="w-3 h-3" />
                                    <span>Saved</span>
                                  </span>
                                )}
                              </div>

                              {isViewer ? (
                                isAssigned ? (
                                  <div className="text-sm font-semibold text-main">
                                    {slot.assignment!.personName}
                                  </div>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 text-xs font-semibold italic">
                                    Unassigned
                                  </span>
                                )
                              ) : isCustomMode ? (
                                <div className="flex items-center gap-1 w-full">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={customNameInputs[slotKey] ?? ''}
                                    onChange={(e) =>
                                      setCustomNameInputs({
                                        ...customNameInputs,
                                        [slotKey]: e.target.value
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const val = (customNameInputs[slotKey] || '').trim();
                                        if (val) {
                                          handleAssignWithLoading(
                                            slotKey,
                                            slot.targetType,
                                            slot.targetId,
                                            slot.date,
                                            slot.slotIndex,
                                            slot.startTime,
                                            slot.endTime,
                                            val
                                          );
                                        }
                                        setShowCustomInput({ ...showCustomInput, [slotKey]: false });
                                      } else if (e.key === 'Escape') {
                                        setShowCustomInput({ ...showCustomInput, [slotKey]: false });
                                      }
                                    }}
                                    placeholder="Type name..."
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-accent bg-field text-main focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      const val = (customNameInputs[slotKey] || '').trim();
                                      if (val) {
                                        handleAssignWithLoading(
                                          slotKey,
                                          slot.targetType,
                                          slot.targetId,
                                          slot.date,
                                          slot.slotIndex,
                                          slot.startTime,
                                          slot.endTime,
                                          val
                                        );
                                      }
                                      setShowCustomInput({ ...showCustomInput, [slotKey]: false });
                                    }}
                                    className="p-1.5 bg-accent text-accent-contrast rounded-lg text-xs cursor-pointer hover:bg-accent-hover"
                                    title="Confirm"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() =>
                                      setShowCustomInput({ ...showCustomInput, [slotKey]: false })
                                    }
                                    className="p-1.5 text-mut hover:text-main rounded-lg text-xs cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <select
                                  disabled={isSaving}
                                  value={
                                    slot.assignment?.personId ||
                                    (slot.assignment?.personName ? '__custom__' : '')
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '__type_name__') {
                                      setShowCustomInput({ ...showCustomInput, [slotKey]: true });
                                      setCustomNameInputs({ ...customNameInputs, [slotKey]: '' });
                                    } else if (val === '__clear__') {
                                      handleAssignWithLoading(
                                        slotKey,
                                        slot.targetType,
                                        slot.targetId,
                                        slot.date,
                                        slot.slotIndex,
                                        slot.startTime,
                                        slot.endTime,
                                        ''
                                      );
                                    } else if (val === '__custom__') {
                                      // No-op
                                    } else {
                                      handleAssignWithLoading(
                                        slotKey,
                                        slot.targetType,
                                        slot.targetId,
                                        slot.date,
                                        slot.slotIndex,
                                        slot.startTime,
                                        slot.endTime,
                                        val
                                      );
                                    }
                                  }}
                                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-accent transition-colors cursor-pointer shadow-2xs disabled:opacity-60 ${
                                    isAssigned
                                      ? 'border-subtle bg-field text-main font-semibold'
                                      : 'border-dashed border-amber-400 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                                  }`}
                                >
                                  <option value="">-- Choose person --</option>
                                  {activeRolePeople.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                  {slot.assignment &&
                                    !slot.assignment.personId &&
                                    slot.assignment.personName && (
                                      <option value="__custom__">
                                        {slot.assignment.personName} (Custom)
                                      </option>
                                    )}
                                  <option value="__type_name__">+ Type a name...</option>
                                  {isAssigned && <option value="__clear__">-- Clear --</option>}
                                </select>
                              )}

                              {!isViewer && conflict && (
                                <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Also scheduled for {conflict.otherRoleName}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Popup Footer */}
            <div className="px-4 py-2.5 border-t border-subtle bg-surface flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="px-4 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold cursor-pointer transition-colors"
              >
                {isViewer ? 'Close' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
