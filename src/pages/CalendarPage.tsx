import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Copy,
  Edit2,
  Trash2,
  Bookmark,
  Filter,
  X,
  AlertTriangle,
  Check,
  CalendarDays,
  List,
  Sparkles,
  Layers,
  Ban,
  Cake,
  Phone,
  Facebook,
  CheckSquare,
  EyeOff,
  LocateFixed
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  CalendarOccurrence,
  ChurchEvent,
  RegularService,
  RequiredRoleSpec,
  EventCategory,
  Person,
  TaskOccurrenceItem
} from '../types';
import {
  formatDate,
  formatTime,
  getMonthGrid,
  getDaysOfWeekRange,
  toDateString,
  parseDateString,
  getRecurringDates
} from '../lib/dateTime';
import { ConfirmModal } from '../components/ConfirmModal';
import { OccurrenceDetailsModal } from '../components/OccurrenceDetailsModal';
import { DayDetailsModal } from '../components/DayDetailsModal';
import { EventFormModal } from '../components/EventFormModal';
import { renderRoleIcon, isImportantRole } from '../lib/roleIcons';
import { expandTaskOccurrences } from '../lib/taskHelpers';
import { PageLoading } from '../components/LoadingIndicator';

// Helper for leap year calculation
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// Find people with a birthday on the given calendar date
// People with Feb 29 birthday show on Feb 28 in years that have no Feb 29
function getBirthdaysForDate(people: Person[], date: Date): Person[] {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate(); // 1-31
  const isLeap = isLeapYear(year);

  return people.filter(p => {
    if (!p.birthdayMonth || !p.birthdayDay) return false;
    // Exact month and day match
    if (p.birthdayMonth === month && p.birthdayDay === day) return true;
    // Feb 29 in non-leap year falls on Feb 28
    if (!isLeap && month === 2 && day === 28 && p.birthdayMonth === 2 && p.birthdayDay === 29) {
      return true;
    }
    return false;
  });
}

const PRESET_EVENT_COLORS = [
  '#881337',
  '#0284c7',
  '#2e6f40',
  '#ea580c',
  '#6366f1',
  '#8b5cf6',
  '#0d9488',
  '#d97706',
];

const STORAGE_HIDE_PAST_DAYS = 'lbbc_calendar_hide_past_days_v1';
const STORAGE_SHOW_SERVICES = 'lbbc_calendar_show_services_v1';

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // Ignore storage access errors
  }
  return fallback;
}

function writeBoolPref(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Ignore storage access errors
  }
}

export const CalendarPage: React.FC = () => {
  const { isViewer } = useAuth();
  const {
    settings,
    regularServices,
    events,
    overrides,
    assignments,
    categories,
    addEvent,
    updateEvent,
    deleteEvent,
    setServiceOverride,
    deleteServiceOverride,
    saveAssignment,
    deleteAssignment,
    addCategory,
    deleteCategory,
    nodes,
    people,
    tasks,
    dataLoading
  } = useData();

  // Navigation state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  // Filter state
  const [typeFilter, setTypeFilter] = useState<'all' | 'services' | 'activities' | 'events'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showServices, setShowServices] = useState<boolean>(() => readBoolPref(STORAGE_SHOW_SERVICES, true));
  const [showBirthdays, setShowBirthdays] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [hidePastDays, setHidePastDays] = useState<boolean>(() => readBoolPref(STORAGE_HIDE_PAST_DAYS, true));

  const todayListRef = useRef<HTMLDivElement | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const pendingJumpToTodayRef = useRef<boolean>(false);

  const handleSetShowServices = (next: boolean) => {
    setShowServices(next);
    writeBoolPref(STORAGE_SHOW_SERVICES, next);
  };

  const handleSetHidePastDays = (next: boolean) => {
    setHidePastDays(next);
    writeBoolPref(STORAGE_HIDE_PAST_DAYS, next);
  };

  // Modals
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ChurchEvent | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<CalendarOccurrence | null>(null);
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [eventToDelete, setEventToDelete] = useState<ChurchEvent | null>(null);
  const [birthdayModalData, setBirthdayModalData] = useState<{ date: Date; people: Person[] } | null>(null);

  // Template management modal
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChurchEvent | null>(null);
  const [templateNameToSave, setTemplateNameToSave] = useState('');

  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [startDate, setStartDate] = useState(toDateString(new Date()));
  const [endDate, setEndDate] = useState(toDateString(new Date()));
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:30');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [color, setColor] = useState(PRESET_EVENT_COLORS[0]);
  const [requiredRoles, setRequiredRoles] = useState<RequiredRoleSpec[]>([]);
  const [roleToAddId, setRoleToAddId] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Single Occurrence Override state (for regular services)
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideName, setOverrideName] = useState('');
  const [overrideStartTime, setOverrideStartTime] = useState('');
  const [overrideEndTime, setOverrideEndTime] = useState('');
  const [overrideLocation, setOverrideLocation] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');

  // Available roles created in People & Ministries
  const availableRoles = useMemo(() => {
    return nodes.filter(n => n.isRole || (n.assignedPeopleIds && n.assignedPeopleIds.length > 0) || !nodes.some(c => c.parentId === n.id));
  }, [nodes]);

  // Saved templates
  const savedTemplates = useMemo(() => {
    return events.filter(e => e.isTemplate);
  }, [events]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = toDateString(new Date());

  // Month grid
  const monthGrid = useMemo(() => {
    return getMonthGrid(year, month, settings.weekStartDay);
  }, [year, month, settings.weekStartDay]);

  // First and last date shown on the grid for query
  const gridStartStr = toDateString(monthGrid[0].date);
  const gridEndStr = toDateString(monthGrid[monthGrid.length - 1].date);

  // Calculate occurrences within the displayed date range
  const allOccurrences = useMemo(() => {
    const list: CalendarOccurrence[] = [];

    // 1. Regular Services and Activities occurrences
    for (const s of regularServices) {
      const dates = getRecurringDates(gridStartStr, gridEndStr, s.daysOfWeek);
      const isActivity = s.kind === 'activity';
      for (const d of dates) {
        const override = overrides.find(o => o.serviceId === s.id && o.date === d);
        list.push({
          type: 'regular_service',
          sourceId: s.id,
          title: override?.name || s.name,
          date: d,
          startTime: override?.startTime || s.startTime,
          endTime: override?.endTime || s.endTime,
          location: override?.location || s.location,
          notes: override?.notes || s.notes,
          color: s.color,
          requiredRoles: s.requiredRoles || [],
          isCancelled: override?.isCancelled || false,
          isOverridden: !!override,
          overrideId: override?.id,
          serviceKind: isActivity ? 'activity' : 'service'
        });
      }
    }

    // 2. Events occurrences (excluding templates)
    for (const ev of events) {
      if (ev.isTemplate) continue;
      if (ev.startDate <= gridEndStr && ev.endDate >= gridStartStr) {
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

    // Filter by type & Show services toggle
    let filtered = list;
    if (!showServices) {
      filtered = filtered.filter(
        o => !(o.type === 'regular_service' && (o.serviceKind || 'service') === 'service')
      );
    }
    if (typeFilter === 'services') filtered = filtered.filter(o => o.type === 'regular_service' && (o.serviceKind || 'service') === 'service');
    if (typeFilter === 'activities') filtered = filtered.filter(o => o.type === 'regular_service' && o.serviceKind === 'activity');
    if (typeFilter === 'events') filtered = filtered.filter(o => o.type === 'event');
    if (selectedCategoryFilter !== 'all') {
      filtered = filtered.filter(o => o.category === selectedCategoryFilter);
    }

    // Sort by date, then startTime
    filtered.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.startTime.localeCompare(b.startTime);
    });

    return filtered;
  }, [regularServices, events, overrides, gridStartStr, gridEndStr, typeFilter, selectedCategoryFilter, showServices]);

  // Group occurrences by date for fast lookup in month cells
  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occ of allOccurrences) {
      if (!map.has(occ.date)) map.set(occ.date, []);
      map.get(occ.date)!.push(occ);
    }
    return map;
  }, [allOccurrences]);

  // Tasks for calendar days
  const taskOccurrences = useMemo(() => {
    return expandTaskOccurrences(tasks, regularServices, overrides, events, todayStr, 90, 90);
  }, [tasks, regularServices, overrides, events, todayStr]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskOccurrenceItem[]>();
    for (const item of taskOccurrences) {
      if (!item.occurrenceDate) continue;
      if (!map.has(item.occurrenceDate)) map.set(item.occurrenceDate, []);
      map.get(item.occurrenceDate)!.push(item);
    }
    return map;
  }, [taskOccurrences]);

  // List View items grouped by date, incorporating "Birthdays" lines and services
  const listItemsByDate = useMemo(() => {
    const dateMap = new Map<string, { dateObj: Date; occurrences: CalendarOccurrence[]; birthdays: Person[] }>();

    // 1. Add occurrences
    for (const occ of allOccurrences) {
      if (!dateMap.has(occ.date)) {
        dateMap.set(occ.date, {
          dateObj: parseDateString(occ.date),
          occurrences: [],
          birthdays: []
        });
      }
      dateMap.get(occ.date)!.occurrences.push(occ);
    }

    // 2. Add birthdays if enabled
    if (showBirthdays) {
      for (const item of monthGrid) {
        if (!item.isCurrentMonth) continue;
        const bdays = getBirthdaysForDate(people, item.date);
        if (bdays.length > 0) {
          const dStr = toDateString(item.date);
          if (!dateMap.has(dStr)) {
            dateMap.set(dStr, {
              dateObj: item.date,
              occurrences: [],
              birthdays: []
            });
          }
          dateMap.get(dStr)!.birthdays = bdays;
        }
      }
    }

    // Sort dates chronologically
    const sortedKeys = Array.from(dateMap.keys()).sort();
    return sortedKeys.map(k => ({ dateStr: k, ...dateMap.get(k)! }));
  }, [allOccurrences, showBirthdays, monthGrid, people]);

  const visibleListItemsByDate = useMemo(() => {
    if (!hidePastDays) return listItemsByDate;
    return listItemsByDate.filter(item => item.dateStr >= todayStr);
  }, [hidePastDays, listItemsByDate, todayStr]);

  const currentMonthEndStr = toDateString(new Date(year, month + 1, 0));
  const isViewedMonthPast = currentMonthEndStr < todayStr;

  useEffect(() => {
    if (!pendingJumpToTodayRef.current) return;
    if (viewMode !== 'list' || hidePastDays) {
      pendingJumpToTodayRef.current = false;
      return;
    }
    const now = new Date();
    if (year !== now.getFullYear() || month !== now.getMonth()) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const target = todayListRef.current || listTopRef.current;
    if (target) {
      target.scrollIntoView({
        behavior,
        block: todayListRef.current ? 'center' : 'start'
      });
      pendingJumpToTodayRef.current = false;
    }
  }, [viewMode, hidePastDays, year, month, visibleListItemsByDate]);

  // Month navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleJumpToToday = () => {
    const now = new Date();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    pendingJumpToTodayRef.current = true;
    if (year !== now.getFullYear() || month !== now.getMonth()) {
      setCurrentDate(now);
    } else if (todayListRef.current) {
      todayListRef.current.scrollIntoView({ behavior, block: 'center' });
      pendingJumpToTodayRef.current = false;
    } else if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior, block: 'start' });
      pendingJumpToTodayRef.current = false;
    }
  };

  // Add/Edit Event helpers
  const openNewEventModal = (initialDate = todayStr) => {
    setEditingEvent(null);
    setEventTitle('');
    setStartDate(initialDate);
    setEndDate(initialDate);
    setStartTime('18:00');
    setEndTime('19:30');
    setLocation('Main Sanctuary');
    setNotes('');
    setCategoryName('');
    setColor(PRESET_EVENT_COLORS[0]);
    setRequiredRoles([]);
    setRoleToAddId('');
    setSaveAsTemplate(false);
    setTemplateName('');
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (ev: ChurchEvent) => {
    setEditingEvent(ev);
    setEventTitle(ev.title);
    setStartDate(ev.startDate);
    setEndDate(ev.endDate);
    setStartTime(ev.startTime);
    setEndTime(ev.endTime || '');
    setLocation(ev.location || '');
    setNotes(ev.notes || '');
    setCategoryName(ev.category || '');
    setColor(ev.color || PRESET_EVENT_COLORS[0]);
    setRequiredRoles(ev.requiredRoles || []);
    setRoleToAddId('');
    setSaveAsTemplate(false);
    setTemplateName('');
    setIsEventModalOpen(true);
  };

  const handleApplyTemplate = (tmpl: ChurchEvent) => {
    setEventTitle(tmpl.title);
    setStartTime(tmpl.startTime);
    setEndTime(tmpl.endTime || '');
    setLocation(tmpl.location || '');
    setNotes(tmpl.notes || '');
    setCategoryName(tmpl.category || '');
    setColor(tmpl.color);
    setRequiredRoles(tmpl.requiredRoles || []);
  };

  const handleAddRoleSpec = () => {
    if (!roleToAddId) return;
    const roleNode = nodes.find(n => n.id === roleToAddId);
    if (!roleNode) return;

    const existing = requiredRoles.find(r => r.roleId === roleToAddId);
    if (existing) {
      setRequiredRoles(requiredRoles.map(r => r.roleId === roleToAddId ? { ...r, count: r.count + 1 } : r));
    } else {
      setRequiredRoles([...requiredRoles, { roleId: roleNode.id, roleName: roleNode.title, count: 1 }]);
    }
    setRoleToAddId('');
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    if (categoryName.trim() && !categories.some(c => c.name.toLowerCase() === categoryName.trim().toLowerCase())) {
      await addCategory(categoryName.trim(), color);
    }

    if (editingEvent) {
      await updateEvent(editingEvent.id, {
        title: eventTitle.trim(),
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime: endTime.trim(),
        location: location.trim(),
        notes: notes.trim(),
        category: categoryName.trim(),
        color,
        requiredRoles
      });
    } else {
      await addEvent({
        title: eventTitle.trim(),
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime: endTime.trim(),
        location: location.trim(),
        notes: notes.trim(),
        category: categoryName.trim(),
        color,
        requiredRoles
      });

      if (saveAsTemplate && templateName.trim()) {
        await addEvent({
          title: eventTitle.trim(),
          startDate: '2026-01-01',
          endDate: '2026-01-01',
          startTime,
          endTime: endTime.trim(),
          location: location.trim(),
          notes: notes.trim(),
          category: categoryName.trim(),
          color,
          requiredRoles,
          isTemplate: true,
          templateName: templateName.trim()
        });
      }
    }
    setIsEventModalOpen(false);
  };

  // Duplicate Event
  const handleDuplicateEvent = async (ev: ChurchEvent) => {
    await addEvent({
      ...ev,
      title: `${ev.title} (Copy)`,
      isTemplate: false,
      templateName: ''
    });
    setSelectedOccurrence(null);
  };

  // Single occurrence cancellation toggle
  const handleToggleCancelOccurrence = async (occ: CalendarOccurrence) => {
    if (occ.type !== 'regular_service') return;
    if (occ.isCancelled) {
      if (occ.overrideId) {
        await deleteServiceOverride(occ.overrideId);
      }
    } else {
      await setServiceOverride({
        id: `${occ.sourceId}_${occ.date}`,
        serviceId: occ.sourceId,
        date: occ.date,
        isCancelled: true,
        updatedAt: new Date().toISOString()
      });
    }
    setSelectedOccurrence(null);
  };

  // Single occurrence custom modification
  const handleSaveOccurrenceOverride = async () => {
    if (!selectedOccurrence || selectedOccurrence.type !== 'regular_service') return;
    await setServiceOverride({
      id: `${selectedOccurrence.sourceId}_${selectedOccurrence.date}`,
      serviceId: selectedOccurrence.sourceId,
      date: selectedOccurrence.date,
      isCancelled: false,
      name: overrideName.trim(),
      startTime: overrideStartTime,
      endTime: overrideEndTime,
      location: overrideLocation.trim(),
      notes: overrideNotes.trim(),
      updatedAt: new Date().toISOString()
    });
    setIsOverrideModalOpen(false);
    setSelectedOccurrence(null);
  };

  // Occurrence details helper
  const occurrenceAssignments = useMemo(() => {
    if (!selectedOccurrence) return [];
    return assignments.filter(
      a => a.targetId === selectedOccurrence.sourceId && a.date === selectedOccurrence.date
    );
  }, [selectedOccurrence, assignments]);

  const weekHeaders = settings.weekStartDay === 'sunday'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 motion-page-enter">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-main">Church Calendar</h1>
          <p className="text-sm text-sec mt-0.5">
            {isViewer
              ? 'View regular services, church events, and ministry rosters.'
              : 'View unified regular services, one-time events, volunteer role rosters, and occurrence overrides.'}
          </p>
        </div>

        {!isViewer && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Templates Button */}
            <button
              type="button"
              onClick={() => setIsTemplatesModalOpen(true)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Manage saved event templates"
            >
              <Bookmark className="w-3.5 h-3.5 text-accent" />
              <span>Event Templates ({savedTemplates.length})</span>
            </button>

            {/* New Event Button */}
            <button
              type="button"
              onClick={() => openNewEventModal(todayStr)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event</span>
            </button>
          </div>
        )}
      </div>

      {dataLoading.calendar ? (
        <PageLoading />
      ) : (
        <>
      {/* Calendar Controls & Filters Bar */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Month Navigation */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-main min-w-[160px]">
            {currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Mode & Filter Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-subtle border border-subtle">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'month' ? 'bg-surface text-main shadow-xs' : 'text-sec hover:text-main'
              }`}
              title="Month Grid"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'bg-surface text-main shadow-xs' : 'text-sec hover:text-main'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl border border-subtle bg-field text-main text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="all">All (Services & Events)</option>
            <option value="services">Services Only</option>
            <option value="activities">Activities</option>
            <option value="events">Events Only</option>
          </select>

          {/* Category Filter if categories exist */}
          {categories.length > 0 && (
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-subtle bg-field text-main text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Show Services Toggle */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-subtle bg-surface text-main text-xs font-medium cursor-pointer hover:bg-subtle select-none transition-colors">
            <input
              type="checkbox"
              checked={showServices}
              onChange={(e) => handleSetShowServices(e.target.checked)}
              className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 cursor-pointer"
            />
            <CalendarIcon className="w-3.5 h-3.5 text-accent" />
            <span>Show services</span>
          </label>

          {/* Show Birthdays Toggle */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-subtle bg-surface text-main text-xs font-medium cursor-pointer hover:bg-subtle select-none transition-colors">
            <input
              type="checkbox"
              checked={showBirthdays}
              onChange={(e) => setShowBirthdays(e.target.checked)}
              className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 cursor-pointer"
            />
            <Cake className="w-3.5 h-3.5 text-pink-500" />
            <span>Show birthdays</span>
          </label>

          {/* Show Tasks Toggle */}
          {!isViewer && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-subtle bg-surface text-main text-xs font-medium cursor-pointer hover:bg-subtle select-none transition-colors">
              <input
                type="checkbox"
                checked={showTasks}
                onChange={(e) => setShowTasks(e.target.checked)}
                className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 cursor-pointer"
              />
              <CheckSquare className="w-3.5 h-3.5 text-accent" />
              <span>Show tasks</span>
            </label>
          )}

          {/* Hide Past Days Toggle (List view) */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-subtle bg-surface text-main text-xs font-medium cursor-pointer hover:bg-subtle select-none transition-colors">
            <input
              type="checkbox"
              checked={hidePastDays}
              onChange={(e) => handleSetHidePastDays(e.target.checked)}
              className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 cursor-pointer"
            />
            <EyeOff className="w-3.5 h-3.5 text-sec" />
            <span>Hide past days</span>
          </label>

          {/* Jump to today button (visible in List view when Hide past days is OFF) */}
          {viewMode === 'list' && !hidePastDays && (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-accent/50 bg-accent-tint hover:bg-accent-tint-strong text-accent text-xs font-semibold cursor-pointer transition-colors"
            >
              <LocateFixed className="w-3.5 h-3.5 shrink-0" />
              <span>Jump to today</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= VIEW 1: MONTH VIEW ================= */}
      {viewMode === 'month' && (
        <div className="bg-surface rounded-2xl border border-subtle shadow-card overflow-hidden">
          {/* Weekday Header */}
          <div className="grid grid-cols-7 border-b border-subtle bg-subtle/50 text-center py-2.5 text-xs font-bold uppercase tracking-wider text-mut">
            {weekHeaders.map(day => (
              <div key={day}>{day}</div>
            ))}
          </div>

          {/* Month Days Grid */}
          <div key={`${currentDate.getFullYear()}-${currentDate.getMonth()}`} className="grid grid-cols-7 divide-x divide-y divide-subtle viewer-calendar-month-fade">
            {monthGrid.map(({ date, isCurrentMonth }, idx) => {
              const dStr = toDateString(date);
              const isToday = dStr === todayStr;
              const dayOccurrences = occurrencesByDate.get(dStr) || [];
              const dayBirthdays = getBirthdaysForDate(people, date);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDayDate(date)}
                  className={`h-auto min-h-[105px] sm:min-h-[125px] p-1.5 sm:p-2 transition-colors cursor-pointer group flex flex-col justify-start overflow-hidden ${
                    isToday
                      ? 'cal-month-cell-today'
                      : isCurrentMonth
                      ? 'bg-surface hover:bg-surface-hover/60'
                      : 'bg-subtle/30 opacity-45'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-1.5 w-full">
                    {/* Date number and birthday cake icon */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-xs font-semibold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 tabular-nums ${
                          isToday
                            ? 'bg-accent text-accent-contrast shadow-xs font-bold'
                            : isCurrentMonth
                            ? 'text-main'
                            : 'text-mut'
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {/* Birthday cake icon near the date number */}
                      {showBirthdays && dayBirthdays.length > 0 && (
                        <span
                          className="text-pink-500 shrink-0 inline-flex items-center"
                          title={`Birthdays: ${dayBirthdays.map(p => p.name).join(', ')}`}
                          aria-label="Birthdays on this day"
                        >
                          <Cake className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </span>
                      )}
                    </div>

                    {/* Occurrences & Tasks */}
                    {(dayOccurrences.length > 0 || (!isViewer && showTasks && (tasksByDate.get(dStr)?.length || 0) > 0)) && (
                      <div className="flex-1 min-w-0 space-y-1 w-full overflow-hidden">
                        {/* Tasks line if showTasks is true and tasks exist for day */}
                        {!isViewer && showTasks && (() => {
                          const dayTasks = tasksByDate.get(dStr) || [];
                          if (dayTasks.length === 0) return null;
                          const hasOverdueUndone = dayTasks.some(t => t.isOverdue && !t.isDone);
                          return (
                            <div
                              className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1 py-0.5 rounded leading-tight truncate ${
                                hasOverdueUndone
                                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50'
                                  : 'text-sec bg-subtle/70 border border-subtle/50'
                              }`}
                              title={`${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'} due`}
                            >
                              <CheckSquare className={`w-3 h-3 shrink-0 ${hasOverdueUndone ? 'text-red-500' : 'text-accent'}`} />
                              <span className="truncate">{dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}</span>
                            </div>
                          );
                        })()}

                        {dayOccurrences.slice(0, 3).map((occ, oIdx) => (
                          <div
                            key={oIdx}
                            className={`border-l-2 pl-1.5 text-[10px] sm:text-xs leading-tight text-main font-medium break-words flex items-center gap-1 ${
                              occ.isCancelled ? 'line-through opacity-50' : ''
                            }`}
                            style={{
                              borderColor: occ.color || 'var(--accent-base)'
                            }}
                          >
                            {occ.serviceKind === 'activity' && (
                              <span className="shrink-0 px-1 py-0.2 rounded text-[9px] font-semibold bg-accent-tint text-accent leading-none">
                                Activity
                              </span>
                            )}
                            <span className="truncate">{occ.title}</span>
                          </div>
                        ))}

                        {dayOccurrences.length > 3 && (
                          <div className="text-[10px] sm:text-[11px] text-sec font-semibold pl-1.5">
                            +{dayOccurrences.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: LIST VIEW ================= */}
      {viewMode === 'list' && (
        <div ref={listTopRef} className="space-y-4">
          {visibleListItemsByDate.length === 0 ? (
            hidePastDays && (isViewedMonthPast || listItemsByDate.length > 0) ? (
              <div className="p-10 sm:p-12 rounded-2xl bg-surface border border-subtle text-center space-y-3.5 shadow-card">
                <div className="w-12 h-12 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
                  <EyeOff className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-main max-w-md mx-auto">
                  Past days are hidden. Turn off &apos;Hide past days&apos; to see them.
                </p>
                <button
                  type="button"
                  onClick={() => handleSetHidePastDays(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Turn off &apos;Hide past days&apos;
                </button>
              </div>
            ) : (
              <div className="p-12 rounded-2xl bg-surface border border-subtle text-center space-y-3 shadow-card">
                <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
                  <CalendarIcon className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-main">No calendar items in this period</h3>
                <p className="text-xs text-sec max-w-md mx-auto">
                  No regular services, activities, events, or birthdays match your current filter settings for this month.
                </p>
              </div>
            )
          ) : (
            <div className="bg-surface rounded-2xl border border-subtle shadow-card divide-y divide-subtle overflow-hidden motion-list-enter">
              {visibleListItemsByDate.map(({ dateStr, dateObj, occurrences, birthdays }) => {
                const isToday = dateStr === todayStr;

                return (
                  <div
                    key={dateStr}
                    ref={isToday ? todayListRef : undefined}
                    className={`divide-y divide-subtle ${isToday ? 'cal-list-today' : ''}`}
                  >
                    {/* Birthdays Line for this day (if enabled and present) */}
                    {showBirthdays && birthdays.length > 0 && (
                      <div
                        onClick={() => setBirthdayModalData({ date: dateObj, people: birthdays })}
                        className={`p-3.5 sm:p-4 transition-colors cursor-pointer flex items-center justify-between gap-3 border-l-4 border-pink-500 ${
                          isToday
                            ? 'hover:bg-black/5 dark:hover:bg-white/5'
                            : 'bg-pink-50/40 dark:bg-pink-950/20 hover:bg-pink-100/50 dark:hover:bg-pink-900/30'
                        }`}
                        title="Click to view birthday details"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-pink-100 text-pink-600 dark:bg-pink-900/50 dark:text-pink-300 shrink-0">
                            <Cake className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-pink-700 dark:text-pink-300 uppercase tracking-wider">
                                Birthdays · {formatDate(dateStr, { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              {isToday && (
                                <span className="px-2 py-0.5 rounded-md bg-accent text-accent-contrast text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                                  Today
                                </span>
                              )}
                              <span className="text-[11px] text-mut font-normal">
                                ({birthdays.length} {birthdays.length === 1 ? 'person' : 'people'})
                              </span>
                            </div>
                            <div className="text-xs font-medium text-main mt-0.5">
                              {birthdays.map((p, pIdx) => (
                                <span key={p.id}>
                                  <span className="font-semibold">{p.name}</span>
                                  {p.department ? ` (${p.department})` : ''}
                                  {pIdx < birthdays.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-pink-600 dark:text-pink-400 font-semibold shrink-0 hover:underline">
                          View
                        </span>
                      </div>
                    )}

                    {/* Occurrences on this day */}
                    {occurrences.map((occ, idx) => {
                      const occAssignments = assignments.filter(
                        a => a.targetId === occ.sourceId && a.date === occ.date
                      );

                      return (
                        <div
                          key={`${occ.sourceId}_${occ.date}_${idx}`}
                          onClick={() => setSelectedOccurrence(occ)}
                          className={`p-4 sm:p-5 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                            isToday
                              ? 'hover:bg-black/5 dark:hover:bg-white/5'
                              : 'hover:bg-surface-hover/70'
                          }`}
                        >
                          <div className="flex items-start gap-3.5 flex-1 min-w-0">
                            <div
                              className="w-3 h-12 rounded-full shrink-0 mt-0.5 shadow-2xs"
                              style={{ backgroundColor: occ.color || 'var(--accent-base)' }}
                            />
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                                  {formatDate(occ.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                {isToday && (
                                  <span className="px-2 py-0.5 rounded-md bg-accent text-accent-contrast text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                                    Today
                                  </span>
                                )}
                                {occ.serviceKind === 'activity' && (
                                  <span className="px-2 py-0.2 rounded-md bg-accent-tint text-accent text-[10px] font-semibold border border-accent/20 uppercase tracking-wide">
                                    Activity
                                  </span>
                                )}
                                {occ.isCancelled && (
                                  <span className="px-1.5 py-0.2 rounded bg-red-50 text-red-600 dark:bg-red-950/40 text-[10px] font-bold uppercase">
                                    Cancelled
                                  </span>
                                )}
                                {occ.category && (
                                  <span className="px-2 py-0.2 rounded-md bg-subtle text-sec text-[10px] font-medium border border-subtle">
                                    {occ.category}
                                  </span>
                                )}
                              </div>

                              <h3 className={`text-base font-bold text-main ${occ.isCancelled ? 'line-through opacity-60' : ''}`}>
                                {occ.title}
                              </h3>

                              <div className="flex flex-wrap items-center gap-4 text-xs text-sec">
                                <span className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-mut" />
                                  <span className="tabular-nums">
                                    {formatTime(occ.startTime, settings.timeFormat)}
                                    {occ.endTime ? ` - ${formatTime(occ.endTime, settings.timeFormat)}` : ''}
                                  </span>
                                </span>
                                {occ.location && (
                                  <span className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-mut" />
                                    <span>{occ.location}</span>
                                  </span>
                                )}
                              </div>

                              {/* Important roles directly under each service (icon + person) */}
                              {occ.type === 'regular_service' && (() => {
                                const importantRoles = (occ.requiredRoles || [])
                                  .map(r => {
                                    const node = nodes.find(n => n.id === r.roleId);
                                    return { spec: r, node, icon: node?.icon };
                                  })
                                  .filter(item => isImportantRole(item.node));

                                if (importantRoles.length === 0) return null;

                                return (
                                  <div className="pt-2 flex flex-wrap items-center gap-2">
                                    {importantRoles.map(({ spec, icon }, rIdx) => {
                                      const assigned = occAssignments.filter(a => a.roleId === spec.roleId);
                                      const assignedNames = assigned.map(a => a.personName).join(', ');
                                      return (
                                        <span
                                          key={rIdx}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subtle border border-subtle text-xs"
                                        >
                                          <span className="text-accent shrink-0">
                                            {renderRoleIcon(icon, 'w-3.5 h-3.5')}
                                          </span>
                                          <span className="font-medium text-sec">{spec.roleName}:</span>
                                          <span className={assignedNames ? 'font-semibold text-main' : 'text-mut italic'}>
                                            {assignedNames || 'Unassigned'}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Assigned Roles Roster Snapshot */}
                          <div className="sm:text-right shrink-0">
                            {occ.requiredRoles && occ.requiredRoles.length > 0 ? (
                              <div className="space-y-1">
                                <span className="text-[11px] font-semibold text-mut uppercase tracking-wider block">
                                  Roster ({occAssignments.length}/{occ.requiredRoles.reduce((s, r) => s + r.count, 0)})
                                </span>
                                <div className="text-xs text-sec">
                                  {occAssignments.length > 0 ? (
                                    <span>{occAssignments.map(a => a.personName).join(', ')}</span>
                                  ) : (
                                    <span className="text-mut italic">No volunteers assigned</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-mut italic">No required roles</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* ================= DAY DETAILS POPUP MODAL ================= */}
      {selectedDayDate && (
        <DayDetailsModal
          date={selectedDayDate}
          occurrences={occurrencesByDate.get(toDateString(selectedDayDate)) || []}
          birthdays={getBirthdaysForDate(people, selectedDayDate)}
          onClose={() => setSelectedDayDate(null)}
          onSelectOccurrence={(occ) => setSelectedOccurrence(occ)}
          onCreateEvent={(dStr) => {
            setSelectedDayDate(null);
            openNewEventModal(dStr);
          }}
        />
      )}

      {/* ================= OCCURRENCE DETAILS MODAL ================= */}
      {selectedOccurrence && (
        <OccurrenceDetailsModal
          occurrence={selectedOccurrence}
          onClose={() => setSelectedOccurrence(null)}
          onEditEvent={openEditEventModal}
          onDuplicateEvent={handleDuplicateEvent}
          onRescheduleEvent={openEditEventModal}
          onDeleteEvent={(ev) => setEventToDelete(ev)}
        />
      )}

      {/* ================= CREATE / EDIT EVENT MODAL ================= */}
      {!isViewer && isEventModalOpen && (
        <EventFormModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          initialDate={startDate}
          editingEvent={editingEvent}
        />
      )}


      {/* ================= MANAGE EVENT TEMPLATES MODAL ================= */}
      {!isViewer && isTemplatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-4 motion-popup-in">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="text-base font-bold text-main flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-accent" />
                <span>Saved Event Templates</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsTemplatesModalOpen(false)}
                className="p-1 rounded-lg text-mut hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-sec">
              Use templates to quickly create recurring event formats with pre-configured times, locations, and volunteer roles.
            </p>

            {savedTemplates.length === 0 ? (
              <div className="p-6 text-center text-xs text-mut bg-subtle rounded-xl border border-subtle">
                No templates saved yet. You can check "Save as Event Template" when creating any calendar event.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-subtle border border-subtle flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-main">{t.templateName || t.title}</div>
                      <div className="text-[11px] text-mut">
                        {formatTime(t.startTime, settings.timeFormat)} · {t.requiredRoles.length} roles specified
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsTemplatesModalOpen(false);
                          openNewEventModal(todayStr);
                          handleApplyTemplate(t);
                        }}
                        className="px-2.5 py-1 bg-accent text-accent-contrast rounded-lg text-xs font-semibold"
                        title="Use this template"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvent(t.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= BIRTHDAYS POPUP MODAL ================= */}
      {birthdayModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-4 animate-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-pink-100 text-pink-600 dark:bg-pink-950/60 dark:text-pink-400 shrink-0">
                  <Cake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-main">
                    Birthdays on {formatDate(toDateString(birthdayModalData.date), { month: 'long', day: 'numeric' })}
                  </h3>
                  <p className="text-xs text-sec">
                    {birthdayModalData.people.length} {birthdayModalData.people.length === 1 ? 'person celebrating' : 'people celebrating'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBirthdayModalData(null)}
                className="p-1.5 rounded-lg text-mut hover:text-main cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {birthdayModalData.people.map((person) => (
                <div
                  key={person.id}
                  className="p-3.5 rounded-xl bg-subtle border border-subtle flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-200 dark:bg-pink-900/60 text-pink-800 dark:text-pink-200 font-bold flex items-center justify-center shrink-0 text-sm">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-main text-sm">{person.name}</h4>
                      {person.department && (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-surface text-sec border border-subtle text-[11px] font-medium mt-0.5">
                          {person.department}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isViewer && (
                    <div className="flex items-center gap-1.5">
                      {person.contactNumber && (
                        <a
                          href={`tel:${person.contactNumber}`}
                          className="p-1.5 rounded-lg bg-surface hover:bg-surface-hover text-accent border border-subtle transition-colors cursor-pointer"
                          title={`Call ${person.name}: ${person.contactNumber}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {person.facebookLink && (
                        <a
                          href={person.facebookLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-surface hover:bg-surface-hover text-accent border border-subtle transition-colors"
                          title="Facebook Profile"
                        >
                          <Facebook className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setBirthdayModalData(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Events */}
      {!isViewer && (
        <ConfirmModal
          isOpen={!!eventToDelete}
          title={`Delete Event "${eventToDelete?.title}"?`}
          message="This event and all its associated volunteer role assignments will be permanently deleted."
          confirmLabel="Delete Event"
          onConfirm={async () => {
            if (eventToDelete) {
              await deleteEvent(eventToDelete.id);
              setEventToDelete(null);
            }
          }}
          onCancel={() => setEventToDelete(null)}
        />
      )}
    </div>
  );
};
