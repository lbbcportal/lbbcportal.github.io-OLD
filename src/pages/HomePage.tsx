import React, { useState, useMemo } from 'react';
import {
  Clock,
  MapPin,
  Plus,
  ArrowUpRight,
  Sparkles,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Cake,
  Calendar,
  AlertCircle,
  Bell,
  Send,
  Check,
  MessageSquare,
  CalendarPlus,
  CheckSquare,
  Circle,
  Moon,
  UserCheck,
  Inbox,
  Database
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  formatTime,
  formatDate,
  getDaysOfWeekRange,
  toDateString,
  getRecurringDates
} from '../lib/dateTime';
import { isLastBackupOlderThanDays } from '../lib/backupExport';
import { CalendarOccurrence, ChurchEvent, Person, MessageTemplate, Task, TaskOccurrenceItem } from '../types';
import { OccurrenceDetailsModal } from '../components/OccurrenceDetailsModal';
import { DayDetailsModal } from '../components/DayDetailsModal';
import { BannerClock } from '../components/BannerClock';
import { CompactMonthCalendar } from '../components/CompactMonthCalendar';
import { HomeQuickNotesRow } from '../components/HomeQuickNotesRow';
import { renderRoleIcon, isImportantRole } from '../lib/roleIcons';
import { getDailyVerse } from '../lib/dailyVerses';
import { checkPendingReminders, OccurrenceItem } from '../lib/templateHelpers';
import { WriteMessageModal } from '../components/WriteMessageModal';
import { EventFormModal } from '../components/EventFormModal';
import { expandTaskOccurrences, addDaysToDate } from '../lib/taskHelpers';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { SnoozeModal } from '../components/SnoozeModal';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

interface HomePageProps {
  onNavigate: (tab: string) => void;
  onOpenVisitorsToFollowUp?: () => void;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onOpenVisitorsToFollowUp }) => {
  const { isViewer } = useAuth();
  const {
    settings,
    bannerImage,
    regularServices,
    events,
    overrides,
    assignments,
    nodes,
    people,
    messageTemplates,
    sentReminders,
    markReminderSent,
    tasks,
    taskCategories,
    toggleTaskDone,
    snoozeTask,
    visitors,
    viewerNotes,
    dataLoading
  } = useData();

  // Selected occurrence for the details popup
  const [selectedOccurrence, setSelectedOccurrence] = useState<CalendarOccurrence | null>(null);

  // Selected date for day details popup from the compact calendar
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);

  // Reminder Write Modal state
  const [activeReminderTemplate, setActiveReminderTemplate] = useState<MessageTemplate | null>(null);
  const [activeReminderOccurrence, setActiveReminderOccurrence] = useState<OccurrenceItem | null>(null);
  const [writeReminderModalOpen, setWriteReminderModalOpen] = useState(false);

  // Create Event modal state
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);

  // Task modals state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [snoozeTaskTarget, setSnoozeTaskTarget] = useState<Task | null>(null);
  const [savingReminderKey, setSavingReminderKey] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateString(today), [today]);

  // Compute pending message reminders due right now
  const pendingReminders = useMemo(() => {
    if (isViewer) return [];
    return checkPendingReminders(
      messageTemplates,
      regularServices,
      overrides,
      sentReminders,
      new Date()
    );
  }, [isViewer, messageTemplates, regularServices, overrides, sentReminders]);

  const handleOpenWriteReminder = (template: MessageTemplate, occ: OccurrenceItem) => {
    setActiveReminderTemplate(template);
    setActiveReminderOccurrence(occ);
    setWriteReminderModalOpen(true);
  };

  const handleMarkReminderSent = async (templateId: string, occurrenceDate: string, targetId: string) => {
    const key = `${templateId}_${occurrenceDate}`;
    setSavingReminderKey(key);
    try {
      await markReminderSent(templateId, occurrenceDate, targetId);
    } catch (err) {
      console.error('Failed to mark reminder sent', err);
    } finally {
      setSavingReminderKey(null);
    }
  };

  // Daily Bible Verse (changes every day based on day of the year)
  const dailyVerse = useMemo(() => getDailyVerse(today), [today]);

  const nowTimeStr = useMemo(() => {
    return `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  }, [today]);

  // Next up to 3 upcoming regular service occurrences (sorted by date & time, not limited to this week, skip ended/cancelled)
  const upcomingServices = useMemo<CalendarOccurrence[]>(() => {
    const list: CalendarOccurrence[] = [];

    // Look ahead 60 days
    for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
      const dateStr = toDateString(d);
      const dayOfWeek = d.getDay();

      for (const service of regularServices) {
        if (!service.daysOfWeek.includes(dayOfWeek)) continue;
        const override = overrides.find(o => o.serviceId === service.id && o.date === dateStr);
        if (override?.isCancelled) continue;

        const effectiveStart = override?.startTime || service.startTime;
        const effectiveEnd = override?.endTime || service.endTime;

        // If today: check if service has already ended
        if (dateStr === todayStr && effectiveStart) {
          const serviceEndTime = effectiveEnd || (() => {
            const [h, m] = effectiveStart.split(':').map(Number);
            return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
          })();
          if (nowTimeStr > serviceEndTime) {
            // Service already ended earlier today
            continue;
          }
        }

        list.push({
          type: 'regular_service',
          sourceId: service.id,
          title: override?.name || service.name,
          date: dateStr,
          startTime: effectiveStart,
          endTime: effectiveEnd,
          location: override?.location || service.location,
          notes: override?.notes || service.notes,
          color: service.color,
          requiredRoles: service.requiredRoles || [],
          isOverridden: !!override,
          overrideId: override?.id,
          isCancelled: false,
          serviceKind: service.kind === 'activity' ? 'activity' : 'service'
        });
      }
    }

    // Sort by date ASC, then startTime ASC
    list.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.startTime.localeCompare(b.startTime);
    });

    return list.slice(0, 3);
  }, [regularServices, overrides, todayStr, nowTimeStr, today]);

  // Next 1 upcoming one-time event that has not ended yet
  const upcomingEvent = useMemo<CalendarOccurrence | null>(() => {
    const validEvents: CalendarOccurrence[] = [];

    for (const ev of events) {
      if (ev.isTemplate) continue;
      if (ev.startDate < todayStr) continue;

      if (ev.startDate === todayStr && ev.startTime) {
        const eventEndTime = ev.endTime || (() => {
          const [h, m] = ev.startTime.split(':').map(Number);
          return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
        })();
        if (nowTimeStr > eventEndTime) {
          // Already ended earlier today
          continue;
        }
      }

      validEvents.push({
        type: 'event',
        sourceId: ev.id,
        title: ev.title,
        date: ev.startDate,
        startTime: ev.startTime,
        endTime: ev.endTime,
        location: ev.location,
        notes: ev.notes,
        color: ev.color,
        category: ev.category,
        requiredRoles: ev.requiredRoles || []
      });
    }

    validEvents.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.startTime.localeCompare(b.startTime);
    });

    return validEvents[0] || null;
  }, [events, todayStr, nowTimeStr]);

  // ---------------- 2. NEEDS ATTENTION (UNASSIGNED ROLES IN NEXT 14 DAYS) ----------------
  const needsAttentionGroups = useMemo(() => {
    if (isViewer) {
      return { totalCount: 0, groups: [] as { date: string; dayTitle: string; items: any[] }[] };
    }
    interface UnassignedItem {
      date: string;
      targetType: 'regular_service' | 'event';
      targetId: string;
      targetName: string;
      targetColor: string;
      startTime: string;
      roleId: string;
      roleName: string;
      roleNode: any;
      slotIndex: number;
      occurrence: CalendarOccurrence;
    }

    const items: UnassignedItem[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Generate dates for next 14 days starting from today
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
      const dateStr = toDateString(checkDate);
      const dayOfWeek = checkDate.getDay();

      // Check regular services
      for (const service of regularServices) {
        if (!service.daysOfWeek.includes(dayOfWeek)) continue;
        const override = overrides.find(o => o.serviceId === service.id && o.date === dateStr);
        if (override?.isCancelled) continue;

        const effectiveName = override?.name || service.name;
        const effectiveStart = override?.startTime || service.startTime;
        const effectiveEnd = override?.endTime || service.endTime;
        const effectiveLocation = override?.location || service.location;
        const effectiveNotes = override?.notes || service.notes;

        const occurrence: CalendarOccurrence = {
          type: 'regular_service',
          sourceId: service.id,
          title: effectiveName,
          date: dateStr,
          startTime: effectiveStart,
          endTime: effectiveEnd,
          location: effectiveLocation,
          notes: effectiveNotes,
          color: service.color,
          requiredRoles: service.requiredRoles || [],
          isOverridden: !!override,
          overrideId: override?.id,
          isCancelled: false,
          serviceKind: service.kind === 'activity' ? 'activity' : 'service'
        };

        for (const spec of service.requiredRoles || []) {
          for (let slot = 0; slot < spec.count; slot++) {
            const hasAssignment = assignments.some(
              a => a.targetId === service.id &&
                   a.date === dateStr &&
                   a.roleId === spec.roleId &&
                   (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null))) &&
                   !!a.personName
            );

            if (!hasAssignment) {
              items.push({
                date: dateStr,
                targetType: 'regular_service',
                targetId: service.id,
                targetName: effectiveName,
                targetColor: service.color,
                startTime: effectiveStart,
                roleId: spec.roleId,
                roleName: spec.roleName,
                roleNode: nodeMap.get(spec.roleId),
                slotIndex: slot,
                occurrence
              });
            }
          }
        }
      }

      // Check one-time events
      for (const ev of events) {
        if (ev.isTemplate) continue;
        if (ev.startDate !== dateStr) continue;

        const occurrence: CalendarOccurrence = {
          type: 'event',
          sourceId: ev.id,
          title: ev.title,
          date: ev.startDate,
          startTime: ev.startTime,
          endTime: ev.endTime,
          location: ev.location,
          notes: ev.notes,
          color: ev.color,
          category: ev.category,
          requiredRoles: ev.requiredRoles || []
        };

        for (const spec of ev.requiredRoles || []) {
          for (let slot = 0; slot < spec.count; slot++) {
            const hasAssignment = assignments.some(
              a => a.targetId === ev.id &&
                   a.date === dateStr &&
                   a.roleId === spec.roleId &&
                   (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null))) &&
                   !!a.personName
            );

            if (!hasAssignment) {
              items.push({
                date: dateStr,
                targetType: 'event',
                targetId: ev.id,
                targetName: ev.title,
                targetColor: ev.color,
                startTime: ev.startTime,
                roleId: spec.roleId,
                roleName: spec.roleName,
                roleNode: nodeMap.get(spec.roleId),
                slotIndex: slot,
                occurrence
              });
            }
          }
        }
      }
    }

    // Group items by date
    const groups: { date: string; dayTitle: string; items: UnassignedItem[] }[] = [];
    const dateMap = new Map<string, UnassignedItem[]>();

    for (const item of items) {
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, []);
      }
      dateMap.get(item.date)!.push(item);
    }

    for (const [date, dateItems] of dateMap.entries()) {
      groups.push({
        date,
        dayTitle: formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' }),
        items: dateItems
      });
    }

    return {
      totalCount: items.length,
      groups
    };
  }, [isViewer, today, regularServices, overrides, events, assignments, nodes]);

  // ---------------- NEEDS ATTENTION TASKS ----------------
  // Overdue, due today, or due in next 3 days, not snoozed, not done
  const needsAttentionTasks = useMemo(() => {
    if (isViewer) return [];
    const horizon = addDaysToDate(todayStr, 3);
    const expanded = expandTaskOccurrences(tasks, regularServices, overrides, events, todayStr, 14, 60);

    const filtered = expanded.filter(item => {
      if (item.isDone) return false;
      if (item.isSnoozed) return false;
      if (!item.occurrenceDate) return false;
      if (item.isOverdue) return true;
      if (item.isToday) return true;
      if (item.occurrenceDate > todayStr && item.occurrenceDate <= horizon) return true;
      return false;
    });

    filtered.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isToday && !b.isToday) return -1;
      if (!a.isToday && b.isToday) return 1;
      return a.occurrenceDate.localeCompare(b.occurrenceDate);
    });

    return filtered;
  }, [isViewer, tasks, regularServices, overrides, events, todayStr]);

  const overdueAndTodayCount = useMemo(() => {
    return needsAttentionTasks.filter(t => t.isOverdue || t.isToday).length;
  }, [needsAttentionTasks]);

  const visitorsToFollowUpCount = useMemo(() => {
    return visitors.filter(v => v.followUpStatus === 'To follow up').length;
  }, [visitors]);

  const newViewerNotesCount = useMemo(() => {
    if (isViewer) return 0;
    return viewerNotes.filter(n => n.status !== 'done').length;
  }, [isViewer, viewerNotes]);

  const backupDue = !isViewer && isLastBackupOlderThanDays(30);

  const totalNeedsAttentionCount = useMemo(() => {
    return needsAttentionGroups.totalCount + overdueAndTodayCount + visitorsToFollowUpCount + newViewerNotesCount + (backupDue ? 1 : 0);
  }, [needsAttentionGroups.totalCount, overdueAndTodayCount, visitorsToFollowUpCount, newViewerNotesCount, backupDue]);

  // ---------------- 3. BIRTHDAYS THIS MONTH ----------------
  const birthdaysThisMonth = useMemo(() => {
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const isLeap = isLeapYear(currentYear);
    const todayDay = today.getDate();

    const matches: (Person & { displayDay: number; isToday: boolean })[] = [];

    for (const p of people) {
      if (!p.birthdayMonth || !p.birthdayDay) continue;

      let bDay = p.birthdayDay;
      let matchesMonth = p.birthdayMonth === currentMonth;

      // Feb 29 in non-leap year falls on Feb 28
      if (!isLeap && currentMonth === 2 && p.birthdayMonth === 2 && p.birthdayDay === 29) {
        bDay = 28;
        matchesMonth = true;
      }

      if (matchesMonth) {
        const isToday = currentMonth === (today.getMonth() + 1) && bDay === todayDay;
        matches.push({
          ...p,
          displayDay: bDay,
          isToday
        });
      }
    }

    // Sort by day of month, then by name
    matches.sort((a, b) => {
      const cmpDay = a.displayDay - b.displayDay;
      if (cmpDay !== 0) return cmpDay;
      return a.name.localeCompare(b.name);
    });

    return matches;
  }, [people, today]);

  // Occurrences for selectedDayDate (when clicking a date on the compact calendar)
  const selectedDayOccurrences = useMemo(() => {
    if (!selectedDayDate) return [];
    const dateStr = toDateString(selectedDayDate);
    const dayOfWeek = selectedDayDate.getDay();

    const list: CalendarOccurrence[] = [];

    // Regular services
    for (const service of regularServices) {
      if (service.daysOfWeek.includes(dayOfWeek)) {
        const override = overrides.find(o => o.serviceId === service.id && o.date === dateStr);
        list.push({
          type: 'regular_service',
          sourceId: service.id,
          title: override?.name || service.name,
          date: dateStr,
          startTime: override?.startTime || service.startTime,
          endTime: override?.endTime || service.endTime,
          location: override?.location || service.location,
          notes: override?.notes || service.notes,
          color: service.color,
          requiredRoles: service.requiredRoles || [],
          isOverridden: !!override,
          overrideId: override?.id,
          isCancelled: !!override?.isCancelled,
          serviceKind: service.kind === 'activity' ? 'activity' : 'service'
        });
      }
    }

    // Events
    for (const ev of events) {
      if (ev.isTemplate) continue;
      if (ev.startDate === dateStr) {
        list.push({
          type: 'event',
          sourceId: ev.id,
          title: ev.title,
          date: ev.startDate,
          startTime: ev.startTime,
          endTime: ev.endTime,
          location: ev.location,
          notes: ev.notes,
          color: ev.color,
          category: ev.category,
          requiredRoles: ev.requiredRoles || []
        });
      }
    }

    return list;
  }, [selectedDayDate, regularServices, overrides, events]);

  // Birthdays for selectedDayDate
  const selectedDayBirthdays = useMemo(() => {
    if (!selectedDayDate) return [];
    const month = selectedDayDate.getMonth() + 1;
    const day = selectedDayDate.getDate();
    const isLeap = isLeapYear(selectedDayDate.getFullYear());

    return people.filter(p => {
      if (!p.birthdayMonth || !p.birthdayDay) return false;
      if (p.birthdayMonth === month && p.birthdayDay === day) return true;
      if (!isLeap && month === 2 && day === 28 && p.birthdayMonth === 2 && p.birthdayDay === 29) {
        return true;
      }
      return false;
    });
  }, [selectedDayDate, people]);

  const activeBannerUrl = bannerImage || settings.bannerImage;

  if (dataLoading.home) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PageLoading />
      </div>
    );
  }

  const isBlackBannerText = settings.clockColor === 'black';
  const bannerTextShadowStyle: React.CSSProperties = {
    textShadow: isBlackBannerText
      ? '0 0 12px rgba(255, 255, 255, 0.85), 0 1px 4px rgba(255, 255, 255, 0.7)'
      : '0 2px 10px rgba(0, 0, 0, 0.65), 0 1px 3px rgba(0, 0, 0, 0.5)'
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 motion-page-enter viewer-home-page">
      {/* =========================================================================
          1. BANNER WITH CLOCK
         ========================================================================= */}
      <div
        className={`relative overflow-hidden rounded-3xl border border-subtle shadow-card ${
          isBlackBannerText ? 'text-black' : 'text-white'
        } min-h-[260px] sm:min-h-[340px] flex flex-col justify-center viewer-home-section viewer-home-s1`}
      >
        {/* Banner Background Image or Plain Accent-Tinted Surface */}
        {activeBannerUrl ? (
          <img
            src={activeBannerUrl}
            alt={settings.churchName}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-surface">
            <div className="absolute inset-0 w-full h-full bg-accent-tint-strong" />
          </div>
        )}

        {/* Banner Content Layout: Verse Title + Verse on Left, Centered Clock on Right */}
        <div className="relative z-10 p-6 sm:p-8 lg:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 h-full my-auto">
          {/* Verse Title & Daily Verse on Left */}
          <div className="space-y-2.5 sm:space-y-3 max-w-xl" style={bannerTextShadowStyle}>
            {!isViewer && (
              <div
                className={`flex items-center gap-2 text-xs uppercase tracking-wider font-semibold ${
                  isBlackBannerText ? 'text-black/80' : 'text-white/85'
                }`}
              >
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    isBlackBannerText ? 'text-black/85' : 'text-white/90'
                  }`}
                />
                <span>Secretary Companion Workspace</span>
              </div>
            )}
            <h1
              key={dailyVerse.reference}
              className={`home-greeting-enter ${
                isViewer
                  ? 'text-[1.95rem] sm:text-[2.95rem] lg:text-[3.9rem]'
                  : 'text-[1.75rem] sm:text-[2.6rem] lg:text-[3.45rem]'
              } font-medium tracking-tight leading-[1.12] ${
                isBlackBannerText ? 'text-black' : 'text-white'
              }`}
            >
              {dailyVerse.title}
            </h1>
            {settings.showDailyVerse !== false && (
              <div className="pt-1 space-y-1 max-w-xl">
                <blockquote
                  className={`text-sm sm:text-base font-serif italic leading-relaxed ${
                    isBlackBannerText ? 'text-black/90' : 'text-white/95'
                  }`}
                >
                  &ldquo;{dailyVerse.text}&rdquo;
                </blockquote>
                <div
                  className={`text-xs sm:text-sm font-semibold tracking-wide ${
                    isBlackBannerText ? 'text-black/80' : 'text-white/85'
                  }`}
                >
                  — {dailyVerse.reference} (KJV)
                </div>
              </div>
            )}
          </div>

          {/* Clock centered vertically on Right */}
          <div className="w-full sm:w-auto shrink-0 flex items-center justify-center">
            <BannerClock />
          </div>
        </div>
      </div>

      {/* =========================================================================
          REMINDERS PANEL (near top of dashboard below banner)
          Appears when reminders for message templates are due. Hidden if none pending.
         ========================================================================= */}
      {!isViewer && pendingReminders.length > 0 && (
        <div className="rounded-2xl border border-amber-300/80 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 shadow-card p-4 sm:p-5 space-y-3 motion-notice-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-main">
                  Service Reminders ({pendingReminders.length})
                </h2>
                <p className="text-[11px] text-mut">
                  Automated service notifications ready to review and send
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('message-templates')}
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Templates</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {pendingReminders.map(({ template, occurrence, promptText }) => (
              <div
                key={`${template.id}_${occurrence.date}`}
                className="p-3.5 rounded-xl border border-subtle bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:border-accent/30 transition-all"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-main truncate">
                      {promptText}
                    </p>
                    <p className="text-[11px] text-mut flex items-center gap-2 mt-0.5">
                      <span>{occurrence.dayName}, {occurrence.formattedDate}</span>
                      <span>•</span>
                      <span>{occurrence.formattedTime}</span>
                      {occurrence.location && (
                        <>
                          <span>•</span>
                          <span className="truncate">{occurrence.location}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleOpenWriteReminder(template, occurrence)}
                    className="px-3.5 py-1.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-accent-contrast" />
                    <span>Write message</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingReminderKey === `${template.id}_${occurrence.date}`}
                    onClick={() => handleMarkReminderSent(template.id, occurrence.date, occurrence.sourceId)}
                    className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Mark this reminder as sent and dismiss"
                  >
                    {savingReminderKey === `${template.id}_${occurrence.date}` ? (
                      <>
                        <Spinner size="xs" variant="accent" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Mark as sent</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          2. QUICK NOTES ROW (Secretary only: Add a quick note + Recent notes)
         ========================================================================= */}
      {!isViewer && <HomeQuickNotesRow onNavigate={onNavigate} />}

      {/* =========================================================================
          3. MONTHLY CALENDAR (60%) & BIRTHDAYS THIS MONTH (40%)
             - Desktop (lg+): Side by side in one row, equal height
             - Tablets & Phones: Stacked (Calendar first, then Birthdays)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 lg:gap-6 lg:items-stretch viewer-home-section viewer-home-s2">
        {/* LEFT (60%): Compact Month Calendar */}
        <div className="lg:col-span-3">
          <CompactMonthCalendar
            people={people}
            selectedDate={selectedDayDate}
            onSelectDay={(d) => setSelectedDayDate(d)}
            onFullView={() => onNavigate('calendar')}
          />
        </div>

        {/* RIGHT (40%): Birthdays This Month (scrolls inside box if longer than calendar) */}
        <div className="lg:col-span-2 relative">
          <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 sm:p-5 flex flex-col lg:absolute lg:inset-0 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 pb-2.5 border-b border-subtle">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-pink-100 text-pink-600 dark:bg-pink-950/60 dark:text-pink-400 shrink-0">
                  <Cake className="w-4 h-4" />
                </div>
                <h2 className="text-sm sm:text-base font-bold text-main tracking-tight truncate">
                  Birthdays This Month
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-pink-100 dark:bg-pink-950/60 text-pink-800 dark:text-pink-300 border border-pink-300 dark:border-pink-800 shrink-0">
                  {birthdaysThisMonth.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('people-ministries')}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>Members List</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {birthdaysThisMonth.length === 0 ? (
              <div className="mt-3 flex-1 flex items-center justify-center p-6 text-center text-xs text-mut bg-subtle/50 rounded-xl border border-subtle">
                No birthdays this month.
              </div>
            ) : (
              <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto pr-1 space-y-1.5 max-h-[340px] lg:max-h-none viewer-stagger-rows">
                {birthdaysThisMonth.map((person) => {
                  const monthShort = today.toLocaleDateString(undefined, { month: 'short' });

                  return (
                    <div
                      key={person.id}
                      className={`px-2.5 py-2 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                        person.isToday
                          ? 'border-pink-300 dark:border-pink-800 bg-pink-50/40 dark:bg-pink-950/30 ring-1 ring-pink-400/40 shadow-2xs'
                          : 'border-subtle bg-surface hover:bg-subtle/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                          person.isToday
                            ? 'bg-pink-500 text-white shadow-2xs'
                            : 'bg-subtle text-sec border border-subtle'
                        }`}>
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-semibold text-main truncate">
                            {person.name}
                          </span>
                          {person.isToday && (
                            <span title="Celebrating Today!" className="shrink-0">
                              <Cake className="w-3.5 h-3.5 text-pink-500" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border tabular-nums ${
                          person.isToday
                            ? 'bg-pink-500 text-white border-pink-500'
                            : 'bg-subtle text-sec border-subtle'
                        }`}>
                          {monthShort} {person.displayDay}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. UPCOMING (Horizontal row of up to 4 cards: 3 services + 1 event)
         ========================================================================= */}
      <div className="space-y-4 viewer-home-section viewer-home-s3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-main tracking-tight">
              Upcoming
            </h2>
            <p className="text-xs text-sec mt-0.5">
              Live schedule of regular church services and upcoming events
            </p>
          </div>
          <button
            onClick={() => onNavigate('calendar')}
            className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Open Calendar</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch viewer-stagger-cards">
          {/* Regular Service Cards (Up to 3 next occurrences across future weeks) */}
          {upcomingServices.map((occ, idx) => {
            const isToday = occ.date === todayStr;
            const occAssignments = assignments.filter(
              a => a.targetId === occ.sourceId && a.date === occ.date
            );

            const importantRoles = (occ.requiredRoles || [])
              .map(r => {
                const node = nodes.find(n => n.id === r.roleId);
                return {
                  spec: r,
                  node,
                  icon: node?.icon
                };
              })
              .filter(item => isImportantRole(item.node));

            return (
              <div
                key={`${occ.sourceId}_${occ.date}_${idx}`}
                onClick={() => setSelectedOccurrence(occ)}
                className={`p-4 sm:p-5 rounded-2xl bg-surface border motion-card cursor-pointer hover:shadow-card hover:border-strong flex flex-col justify-between ${
                  isToday ? 'border-accent ring-1 ring-accent/30' : 'border-subtle'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                        {isToday ? 'Today · ' : ''}
                        {formatDate(occ.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      {occ.serviceKind === 'activity' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-accent-tint text-accent uppercase tracking-wider">
                          Activity
                        </span>
                      )}
                    </div>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: occ.color || 'var(--accent-base)' }}
                      title="Service color"
                    />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-main line-clamp-1">
                      {occ.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-sec mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-mut shrink-0" />
                        <span className="tabular-nums">
                          {formatTime(occ.startTime, settings.timeFormat)}
                          {occ.endTime ? ` - ${formatTime(occ.endTime, settings.timeFormat)}` : ''}
                        </span>
                      </span>
                      {occ.location && (
                        <span className="flex items-center gap-1 truncate max-w-[120px]">
                          <MapPin className="w-3.5 h-3.5 text-mut shrink-0" />
                          <span className="truncate">{occ.location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {importantRoles.length > 0 && (
                    <div className="pt-2.5 border-t border-subtle space-y-1.5">
                      <span className="text-[11px] font-semibold text-mut uppercase tracking-wider block">
                        Key Roles
                      </span>
                      <div className="space-y-1">
                        {importantRoles.map(({ spec, icon }, rIdx) => {
                          const assignedToRole = occAssignments.filter(a => a.roleId === spec.roleId);
                          const assignedNames = assignedToRole.map(a => a.personName).join(', ');

                          return (
                            <div key={rIdx} className="text-xs flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-accent shrink-0">
                                  {renderRoleIcon(icon, 'w-3.5 h-3.5')}
                                </span>
                                <span className="font-medium text-sec truncate max-w-[110px]">
                                  {spec.roleName}:
                                </span>
                              </div>
                              <span className={`truncate max-w-[110px] text-right ${
                                assignedNames ? 'text-main font-semibold' : 'text-mut italic'
                              }`}>
                                {assignedNames || 'Unassigned'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 mt-3 border-t border-subtle/60 text-[11px] text-mut flex items-center justify-between">
                  <span>{occ.serviceKind === 'activity' ? 'Regular Activity' : 'Regular Service'}</span>
                  <span className="text-accent font-medium hover:underline">{isViewer ? 'View Details →' : 'Details & Rosters →'}</span>
                </div>
              </div>
            );
          })}

          {/* If no regular services upcoming at all, show helpful guidance */}
          {upcomingServices.length === 0 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 p-6 rounded-2xl bg-surface border border-subtle flex flex-col justify-center items-center text-center space-y-3">
              <CalendarDays className="w-8 h-8 text-mut mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-main">No regular services or activities scheduled</h4>
                <p className="text-xs text-sec max-w-sm mt-1">
                  {isViewer
                    ? 'Upcoming worship services and weekly church activities will appear here once scheduled.'
                    : 'Regular weekly services and activities can be added under Services & Schedules and will appear here automatically.'}
                </p>
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => onNavigate('regular-services')}
                  className="px-3.5 py-1.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Regular Service</span>
                </button>
              )}
            </div>
          )}

          {/* 4th SLOT: Upcoming One-Time Event (or Empty Event Card) */}
          {upcomingEvent ? (() => {
            const isToday = upcomingEvent.date === todayStr;
            const eventAssignments = assignments.filter(
              a => a.targetId === upcomingEvent.sourceId && a.date === upcomingEvent.date
            );

            return (
              <div
                onClick={() => setSelectedOccurrence(upcomingEvent)}
                className={`p-4 sm:p-5 rounded-2xl bg-surface border motion-card cursor-pointer hover:shadow-card hover:border-strong flex flex-col justify-between ${
                  isToday ? 'border-accent ring-1 ring-accent/30' : 'border-subtle'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                        {isToday ? 'Today · ' : ''}
                        {formatDate(upcomingEvent.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-tint text-accent uppercase tracking-wider">
                        Event
                      </span>
                    </div>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: upcomingEvent.color || 'var(--accent-base)' }}
                      title="Event color"
                    />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-main line-clamp-1">
                      {upcomingEvent.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-sec mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-mut shrink-0" />
                        <span className="tabular-nums">
                          {formatTime(upcomingEvent.startTime, settings.timeFormat)}
                          {upcomingEvent.endTime ? ` - ${formatTime(upcomingEvent.endTime, settings.timeFormat)}` : ''}
                        </span>
                      </span>
                      {upcomingEvent.location && (
                        <span className="flex items-center gap-1 truncate max-w-[120px]">
                          <MapPin className="w-3.5 h-3.5 text-mut shrink-0" />
                          <span className="truncate">{upcomingEvent.location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {upcomingEvent.requiredRoles && upcomingEvent.requiredRoles.length > 0 ? (
                    <div className="pt-2.5 border-t border-subtle space-y-1.5">
                      <span className="text-[11px] font-semibold text-mut uppercase tracking-wider block">
                        Roster ({eventAssignments.length}/{upcomingEvent.requiredRoles.reduce((s, r) => s + r.count, 0)})
                      </span>
                      <div className="space-y-1">
                        {upcomingEvent.requiredRoles.slice(0, 3).map((r, rIdx) => {
                          const assignedToRole = eventAssignments.filter(a => a.roleId === r.roleId);
                          const assignedNames = assignedToRole.map(a => a.personName).join(', ');
                          return (
                            <div key={rIdx} className="text-xs flex items-center justify-between text-sec">
                              <span className="font-medium truncate max-w-[110px]">{r.roleName}:</span>
                              <span className={`truncate max-w-[110px] text-right ${assignedNames ? 'text-main font-semibold' : 'text-mut italic'}`}>
                                {assignedNames || 'Unassigned'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    upcomingEvent.notes && (
                      <div className="pt-2.5 border-t border-subtle">
                        <p className="text-xs text-sec line-clamp-2 italic">
                          "{upcomingEvent.notes}"
                        </p>
                      </div>
                    )
                  )}
                </div>

                <div className="pt-3 mt-3 border-t border-subtle/60 text-[11px] text-mut flex items-center justify-between">
                  <span className="font-medium text-accent">One-Time Event</span>
                  <span className="text-accent font-medium hover:underline">Details →</span>
                </div>
              </div>
            );
          })() : (
            <div className="p-5 rounded-2xl bg-surface border border-dashed border-subtle flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]">
              <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-mut">
                <CalendarPlus className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-main">No upcoming events</h4>
                <p className="text-xs text-sec max-w-[180px] mx-auto mt-0.5">
                  {isViewer
                    ? 'Special church events and fellowships will appear here.'
                    : 'Plan special events, fellowships, and camps.'}
                </p>
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setIsCreateEventOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Event</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          5. NEEDS ATTENTION (Secretary only, below Upcoming)
         ========================================================================= */}
      {!isViewer && (
        <div className="rounded-2xl border border-subtle bg-surface shadow-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-subtle">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl shrink-0 ${
                totalNeedsAttentionCount > 0
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-main tracking-tight">
                    Needs Attention
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    totalNeedsAttentionCount > 0
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  }`}>
                    {totalNeedsAttentionCount}
                  </span>
                </div>
                <p className="text-xs text-sec mt-0.5">
                  Overdue tasks, tasks due soon, and unassigned ministry roles
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Tasks</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>

              {needsAttentionGroups.totalCount > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('schedules')}
                  className="text-xs font-semibold text-sec hover:text-main hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Schedules</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {totalNeedsAttentionCount === 0 && needsAttentionTasks.length === 0 && visitorsToFollowUpCount === 0 && newViewerNotesCount === 0 && !backupDue ? (
            <div className="p-6 text-center space-y-2 rounded-xl bg-subtle/50 border border-subtle">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-main">
                All set for the next two weeks
              </h3>
              <p className="text-xs text-sec max-w-md mx-auto">
                Every scheduled service and event has all required volunteer roles assigned, and all tasks are up to date.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {/* Backup Due (> 30 days since last local backup) */}
              {backupDue && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                    <Database className="w-3.5 h-3.5" />
                    <span>Backup</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="w-full text-left p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 hover:border-accent hover:bg-surface transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 shrink-0">
                        <Database className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-main group-hover:text-accent transition-colors">
                          Backup is due
                        </div>
                        <div className="text-[11px] text-sec">
                          Last backup on this device was over 30 days ago · Open Settings to download
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-accent shrink-0" />
                  </button>
                </div>
              )}

              {/* New Notes from Viewers */}
              {newViewerNotesCount > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                    <Inbox className="w-3.5 h-3.5" />
                    <span>Viewer Notes ({newViewerNotesCount})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('viewer-notes')}
                    className="w-full text-left p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 hover:border-accent hover:bg-surface transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 shrink-0">
                        <Inbox className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-main group-hover:text-accent transition-colors">
                          {newViewerNotesCount} new {newViewerNotesCount === 1 ? 'note' : 'notes'} from viewers
                        </div>
                        <div className="text-[11px] text-sec">
                          Click to open the Viewer Notes inbox
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-accent shrink-0" />
                  </button>
                </div>
              )}

              {/* Visitors To Follow Up */}
              {visitorsToFollowUpCount > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Visitors ({visitorsToFollowUpCount})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenVisitorsToFollowUp) {
                        onOpenVisitorsToFollowUp();
                      } else {
                        onNavigate('visitors');
                      }
                    }}
                    className="w-full text-left p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 hover:border-accent hover:bg-surface transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 shrink-0">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-main group-hover:text-accent transition-colors">
                          {visitorsToFollowUpCount} {visitorsToFollowUpCount === 1 ? 'visitor' : 'visitors'} to follow up
                        </div>
                        <div className="text-[11px] text-sec">
                          Click to view visitors needing follow-up
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-accent shrink-0" />
                  </button>
                </div>
              )}
              {/* Tasks Group */}
              {needsAttentionTasks.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-accent uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Tasks ({needsAttentionTasks.length})</span>
                    </div>
                    <span className="text-[11px] font-normal text-mut normal-case">
                      Overdue, today & next 3 days
                    </span>
                  </div>

                  <div className="space-y-2">
                    {needsAttentionTasks.map((item, tIdx) => {
                      const cat = taskCategories.find(c => c.id === item.task.categoryId);

                      return (
                        <div
                          key={`${item.task.id}_${item.occurrenceDate}_${tIdx}`}
                          onClick={() => {
                            setEditingTask(item.task);
                            setIsTaskEditorOpen(true);
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 motion-card cursor-pointer group ${
                            item.isOverdue
                              ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 hover:border-red-400'
                              : item.isToday
                              ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 hover:border-amber-400'
                              : 'bg-surface border-subtle hover:border-accent/40 shadow-2xs'
                          }`}
                          title="Click to view/edit task"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Round Checkbox */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskDone(item.task.id, item.occurrenceDate);
                              }}
                              className="text-sec hover:text-accent transition-colors shrink-0 cursor-pointer p-0.5"
                              title="Mark task done"
                            >
                              <Circle className="w-4 h-4 text-mut hover:text-accent" />
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-main truncate group-hover:text-accent transition-colors">
                                  {item.task.title}
                                </span>

                                {item.isOverdue ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300">
                                    Overdue: {formatDate(item.occurrenceDate, { month: 'short', day: 'numeric' })}
                                  </span>
                                ) : item.isToday ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                                    Due Today
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-subtle text-sec border border-subtle">
                                    Due {formatDate(item.occurrenceDate, { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </span>
                                )}

                                {cat && (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                                    style={{
                                      backgroundColor: `${cat.color}15`,
                                      color: cat.color,
                                      border: `1px solid ${cat.color}35`
                                    }}
                                  >
                                    {cat.name}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-mut mt-0.5 flex-wrap">
                                {item.task.dueTime && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-mut" />
                                    <span>{formatTime(item.task.dueTime, settings.timeFormat)}</span>
                                  </span>
                                )}
                                {item.task.assignedTo && (
                                  <span>• {item.task.assignedTo}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Snooze button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSnoozeTaskTarget(item.task);
                            }}
                            className="p-1.5 rounded-lg text-mut hover:text-amber-600 hover:bg-subtle transition-colors cursor-pointer shrink-0"
                            title="Snooze task"
                          >
                            <Moon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unassigned Ministry Roles Group */}
              {needsAttentionGroups.groups.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-accent uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Unassigned Service Roles ({needsAttentionGroups.totalCount})</span>
                    </div>
                  </div>

                  {needsAttentionGroups.groups.map(group => (
                    <div key={group.date} className="space-y-2">
                      <div className="text-[11px] font-bold text-sec uppercase tracking-wider">
                        {group.dayTitle}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {group.items.map((item, iIdx) => (
                          <div
                            key={`${item.targetId}_${item.date}_${item.roleId}_${item.slotIndex}_${iIdx}`}
                            onClick={() => setSelectedOccurrence(item.occurrence)}
                            className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/20 hover:border-accent hover:bg-surface transition-all cursor-pointer flex items-start gap-2.5 group"
                            title="Click to open service roster and assign volunteer"
                          >
                            <span
                              className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                              style={{ backgroundColor: item.targetColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-main truncate group-hover:text-accent transition-colors">
                                {item.targetName}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                                {item.roleNode && isImportantRole(item.roleNode) && (
                                  <span className="shrink-0 text-accent">
                                    {renderRoleIcon(item.roleNode.icon, "w-3 h-3")}
                                  </span>
                                )}
                                <span className="truncate">{item.roleName} not assigned</span>
                              </div>
                              <div className="text-[10px] text-mut mt-0.5">
                                {formatTime(item.startTime, settings.timeFormat)} · Tap to assign
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          DAY DETAILS MODAL (from clicking day in compact calendar)
         ========================================================================= */}
      {selectedDayDate && (
        <DayDetailsModal
          date={selectedDayDate}
          occurrences={selectedDayOccurrences}
          birthdays={selectedDayBirthdays}
          onClose={() => setSelectedDayDate(null)}
          onSelectOccurrence={(occ) => {
            setSelectedOccurrence(occ);
          }}
          onCreateEvent={() => {
            setSelectedDayDate(null);
            setIsCreateEventOpen(true);
          }}
        />
      )}

      {/* =========================================================================
          OCCURRENCE DETAILS MODAL
         ========================================================================= */}
      {selectedOccurrence && (
        <OccurrenceDetailsModal
          occurrence={selectedOccurrence}
          onClose={() => setSelectedOccurrence(null)}
        />
      )}

      {/* =========================================================================
          WRITE MESSAGE MODAL (from Reminders prompt)
         ========================================================================= */}
      {!isViewer && writeReminderModalOpen && activeReminderTemplate && (
        <WriteMessageModal
          isOpen={writeReminderModalOpen}
          template={activeReminderTemplate}
          preselectedOccurrenceDate={activeReminderOccurrence?.date}
          preselectedTargetId={activeReminderOccurrence?.sourceId}
          onClose={() => {
            setWriteReminderModalOpen(false);
            setActiveReminderTemplate(null);
            setActiveReminderOccurrence(null);
          }}
        />
      )}

      {/* =========================================================================
          CREATE EVENT MODAL
         ========================================================================= */}
      {!isViewer && isCreateEventOpen && (
        <EventFormModal
          isOpen={isCreateEventOpen}
          onClose={() => setIsCreateEventOpen(false)}
        />
      )}

      {/* =========================================================================
          TASK EDITOR MODAL
         ========================================================================= */}
      {!isViewer && isTaskEditorOpen && (
        <TaskEditorModal
          isOpen={isTaskEditorOpen}
          onClose={() => {
            setIsTaskEditorOpen(false);
            setEditingTask(null);
          }}
          editingTask={editingTask}
        />
      )}

      {/* =========================================================================
          SNOOZE TASK MODAL
         ========================================================================= */}
      {!isViewer && snoozeTaskTarget && (
        <SnoozeModal
          isOpen={!!snoozeTaskTarget}
          onClose={() => setSnoozeTaskTarget(null)}
          task={snoozeTaskTarget}
          onSnooze={async (untilDate: string) => {
            if (snoozeTaskTarget) {
              await snoozeTask(snoozeTaskTarget.id, untilDate);
              setSnoozeTaskTarget(null);
            }
          }}
        />
      )}
    </div>
  );
};
