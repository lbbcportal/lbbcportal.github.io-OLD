/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Task,
  TaskOccurrenceItem,
  TaskCategory,
  ChurchEvent,
  RegularService,
  ServiceOverride,
  TaskLink
} from '../types';
import { toDateString, formatTime } from './dateTime';

/**
 * Calculates the dynamic due date for a task linked to an event or service occurrence.
 * If linked to an event with date YYYY-MM-DD and daysBefore = 2, due date is 2 days before.
 * Follows the event date automatically if the event date changes.
 */
export function calculateLinkedDueDate(
  link: TaskLink,
  events: ChurchEvent[],
  regularServices: RegularService[]
): string | undefined {
  if (link.targetType === 'event') {
    const ev = events.find(e => e.id === link.targetId);
    if (!ev || !ev.startDate) return undefined;
    return subtractDaysFromDate(ev.startDate, link.daysBefore || 0);
  }

  if (link.targetType === 'regular_service') {
    if (link.targetOccurrenceDate) {
      return subtractDaysFromDate(link.targetOccurrenceDate, link.daysBefore || 0);
    }
  }

  return undefined;
}

/**
 * Helper to subtract N calendar days from a YYYY-MM-DD date string.
 */
export function subtractDaysFromDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

/**
 * Helper to add N calendar days to a YYYY-MM-DD date string.
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/**
 * Returns human-readable label for linked target (e.g. "Linked to Youth Camp (2 days before)")
 */
export function getTaskLinkInfo(
  link: TaskLink | undefined,
  events: ChurchEvent[],
  regularServices: RegularService[]
): { label: string; targetTitle: string; daysBefore: number; targetType: 'event' | 'regular_service' } | null {
  if (!link) return null;

  if (link.targetType === 'event') {
    const ev = events.find(e => e.id === link.targetId);
    const title = ev ? ev.title : 'Event';
    const daysLabel = link.daysBefore === 0 ? 'Day of event' : `${link.daysBefore}d before`;
    return {
      label: `${title} (${daysLabel})`,
      targetTitle: title,
      daysBefore: link.daysBefore || 0,
      targetType: 'event'
    };
  }

  if (link.targetType === 'regular_service') {
    const srv = regularServices.find(s => s.id === link.targetId);
    const title = srv ? srv.name : 'Regular Service';
    const daysLabel = link.daysBefore === 0 ? 'Day of service' : `${link.daysBefore}d before`;
    return {
      label: `${title} (${daysLabel})`,
      targetTitle: title,
      daysBefore: link.daysBefore || 0,
      targetType: 'regular_service'
    };
  }

  return null;
}

/**
 * Expands all tasks (both non-repeating and repeating) into their concrete occurrences.
 * For repeating tasks:
 * - Shows occurrences for the next 60 days
 * - Plus any past undone ones as overdue (checked against completedDates)
 * - Each occurrence has its own independent done state
 */
export function expandTaskOccurrences(
  tasks: Task[],
  regularServices: RegularService[],
  overrides: ServiceOverride[],
  events: ChurchEvent[],
  todayStr: string,
  horizonDays: number = 60,
  pastScanDays: number = 60
): TaskOccurrenceItem[] {
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const todayDate = new Date(tY, tM - 1, tD);

  const horizonDate = new Date(todayDate);
  horizonDate.setDate(horizonDate.getDate() + horizonDays);
  const horizonDateStr = toDateString(horizonDate);

  const pastStartDate = new Date(todayDate);
  pastStartDate.setDate(pastStartDate.getDate() - pastScanDays);
  const pastStartDateStr = toDateString(pastStartDate);

  const results: TaskOccurrenceItem[] = [];

  for (const task of tasks) {
    // 1. Resolve dynamic due date if linked to an event/service
    let effectiveBaseDueDate = task.dueDate;
    if (task.link) {
      const calc = calculateLinkedDueDate(task.link, events, regularServices);
      if (calc) {
        effectiveBaseDueDate = calc;
      }
    }

    const isRepeating = task.repeat && task.repeat.type && task.repeat.type !== 'none';

    if (!isRepeating) {
      // Non-repeating task
      const occDate = effectiveBaseDueDate || '';
      const isDone = task.status === 'done';
      const isOverdue = !isDone && !!occDate && occDate < todayStr;
      const isToday = !!occDate && occDate === todayStr;
      const isSnoozed = !!(task.snoozedUntil && task.snoozedUntil > todayStr);

      results.push({
        task,
        occurrenceDate: occDate,
        isDone,
        isOverdue,
        isToday,
        isSnoozed,
        effectiveDueDate: occDate
      });
      continue;
    }

    // 2. Repeating task
    const repeat = task.repeat!;
    const completedSet = new Set(task.completedDates || []);

    // Determine occurrences across [pastStartDate, horizonDate]
    const generatedDates: string[] = [];

    if (repeat.type === 'daily') {
      const cur = new Date(pastStartDate);
      while (cur <= horizonDate) {
        generatedDates.push(toDateString(cur));
        cur.setDate(cur.getDate() + 1);
      }
    } else if (repeat.type === 'weekly' && repeat.weekdays && repeat.weekdays.length > 0) {
      const weekdaysSet = new Set(repeat.weekdays);
      const cur = new Date(pastStartDate);
      while (cur <= horizonDate) {
        if (weekdaysSet.has(cur.getDay())) {
          generatedDates.push(toDateString(cur));
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else if (repeat.type === 'monthly' && repeat.monthDays && repeat.monthDays.length > 0) {
      // Month by month
      const startYear = pastStartDate.getFullYear();
      const endYear = horizonDate.getFullYear();

      for (let y = startYear; y <= endYear; y++) {
        for (let m = 0; m < 12; m++) {
          const lastDayOfMonth = new Date(y, m + 1, 0).getDate();

          for (const md of repeat.monthDays) {
            let dayNum: number;
            if (md === 'last') {
              dayNum = lastDayOfMonth;
            } else {
              dayNum = Math.min(Number(md), lastDayOfMonth);
            }

            const candidateDate = new Date(y, m, dayNum);
            const candStr = toDateString(candidateDate);
            if (candStr >= pastStartDateStr && candStr <= horizonDateStr) {
              generatedDates.push(candStr);
            }
          }
        }
      }
    } else if (repeat.type === 'yearly') {
      // Yearly on the same month & day as base due date or task creation
      const baseStr = effectiveBaseDueDate || task.createdAt.substring(0, 10);
      const [, bm, bd] = baseStr.split('-').map(Number);

      const startYear = pastStartDate.getFullYear();
      const endYear = horizonDate.getFullYear();

      for (let y = startYear; y <= endYear; y++) {
        const lastDayOfMonth = new Date(y, bm, 0).getDate();
        const dayNum = Math.min(bd || 1, lastDayOfMonth);
        const candidateDate = new Date(y, bm - 1, dayNum);
        const candStr = toDateString(candidateDate);
        if (candStr >= pastStartDateStr && candStr <= horizonDateStr) {
          generatedDates.push(candStr);
        }
      }
    } else if (repeat.type === 'service_occurrence' && repeat.serviceId) {
      // Every occurrence of regular service
      const targetService = regularServices.find(s => s.id === repeat.serviceId);
      if (targetService && targetService.daysOfWeek && targetService.daysOfWeek.length > 0) {
        const daysSet = new Set(targetService.daysOfWeek);
        const daysBefore = repeat.daysBefore || 0;

        // Scan dates where service would occur
        const scanStart = new Date(pastStartDate);
        scanStart.setDate(scanStart.getDate() - 7);
        const scanEnd = new Date(horizonDate);
        scanEnd.setDate(scanEnd.getDate() + 14);

        const cur = new Date(scanStart);
        while (cur <= scanEnd) {
          const curStr = toDateString(cur);
          if (daysSet.has(cur.getDay())) {
            // Check cancellation override
            const override = overrides.find(o => o.serviceId === targetService.id && o.date === curStr);
            if (!override?.isCancelled) {
              const taskDueDate = subtractDaysFromDate(curStr, daysBefore);
              if (taskDueDate >= pastStartDateStr && taskDueDate <= horizonDateStr) {
                generatedDates.push(taskDueDate);
              }
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    // Deduplicate and sort dates
    const uniqueDates = Array.from(new Set(generatedDates)).sort();

    for (const occDate of uniqueDates) {
      const isDone = completedSet.has(occDate);
      const isPast = occDate < todayStr;

      // Filter: Show occurrences for the next 60 days, plus any past undone ones as overdue.
      // If it is in the past and already done, we keep only if within recent window (e.g. past 14 days) so Done tab has history
      if (isPast && isDone) {
        const twoWeeksAgo = new Date(todayDate);
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        if (occDate < toDateString(twoWeeksAgo)) {
          continue;
        }
      }

      const isOverdue = !isDone && isPast;
      const isToday = occDate === todayStr;
      const isSnoozed = !!(task.snoozedUntil && task.snoozedUntil > todayStr);

      results.push({
        task,
        occurrenceDate: occDate,
        isDone,
        isOverdue,
        isToday,
        isSnoozed,
        effectiveDueDate: occDate
      });
    }
  }

  return results;
}

/**
 * Standard palette for task categories.
 */
export const TASK_CATEGORY_COLORS = [
  '#0284c7', // Glacier blue
  '#881337', // Maroon
  '#2e6f40', // Sage green
  '#c2410c', // Orange
  '#7c3aed', // Purple
  '#d97706', // Amber / Gold
  '#0d9488', // Teal
  '#db2777', // Pink
  '#475569'  // Slate
];

/**
 * Format due date and time for display
 */
export function formatDueDisplay(
  dueDate?: string,
  dueTime?: string,
  todayStr: string = toDateString(new Date())
): { label: string; isOverdue: boolean; isToday: boolean } {
  if (!dueDate) {
    return { label: 'No due date', isOverdue: false, isToday: false };
  }

  const isToday = dueDate === todayStr;
  const isOverdue = dueDate < todayStr;

  let timePart = '';
  if (dueTime) {
    timePart = ` at ${formatTime(dueTime, '12h')}`;
  }

  if (isToday) {
    return { label: `Today${timePart}`, isOverdue: false, isToday: true };
  }

  // Format date e.g. "Nov 12"
  const [y, m, d] = dueDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const yearPart = y !== new Date().getFullYear() ? `, ${y}` : '';

  if (isOverdue) {
    return { label: `Overdue: ${monthName}${yearPart}${timePart}`, isOverdue: true, isToday: false };
  }

  return { label: `${monthName}${yearPart}${timePart}`, isOverdue: false, isToday: false };
}
