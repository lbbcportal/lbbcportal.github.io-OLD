import {
  MessageTemplate,
  TemplateRoleLine,
  RegularService,
  ServiceOverride,
  ChurchEvent,
  OutlineNode,
  RoleAssignment,
  SentReminder
} from '../types';
import { parseDateString, toDateString, formatTime, formatDate } from './dateTime';

export interface OccurrenceItem {
  id: string; // `${type}_${sourceId}_${date}`
  type: 'regular_service' | 'event';
  sourceId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime?: string;
  location?: string;
  dayOfWeek: number;
  dayName: string;
  formattedDate: string;
  formattedTime: string;
  isCancelled: boolean;
}

export interface OutlineRoleOption {
  id: string;
  title: string;
  depth: number;
  fullPath: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Returns roles from People & Ministries in outline tree order.
 */
export function getFlatOutlineRoles(nodes: OutlineNode[]): OutlineRoleOption[] {
  const treeMap: Record<string, OutlineNode[]> = {};
  for (const n of nodes) {
    const p = n.parentId || 'root';
    if (!treeMap[p]) treeMap[p] = [];
    treeMap[p].push(n);
  }
  for (const k of Object.keys(treeMap)) {
    treeMap[k].sort((a, b) => a.order - b.order);
  }

  const result: OutlineRoleOption[] = [];
  const traverse = (parentId: string, depth: number, pathPrefix = '') => {
    const children = treeMap[parentId] || [];
    for (const child of children) {
      const fullPath = pathPrefix ? `${pathPrefix} > ${child.title}` : child.title;
      // Include all nodes or roles
      result.push({
        id: child.id,
        title: child.title,
        depth,
        fullPath
      });
      traverse(child.id, depth + 1, fullPath);
    }
  };

  traverse('root', 0);
  return result;
}

/**
 * Generates upcoming occurrences from a given start date for regular services and one-time events.
 */
export function getUpcomingOccurrences(
  regularServices: RegularService[],
  overrides: ServiceOverride[],
  events: ChurchEvent[],
  fromDateStr = toDateString(new Date()),
  daysAhead = 45
): OccurrenceItem[] {
  const items: OccurrenceItem[] = [];
  const fromDate = parseDateString(fromDateStr);

  // Generate for the next `daysAhead` days
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    const dateStr = toDateString(d);
    const dayOfWeek = d.getDay();
    const dayName = DAY_NAMES[dayOfWeek];

    // Regular services
    for (const s of regularServices) {
      if (s.daysOfWeek.includes(dayOfWeek)) {
        const override = overrides.find(o => o.serviceId === s.id && o.date === dateStr);
        if (override?.isCancelled) continue;

        const effectiveTitle = override?.name || s.name;
        const effectiveTime = override?.startTime || s.startTime;
        const effectiveEndTime = override?.endTime || s.endTime;
        const effectiveLoc = override?.location || s.location || '';

        items.push({
          id: `regular_service_${s.id}_${dateStr}`,
          type: 'regular_service',
          sourceId: s.id,
          title: effectiveTitle,
          date: dateStr,
          startTime: effectiveTime,
          endTime: effectiveEndTime,
          location: effectiveLoc,
          dayOfWeek,
          dayName,
          formattedDate: formatDate(dateStr, { month: 'long', day: 'numeric' }),
          formattedTime: formatTime(effectiveTime, '12h'),
          isCancelled: false,
        });
      }
    }

    // One-time events
    for (const ev of events) {
      if (ev.isTemplate) continue;
      if (ev.startDate === dateStr) {
        items.push({
          id: `event_${ev.id}_${dateStr}`,
          type: 'event',
          sourceId: ev.id,
          title: ev.title,
          date: dateStr,
          startTime: ev.startTime,
          endTime: ev.endTime,
          location: ev.location || '',
          dayOfWeek,
          dayName,
          formattedDate: formatDate(dateStr, { month: 'long', day: 'numeric' }),
          formattedTime: formatTime(ev.startTime, '12h'),
          isCancelled: false,
        });
      }
    }
  }

  // Sort by date ASC, then startTime ASC
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return items;
}

/**
 * Replace tokens in text:
 * {service}, {day}, {date}, {time}, {location}
 */
export function replaceTokens(text: string, occ: OccurrenceItem): string {
  if (!text) return '';
  return text
    .replace(/\{service\}/gi, occ.title)
    .replace(/\{day\}/gi, occ.dayName)
    .replace(/\{date\}/gi, occ.formattedDate)
    .replace(/\{time\}/gi, occ.formattedTime)
    .replace(/\{location\}/gi, occ.location || 'Church');
}

/**
 * Builds the full message string from template components, occurrence info, role values, and removed lines.
 */
export function buildMessageContent(
  headerText: string,
  roleLines: TemplateRoleLine[],
  closingText: string | undefined,
  occ: OccurrenceItem,
  roleValues: Record<string, string>,
  removedLineIds: Set<string>
): string {
  const parts: string[] = [];

  // 1. Header with tokens replaced
  const replacedHeader = replaceTokens(headerText, occ).trim();
  if (replacedHeader) {
    parts.push(replacedHeader);
  }

  // 2. Role lines
  const activeRoleLines = roleLines.filter(line => !removedLineIds.has(line.id));
  if (activeRoleLines.length > 0) {
    const roleTexts: string[] = [];
    for (const line of activeRoleLines) {
      const val = roleValues[line.id]?.trim();
      if (val) {
        roleTexts.push(`${line.label}: ${val}`);
      } else {
        roleTexts.push(`${line.label}: (Not assigned)`);
      }
    }
    if (roleTexts.length > 0) {
      parts.push(roleTexts.join('\n'));
    }
  }

  // 3. Closing text with tokens replaced
  if (closingText) {
    const replacedClosing = replaceTokens(closingText, occ).trim();
    if (replacedClosing) {
      parts.push(replacedClosing);
    }
  }

  return parts.join('\n\n');
}

export interface PendingReminder {
  template: MessageTemplate;
  occurrence: OccurrenceItem;
  dueDateStr: string;
  promptText: string;
}

/**
 * Evaluates which message templates have pending reminders right now.
 *
 * Rules:
 * - Template has `reminder?.enabled === true` and `linkedServiceId`.
 * - Find upcoming occurrences of the linked service.
 * - Calculate due date: `daysBefore` days before occurrence date.
 * - Reminder start time: `reminder.timeOfDay` (e.g. "09:00").
 * - Due when current time >= `dueDateTime` AND current time <= `occurrenceStartDateTime`.
 * - Stays visible until occurrence has passed.
 * - If already marked as sent in `sentReminders`, omit it.
 */
export function checkPendingReminders(
  templates: MessageTemplate[],
  regularServices: RegularService[],
  overrides: ServiceOverride[],
  sentReminders: SentReminder[],
  now = new Date()
): PendingReminder[] {
  const pending: PendingReminder[] = [];
  const todayStr = toDateString(now);

  // Look ahead up to 7 days from today
  const occurrences = getUpcomingOccurrences(
    regularServices,
    overrides,
    [],
    toDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000)), // start from yesterday in case today's service hasn't passed
    14
  );

  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  for (const template of templates) {
    if (!template.reminder?.enabled || !template.linkedServiceId) continue;

    const daysBefore = template.reminder.daysBefore ?? 0;
    const reminderTime = template.reminder.timeOfDay || '09:00';

    // Find occurrences of this linked service
    const matchingOccurrences = occurrences.filter(
      occ => occ.type === 'regular_service' && occ.sourceId === template.linkedServiceId
    );

    for (const occ of matchingOccurrences) {
      // Calculate due date (YYYY-MM-DD)
      const occDate = parseDateString(occ.date);
      const dueDate = new Date(occDate);
      dueDate.setDate(dueDate.getDate() - daysBefore);
      const dueDateStr = toDateString(dueDate);

      // Check if due has arrived:
      // If today is before dueDate, not due yet
      if (todayStr < dueDateStr) continue;

      // If today is the dueDate, check timeOfDay
      if (todayStr === dueDateStr && nowTimeStr < reminderTime) continue;

      // Check if occurrence has already passed:
      // If today is after occurrence date, it has passed
      if (todayStr > occ.date) continue;
      // If today is occurrence date, check if service has completed
      if (todayStr === occ.date && occ.startTime) {
        const effectiveEnd = occ.endTime || (() => {
          const [h, m] = occ.startTime.split(':').map(Number);
          return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
        })();
        if (nowTimeStr > effectiveEnd) {
          // Service has concluded
          continue;
        }
      }

      // Check if already marked as sent
      const isSent = sentReminders.some(
        s => s.templateId === template.id &&
             s.occurrenceDate === occ.date &&
             s.targetId === occ.sourceId
      );
      if (isSent) continue;

      // It is due!
      const todayDayName = DAY_NAMES[now.getDay()];
      const promptText = `Today is ${todayDayName}: send the ${template.name} reminder`;

      pending.push({
        template,
        occurrence: occ,
        dueDateStr,
        promptText,
      });

      // Only show the earliest pending occurrence for a given template
      break;
    }
  }

  return pending;
}
