import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  RotateCw,
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Plus,
  Check,
  X,
  ExternalLink,
  Layers,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  List
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  toDateString,
  parseDateString,
  formatDate,
  formatTime,
  getRecurringDates,
  doTimesOverlap,
  getMonthDateRange,
  getNextPeriodDateRange,
  formatMonthChip,
  formatMonthLong,
  getMonthStartDate,
  getMonthEndDate,
  formatMonthsSummary,
  getMonthsBetweenDates
} from '../lib/dateTime';
import {
  RegularService,
  RoleAssignment,
  OutlineNode,
  Person,
  Schedule
} from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ScheduleCalendarView } from '../components/ScheduleCalendarView';
import { renderRoleIcon, isImportantRole } from '../lib/roleIcons';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

// Helper to reliably retrieve all included months ("YYYY-MM") for a schedule
function getMonthsForSchedule(s: Schedule): string[] {
  if (s.months && s.months.length > 0) {
    return [...s.months].sort();
  }
  return getMonthsBetweenDates(s.startDate, s.endDate);
}

interface SchedulesPageProps {
  onNavigate?: (tab: string) => void;
}

interface OutlineNodeWithDepth {
  node: OutlineNode;
  depth: number;
  parentTitle?: string;
  fullPath: string;
}

export const SchedulesPage: React.FC<SchedulesPageProps> = ({ onNavigate }) => {
  const { isViewer } = useAuth();
  const {
    regularServices,
    assignments,
    saveAssignment,
    deleteAssignment,
    nodes,
    people,
    settings,
    overrides,
    events,
    schedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    duplicateSchedule,
    dataLoading
  } = useData();

  // Primary view mode: 'schedules' | 'gaps'
  const [activeTab, setActiveTab] = useState<'schedules' | 'gaps'>('schedules');

  // Currently active schedule open in Editor Modal (null = closed)
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [scheduleViewMode, setScheduleViewMode] = useState<'list' | 'calendar'>('list');

  // New Schedule Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newScheduleRoleId, setNewScheduleRoleId] = useState<string>('');
  const [newSelectedMonths, setNewSelectedMonths] = useState<string[]>([]);
  const [selectorBaseYear, setSelectorBaseYear] = useState<number>(new Date().getFullYear());
  const [newServiceIds, setNewServiceIds] = useState<string[]>([]);
  const [newIncludeEvents, setNewIncludeEvents] = useState<boolean>(false);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState<boolean>(false);

  // Confirmation Modals
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [monthToRemove, setMonthToRemove] = useState<string | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);

  // Collapsed months in editor modal
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  // Tools in Editor Modal
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [rotationPeopleIds, setRotationPeopleIds] = useState<string[]>([]);

  // Inline custom name typing state per occurrence slot: key = `${targetId}_${date}_${roleId}_${slotIndex}`
  const [customNameInputs, setCustomNameInputs] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});

  // Auto-save feedback toast
  const [recentSavedSlot, setRecentSavedSlot] = useState<string | null>(null);

  const todayStr = toDateString(new Date());

  // 1. ONE CARD PER ROLE: consolidate schedules so only ONE card per role is ever rendered
  const displaySchedules = useMemo<Schedule[]>(() => {
    const roleMap = new Map<string, Schedule>();

    for (const s of schedules) {
      const sMonths = getMonthsForSchedule(s);

      if (!roleMap.has(s.roleId)) {
        roleMap.set(s.roleId, {
          ...s,
          months: sMonths
        });
      } else {
        const existing = roleMap.get(s.roleId)!;
        const combinedMonths = Array.from(new Set([...(existing.months || []), ...sMonths])).sort();
        const combinedServices = Array.from(new Set([...(existing.serviceIds || []), ...(s.serviceIds || [])]));

        existing.months = combinedMonths;
        existing.serviceIds = combinedServices;
        existing.includeEvents = existing.includeEvents || s.includeEvents;
        if (combinedMonths.length > 0) {
          existing.startDate = getMonthStartDate(combinedMonths[0]);
          existing.endDate = getMonthEndDate(combinedMonths[combinedMonths.length - 1]);
        }
      }
    }

    return Array.from(roleMap.values());
  }, [schedules]);

  // Auto-merge duplicate schedules for the same role in Firebase in the background
  useEffect(() => {
    if (isViewer || schedules.length <= 1) return;

    const roleGroups = new Map<string, Schedule[]>();
    for (const s of schedules) {
      if (!roleGroups.has(s.roleId)) {
        roleGroups.set(s.roleId, []);
      }
      roleGroups.get(s.roleId)!.push(s);
    }

    for (const [, roleScheds] of roleGroups.entries()) {
      if (roleScheds.length > 1) {
        const primary = roleScheds[0];
        const duplicates = roleScheds.slice(1);

        const allMonths = new Set<string>();
        roleScheds.forEach(s => getMonthsForSchedule(s).forEach(m => allMonths.add(m)));
        const sortedMonths = Array.from(allMonths).sort();

        const allServices = new Set<string>();
        roleScheds.forEach(s => (s.serviceIds || []).forEach(srv => allServices.add(srv)));

        const includeEvents = roleScheds.some(s => !!s.includeEvents);
        const startDate = sortedMonths.length > 0 ? getMonthStartDate(sortedMonths[0]) : primary.startDate;
        const endDate = sortedMonths.length > 0 ? getMonthEndDate(sortedMonths[sortedMonths.length - 1]) : primary.endDate;

        updateSchedule(primary.id, {
          months: sortedMonths,
          startDate,
          endDate,
          serviceIds: Array.from(allServices),
          includeEvents
        }).then(() => {
          // Delete duplicate schedule docs WITHOUT deleting any assignments
          duplicates.forEach(dup => {
            deleteSchedule(dup.id, false);
          });
        });
        break; // Process one role at a time
      }
    }
  }, [isViewer, schedules, updateSchedule, deleteSchedule]);

  // Flatten outline nodes into hierarchical tree with depth and parent titles
  const flatTree = useMemo<OutlineNodeWithDepth[]>(() => {
    const treeMap: Record<string, OutlineNode[]> = {};
    for (const n of nodes) {
      const p = n.parentId || 'root';
      if (!treeMap[p]) treeMap[p] = [];
      treeMap[p].push(n);
    }
    for (const k of Object.keys(treeMap)) {
      treeMap[k].sort((a, b) => a.order - b.order);
    }

    const result: OutlineNodeWithDepth[] = [];
    const traverse = (parentId: string, depth: number, parentTitle?: string, pathPrefix = '') => {
      const children = treeMap[parentId] || [];
      for (const child of children) {
        const fullPath = pathPrefix ? `${pathPrefix} > ${child.title}` : child.title;
        result.push({
          node: child,
          depth,
          parentTitle,
          fullPath
        });
        traverse(child.id, depth + 1, child.title, fullPath);
      }
    };
    traverse('root', 0);
    return result;
  }, [nodes]);

  // People map for O(1) lookups
  const peopleMap = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people) {
      map.set(p.id, p);
    }
    return map;
  }, [people]);

  // Nodes map for O(1) lookups
  const nodesMap = useMemo(() => {
    const map = new Map<string, OutlineNode>();
    for (const n of nodes) {
      map.set(n.id, n);
    }
    return map;
  }, [nodes]);

  // Initialize Create Schedule modal form defaults
  const openCreateModal = () => {
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setNewSelectedMonths([currentYm]);
    setSelectorBaseYear(now.getFullYear());
    setNewServiceIds(regularServices.map(s => s.id));
    setNewIncludeEvents(false);

    if (flatTree.length > 0 && !newScheduleRoleId) {
      const candidate = flatTree.find(item => item.node.assignedPeopleIds && item.node.assignedPeopleIds.length > 0) || flatTree[0];
      setNewScheduleRoleId(candidate.node.id);
    }
    setIsCreateModalOpen(true);
  };

  const selectedCreateNode = useMemo(() => {
    if (!newScheduleRoleId) return null;
    return nodesMap.get(newScheduleRoleId) || null;
  }, [newScheduleRoleId, nodesMap]);

  const selectedCreateNodePeople = useMemo(() => {
    if (!selectedCreateNode?.assignedPeopleIds) return [];
    return selectedCreateNode.assignedPeopleIds
      .map(id => peopleMap.get(id))
      .filter(Boolean) as Person[];
  }, [selectedCreateNode, peopleMap]);

  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleRoleId || newSelectedMonths.length === 0 || !selectedCreateNode || isCreatingSchedule) return;

    setIsCreatingSchedule(true);
    try {
      // Check if a schedule card already exists for this role
      const existingCard = displaySchedules.find(s => s.roleId === newScheduleRoleId);
      if (existingCard) {
        // Add chosen months to existing card (skip months already included)
        const existingMonths = getMonthsForSchedule(existingCard);
        const mergedMonths = Array.from(new Set([...existingMonths, ...newSelectedMonths])).sort();
        const mergedServices = Array.from(new Set([...(existingCard.serviceIds || []), ...newServiceIds]));
        const includeEvents = existingCard.includeEvents || newIncludeEvents;

        await updateSchedule(existingCard.id, {
          months: mergedMonths,
          startDate: getMonthStartDate(mergedMonths[0]),
          endDate: getMonthEndDate(mergedMonths[mergedMonths.length - 1]),
          serviceIds: mergedServices,
          includeEvents
        });

        setIsCreateModalOpen(false);
        setScheduleViewMode('list');
        setActiveScheduleId(existingCard.id);
        return;
      }

      // Otherwise create brand new schedule
      const sortedMonths = [...newSelectedMonths].sort();
      const newId = await addSchedule({
        roleId: newScheduleRoleId,
        roleName: selectedCreateNode.title,
        startDate: getMonthStartDate(sortedMonths[0]),
        endDate: getMonthEndDate(sortedMonths[sortedMonths.length - 1]),
        serviceIds: newServiceIds,
        includeEvents: newIncludeEvents,
        months: sortedMonths
      });

      setIsCreateModalOpen(false);
      if (newId) {
        setScheduleViewMode('list');
        setActiveScheduleId(newId);
      }
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  // Active Schedule object for the Editor Modal
  const activeSchedule = useMemo(() => {
    if (!activeScheduleId) return null;
    return displaySchedules.find(s => s.id === activeScheduleId || s.roleId === activeScheduleId) || schedules.find(s => s.id === activeScheduleId) || null;
  }, [displaySchedules, schedules, activeScheduleId]);

  // Included months for the active schedule
  const activeMonths = useMemo(() => {
    if (!activeSchedule) return [];
    return getMonthsForSchedule(activeSchedule);
  }, [activeSchedule]);

  const activeMonthsSet = useMemo(() => new Set(activeMonths), [activeMonths]);

  // Available upcoming months that can be added to the active schedule
  const availableMonthsToAdd = useMemo(() => {
    if (!activeSchedule) return [];
    const list: { ym: string; label: string }[] = [];
    const now = new Date();
    for (let i = -1; i <= 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!activeMonthsSet.has(ym)) {
        list.push({ ym, label: formatMonthChip(ym) });
      }
    }
    return list;
  }, [activeSchedule, activeMonthsSet]);

  // Add month to active schedule
  const handleAddMonthToActiveSchedule = async (monthToAdd: string) => {
    if (!activeSchedule) return;
    const currentMonths = getMonthsForSchedule(activeSchedule);
    if (currentMonths.includes(monthToAdd)) return;
    const updated = [...currentMonths, monthToAdd].sort();
    await updateSchedule(activeSchedule.id, {
      months: updated,
      startDate: getMonthStartDate(updated[0]),
      endDate: getMonthEndDate(updated[updated.length - 1])
    });
  };

  // Confirm removing month from active schedule (preserves all Firebase assignments)
  const handleConfirmRemoveMonth = async () => {
    if (!monthToRemove || !activeSchedule) return;
    const currentMonths = getMonthsForSchedule(activeSchedule);
    const updated = currentMonths.filter(m => m !== monthToRemove);
    if (updated.length > 0) {
      await updateSchedule(activeSchedule.id, {
        months: updated,
        startDate: getMonthStartDate(updated[0]),
        endDate: getMonthEndDate(updated[updated.length - 1])
      });
    }
    setMonthToRemove(null);
  };

  // Role node of active schedule
  const activeRoleNode = useMemo(() => {
    if (!activeSchedule) return null;
    return nodesMap.get(activeSchedule.roleId) || null;
  }, [nodesMap, activeSchedule]);

  // Attached people for active role
  const activeRolePeople = useMemo(() => {
    if (!activeRoleNode?.assignedPeopleIds) return [];
    return activeRoleNode.assignedPeopleIds
      .map(id => peopleMap.get(id))
      .filter(Boolean) as Person[];
  }, [activeRoleNode, peopleMap]);

  // Active schedule services
  const activeServices = useMemo(() => {
    if (!activeSchedule) return [];
    return regularServices.filter(s => (activeSchedule.serviceIds || []).includes(s.id));
  }, [regularServices, activeSchedule]);

  // Build occurrences list for active schedule in the editor modal
  const editorOccurrences = useMemo(() => {
    if (!activeSchedule || !activeRoleNode) return [];

    interface OccurrenceRow {
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

    const rows: OccurrenceRow[] = [];
    const seenSlots = new Set<string>();

    // 1. Regular Services Occurrences across all included months
    for (const service of activeServices) {
      const roleSpec = service.requiredRoles?.find(r => r.roleId === activeSchedule.roleId);
      const slotCount = roleSpec ? roleSpec.count : 1;

      for (const ym of activeMonths) {
        const dates = getRecurringDates(getMonthStartDate(ym), getMonthEndDate(ym), service.daysOfWeek);

        for (const d of dates) {
          const override = overrides.find(o => o.serviceId === service.id && o.date === d);
          const isCancelled = !!override?.isCancelled;

          for (let slot = 0; slot < slotCount; slot++) {
            const slotKey = `${service.id}_${d}_${activeSchedule.roleId}_${slot}`;
            seenSlots.add(slotKey);
            if (slot === 0) {
              seenSlots.add(`${service.id}_${d}_${activeSchedule.roleId}_undefined`);
            }

            const assignment = assignments.find(
              a => a.targetId === service.id && a.date === d && a.roleId === activeSchedule.roleId && (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null)))
            );

            rows.push({
              date: d,
              targetType: 'regular_service',
              targetId: service.id,
              name: override?.name || service.name,
              color: service.color,
              startTime: override?.startTime || service.startTime,
              endTime: override?.endTime || service.endTime,
              slotIndex: slot,
              slotCount,
              isCancelled,
              noServiceOnDate: false,
              assignment
            });
          }
        }
      }
    }

    // 2. Events requiring this role (if included)
    if (activeSchedule.includeEvents) {
      const relevantEvents = events.filter(ev => {
        if (ev.isTemplate) return false;
        const evMonth = ev.startDate.substring(0, 7);
        const inRange = activeMonthsSet.has(evMonth);
        const requiresRole = ev.requiredRoles?.some(r => r.roleId === activeSchedule.roleId);
        return inRange && requiresRole;
      });

      for (const ev of relevantEvents) {
        const roleSpec = ev.requiredRoles?.find(r => r.roleId === activeSchedule.roleId);
        const slotCount = roleSpec ? roleSpec.count : 1;

        for (let slot = 0; slot < slotCount; slot++) {
          const slotKey = `${ev.id}_${ev.startDate}_${activeSchedule.roleId}_${slot}`;
          seenSlots.add(slotKey);
          if (slot === 0) {
            seenSlots.add(`${ev.id}_${ev.startDate}_${activeSchedule.roleId}_undefined`);
          }

          const assignment = assignments.find(
            a => a.targetId === ev.id && a.date === ev.startDate && a.roleId === activeSchedule.roleId && (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null)))
          );

          rows.push({
            date: ev.startDate,
            targetType: 'event',
            targetId: ev.id,
            name: ev.title,
            color: ev.color,
            startTime: ev.startTime,
            endTime: ev.endTime,
            slotIndex: slot,
            slotCount,
            isCancelled: false,
            noServiceOnDate: false,
            assignment
          });
        }
      }
    }

    // 3. Keep orphaned assignments visible so no saved assignment is lost silently
    const orphanedAssignments = assignments.filter(a =>
      a.roleId === activeSchedule.roleId &&
      activeMonthsSet.has(a.date.substring(0, 7)) &&
      !seenSlots.has(`${a.targetId}_${a.date}_${a.roleId}_${a.slotIndex}`) &&
      !seenSlots.has(`${a.targetId}_${a.date}_${a.roleId}_undefined`)
    );

    for (const orphan of orphanedAssignments) {
      const matchingService = regularServices.find(s => s.id === orphan.targetId);
      const matchingEvent = events.find(e => e.id === orphan.targetId);
      const color = matchingService?.color || matchingEvent?.color || '#881337';
      const name = matchingService?.name || matchingEvent?.title || 'Historical Occurrence';

      // Check whether this service/event truly does not occur on this date
      let trulyNoService = false;
      if (orphan.targetType === 'regular_service') {
        if (!matchingService) {
          trulyNoService = true;
        } else {
          const dayOfWeek = parseDateString(orphan.date).getDay();
          const runsOnDay = matchingService.daysOfWeek.includes(dayOfWeek);
          const isCancelled = !!overrides.find(o => o.serviceId === matchingService.id && o.date === orphan.date)?.isCancelled;
          trulyNoService = !runsOnDay || isCancelled;
        }
      } else {
        trulyNoService = !matchingEvent;
      }

      rows.push({
        date: orphan.date,
        targetType: orphan.targetType,
        targetId: orphan.targetId,
        name,
        color,
        startTime: orphan.startTime || matchingService?.startTime || '00:00',
        endTime: orphan.endTime || matchingService?.endTime,
        slotIndex: orphan.slotIndex || 0,
        slotCount: 1,
        isCancelled: false,
        noServiceOnDate: trulyNoService,
        assignment: orphan
      });
    }

    // Sort chronologically: date -> time -> slot
    rows.sort((a, b) => {
      const cmpDate = a.date.localeCompare(b.date);
      if (cmpDate !== 0) return cmpDate;
      const cmpTime = a.startTime.localeCompare(b.startTime);
      if (cmpTime !== 0) return cmpTime;
      return a.slotIndex - b.slotIndex;
    });

    return rows;
  }, [activeSchedule, activeRoleNode, activeServices, activeMonths, activeMonthsSet, overrides, events, assignments, regularServices]);

  // Group occurrence rows by Date + Service
  const groupedOccurrences = useMemo(() => {
    interface OccurrenceGroup {
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
      slots: typeof editorOccurrences;
    }

    const groups: OccurrenceGroup[] = [];
    const map = new Map<string, OccurrenceGroup>();

    for (const row of editorOccurrences) {
      const key = `${row.targetId}_${row.date}`;
      if (!map.has(key)) {
        const group: OccurrenceGroup = {
          groupKey: key,
          date: row.date,
          targetType: row.targetType,
          targetId: row.targetId,
          name: row.name,
          color: row.color,
          startTime: row.startTime,
          endTime: row.endTime,
          isCancelled: row.isCancelled,
          noServiceOnDate: row.noServiceOnDate,
          slots: [row]
        };
        map.set(key, group);
        groups.push(group);
      } else {
        map.get(key)!.slots.push(row);
      }
    }

    return groups;
  }, [editorOccurrences]);

  // Group into collapsible Month sections (e.g., "November 2026")
  const monthGroups = useMemo(() => {
    interface MonthSection {
      monthKey: string;
      monthTitle: string;
      totalSlots: number;
      filledSlots: number;
      unassignedCount: number;
      dateGroups: typeof groupedOccurrences;
    }

    const sections: MonthSection[] = [];
    for (const ym of activeMonths) {
      const datesInThisMonth = groupedOccurrences.filter(g => g.date.startsWith(ym));
      let totalSlots = 0;
      let filledSlots = 0;
      for (const g of datesInThisMonth) {
        for (const slot of g.slots) {
          if (slot.isCancelled) continue;
          totalSlots++;
          if (slot.assignment?.personName) filledSlots++;
        }
      }
      sections.push({
        monthKey: ym,
        monthTitle: formatMonthLong(ym),
        totalSlots,
        filledSlots,
        unassignedCount: Math.max(0, totalSlots - filledSlots),
        dateGroups: datesInThisMonth
      });
    }
    return sections;
  }, [activeMonths, groupedOccurrences]);

  // Statistics for active schedule in editor
  const editorStats = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const row of editorOccurrences) {
      if (row.isCancelled) continue;
      total++;
      if (row.assignment?.personName) filled++;
    }
    const unassigned = Math.max(0, total - filled);
    return { total, filled, unassigned };
  }, [editorOccurrences]);

  // Card stats helper for any Schedule card across all included months
  const getScheduleCardInfo = (schedule: Schedule) => {
    const roleNode = nodesMap.get(schedule.roleId);
    let parentTitle = '';
    if (roleNode?.parentId) {
      parentTitle = nodesMap.get(roleNode.parentId)?.title || '';
    }

    const schedMonths = getMonthsForSchedule(schedule);
    const schedMonthsSet = new Set(schedMonths);
    const schedServices = regularServices.filter(s => (schedule.serviceIds || []).includes(s.id));
    let totalSlots = 0;
    let filledSlots = 0;
    const assignedNamesSet = new Set<string>();

    for (const s of schedServices) {
      const roleSpec = s.requiredRoles?.find(r => r.roleId === schedule.roleId);
      const slotCount = roleSpec ? roleSpec.count : 1;

      for (const ym of schedMonths) {
        const dates = getRecurringDates(getMonthStartDate(ym), getMonthEndDate(ym), s.daysOfWeek);
        for (const d of dates) {
          const override = overrides.find(o => o.serviceId === s.id && o.date === d);
          if (override?.isCancelled) continue;

          for (let slot = 0; slot < slotCount; slot++) {
            totalSlots++;
            const as = assignments.find(
              a => a.targetId === s.id && a.date === d && a.roleId === schedule.roleId && (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null)))
            );
            if (as?.personName) {
              filledSlots++;
              assignedNamesSet.add(as.personName);
            }
          }
        }
      }
    }

    if (schedule.includeEvents) {
      const relevantEvents = events.filter(
        ev => !ev.isTemplate &&
          schedMonthsSet.has(ev.startDate.substring(0, 7)) &&
          ev.requiredRoles?.some(r => r.roleId === schedule.roleId)
      );

      for (const ev of relevantEvents) {
        const roleSpec = ev.requiredRoles?.find(r => r.roleId === schedule.roleId);
        const slotCount = roleSpec ? roleSpec.count : 1;

        for (let slot = 0; slot < slotCount; slot++) {
          totalSlots++;
          const as = assignments.find(
            a => a.targetId === ev.id && a.date === ev.startDate && a.roleId === schedule.roleId && (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null)))
          );
          if (as?.personName) {
            filledSlots++;
            assignedNamesSet.add(as.personName);
          }
        }
      }
    }

    const unassignedCount = Math.max(0, totalSlots - filledSlots);
    const progressPercent = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

    return {
      roleTitle: roleNode?.title || schedule.roleName,
      parentTitle,
      roleNode,
      totalSlots,
      filledSlots,
      unassignedCount,
      assignedNames: Array.from(assignedNamesSet),
      progressPercent,
      months: schedMonths
    };
  };

  // Conflict overlap checker
  const checkConflict = (personId: string, personName: string, date: string, startTime: string, endTime?: string, currentSlotId?: string) => {
    if (!personName) return null;

    const sameDay = assignments.filter(
      a => a.date === date && a.id !== currentSlotId && (
        (personId && a.personId === personId) ||
        (a.personName.trim().toLowerCase() === personName.trim().toLowerCase())
      )
    );

    for (const other of sameDay) {
      if (doTimesOverlap(startTime, endTime, other.startTime, other.endTime)) {
        return {
          otherRoleName: other.roleName,
          otherTime: other.startTime
        };
      }
    }
    return null;
  };

  // Assign person to slot
  const handleAssignPerson = async (
    targetType: 'regular_service' | 'event',
    targetId: string,
    date: string,
    slotIndex: number,
    startTime: string,
    endTime: string | undefined,
    personIdOrCustom: string
  ) => {
    if (!activeSchedule) return;

    const slotKey = `${targetId}_${date}_${activeSchedule.roleId}_${slotIndex}`;

    if (!personIdOrCustom) {
      await deleteAssignment(slotKey);
      setRecentSavedSlot(slotKey);
      setTimeout(() => setRecentSavedSlot(null), 2000);
      return;
    }

    const matchedPerson = people.find(p => p.id === personIdOrCustom);
    const pId = matchedPerson ? matchedPerson.id : '';
    const pName = matchedPerson ? matchedPerson.name : personIdOrCustom.trim();

    await saveAssignment({
      targetType,
      targetId,
      date,
      roleId: activeSchedule.roleId,
      roleName: activeRoleNode?.title || activeSchedule.roleName,
      slotIndex,
      personId: pId,
      personName: pName,
      startTime,
      endTime: endTime || ''
    });

    setRecentSavedSlot(slotKey);
    setTimeout(() => setRecentSavedSlot(null), 2000);
  };

  // Helper Tool: Rotate Through People
  const handleApplyRotation = async () => {
    if (rotationPeopleIds.length === 0 || !activeSchedule) return;

    const chosenPeople = rotationPeopleIds
      .map(id => people.find(p => p.id === id))
      .filter(Boolean) as Person[];

    if (chosenPeople.length === 0) return;

    let personIdx = 0;
    for (const row of editorOccurrences) {
      if (row.isCancelled) continue;
      if (!row.assignment?.personName) {
        const assignedPerson = chosenPeople[personIdx % chosenPeople.length];
        await saveAssignment({
          targetType: row.targetType,
          targetId: row.targetId,
          date: row.date,
          roleId: activeSchedule.roleId,
          roleName: activeRoleNode?.title || activeSchedule.roleName,
          slotIndex: row.slotIndex,
          personId: assignedPerson.id,
          personName: assignedPerson.name,
          startTime: row.startTime,
          endTime: row.endTime || ''
        });
        personIdx++;
      }
    }

    setIsRotateModalOpen(false);
  };

  // Helper Tool: Repeat Last Person
  const handleRepeatLastPerson = async () => {
    if (!activeSchedule) return;

    const filledRows = editorOccurrences.filter(r => !r.isCancelled && r.assignment?.personName);
    if (filledRows.length === 0) return;

    const lastFilled = filledRows[filledRows.length - 1];
    const personToRepeat = lastFilled.assignment;
    if (!personToRepeat) return;

    for (const row of editorOccurrences) {
      if (row.isCancelled) continue;
      if (!row.assignment?.personName) {
        await saveAssignment({
          targetType: row.targetType,
          targetId: row.targetId,
          date: row.date,
          roleId: activeSchedule.roleId,
          roleName: activeRoleNode?.title || activeSchedule.roleName,
          slotIndex: row.slotIndex,
          personId: personToRepeat.personId,
          personName: personToRepeat.personName,
          startTime: row.startTime,
          endTime: row.endTime || ''
        });
      }
    }
  };

  // Helper Tool: Clear All Schedule Assignments
  const handleClearAllScheduleAssignments = async () => {
    if (!activeSchedule) return;

    for (const row of editorOccurrences) {
      if (row.assignment) {
        await deleteAssignment(row.assignment.id);
      }
    }
    setIsClearAllModalOpen(false);
  };

  // Gaps calculation (next 4 weeks)
  const gapsList = useMemo(() => {
    const gaps: {
      date: string;
      service: RegularService;
      roleId: string;
      roleName: string;
      slotIndex: number;
    }[] = [];

    const today = new Date();
    const fourWeeksLater = new Date();
    fourWeeksLater.setDate(today.getDate() + 28);
    const endStr = toDateString(fourWeeksLater);

    for (const service of regularServices) {
      if (!service.requiredRoles || service.requiredRoles.length === 0) continue;
      const dates = getRecurringDates(todayStr, endStr, service.daysOfWeek);

      for (const d of dates) {
        const override = overrides.find(o => o.serviceId === service.id && o.date === d);
        if (override?.isCancelled) continue;

        for (const rSpec of service.requiredRoles) {
          for (let slot = 0; slot < rSpec.count; slot++) {
            const hasAssignment = assignments.some(
              a => a.targetId === service.id && a.date === d && a.roleId === rSpec.roleId && (a.slotIndex === slot || (slot === 0 && (a.slotIndex === undefined || a.slotIndex === null)))
            );
            if (!hasAssignment) {
              gaps.push({
                date: d,
                service,
                roleId: rSpec.roleId,
                roleName: rSpec.roleName,
                slotIndex: slot
              });
            }
          }
        }
      }
    }

    gaps.sort((a, b) => a.date.localeCompare(b.date));
    return gaps;
  }, [regularServices, assignments, overrides, todayStr]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 motion-page-enter">
      {/* =========================================================================
          SCHEDULES CARD GRID & GAPS TAB (Base Page)
         ========================================================================= */}
      <div className="space-y-6">
        {/* Top Header & Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-main">Schedules & Rosters</h1>
            <p className="text-sm text-sec mt-0.5">
              {isViewer
                ? 'View volunteer ministry schedules across upcoming services and events.'
                : 'Manage volunteer role schedules across upcoming periods and detect upcoming staffing vacancies.'}
            </p>
          </div>

          {!isViewer && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Tab Switcher */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-subtle border border-subtle">
                <button
                  type="button"
                  onClick={() => setActiveTab('schedules')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'schedules'
                      ? 'bg-surface text-main shadow-xs'
                      : 'text-sec hover:text-main'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  <span>Schedules ({displaySchedules.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('gaps')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'gaps'
                      ? 'bg-surface text-main shadow-xs'
                      : 'text-sec hover:text-main'
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${gapsList.length > 0 ? 'text-amber-500' : 'text-sec'}`} />
                  <span>Upcoming Gaps ({gapsList.length})</span>
                </button>
              </div>

              {/* New Schedule Button */}
              {activeTab === 'schedules' && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Schedule</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Loading state while Firestore collections arrive */}
        {dataLoading.schedules ? (
          <PageLoading />
        ) : (
          <>
        {/* TAB 1: SCHEDULE CARDS GRID */}
        {activeTab === 'schedules' && (
          <div>
            {displaySchedules.length === 0 ? (
              <div className="p-12 rounded-2xl bg-surface border border-subtle text-center space-y-4 shadow-card">
                <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
                  <Calendar className="w-7 h-7" />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-base font-semibold text-main">No schedules yet</h3>
                  <p className="text-xs text-sec mt-1.5 leading-relaxed">
                    {isViewer
                      ? 'No ministry schedules have been created yet.'
                      : 'No schedules yet. Create one for a ministry role, like Song Leader or Pianist.'}
                  </p>
                </div>
                {!isViewer && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Schedule</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 ${
                  isViewer ? 'sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4' : 'md:grid-cols-2 lg:grid-cols-3 gap-5'
                } motion-list-enter viewer-stagger-grid`}
              >
                {displaySchedules.map((schedule) => {
                  const info = getScheduleCardInfo(schedule);

                  return (
                    <div
                      key={schedule.id}
                      className={`rounded-2xl bg-surface border border-subtle shadow-card hover:shadow-md motion-card flex flex-col justify-between ${
                        isViewer ? 'p-3.5 sm:p-4 space-y-2.5' : 'p-5 space-y-4'
                      }`}
                    >
                      <div className={isViewer ? 'space-y-1.5' : 'space-y-3'}>
                        {/* Role name and parent ministry */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {info.parentTitle && (
                              <span
                                className={`text-[11px] font-semibold text-accent uppercase tracking-wider block truncate ${
                                  isViewer ? 'mb-0.5' : 'mb-1'
                                }`}
                              >
                                {info.parentTitle}
                              </span>
                            )}
                            <div className={`flex items-start ${isViewer ? 'gap-2' : 'gap-2.5'}`}>
                              {info.roleNode && isImportantRole(info.roleNode) && (
                                <span className="text-accent shrink-0 mt-0.5" title="Important Role">
                                  {renderRoleIcon(
                                    info.roleNode.icon,
                                    isViewer ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]'
                                  )}
                                </span>
                              )}
                              <h3
                                className={`font-bold text-main break-words ${
                                  isViewer
                                    ? 'text-base sm:text-lg leading-snug'
                                    : 'text-xl sm:text-[22px] leading-tight sm:leading-snug'
                                }`}
                              >
                                {info.roleTitle}
                              </h3>
                            </div>
                          </div>

                          {/* Warning badge or fully staffed badge (Secretary only) */}
                          {!isViewer && (
                            info.unassignedCount > 0 ? (
                              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 shrink-0 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>{info.unassignedCount} unfilled</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shrink-0 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Filled</span>
                              </span>
                            )
                          )}
                        </div>

                        {/* Months Covered */}
                        <div className="flex items-center gap-1.5 text-xs text-sec flex-wrap">
                          <CalendarDays className="w-3.5 h-3.5 text-mut shrink-0" />
                          <span className="font-semibold text-main">
                            {formatMonthsSummary(info.months)}
                          </span>
                          <span className="text-[11px] text-mut">
                            ({info.months.length} {info.months.length === 1 ? 'month' : 'months'})
                          </span>
                        </div>

                        {/* Progress indicator across all months (Secretary only) */}
                        {!isViewer && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-sec font-medium">
                                {info.filledSlots} of {info.totalSlots} dates filled
                              </span>
                              <span className="font-semibold text-main tabular-nums">
                                {info.progressPercent}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-subtle overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  info.progressPercent === 100
                                    ? 'bg-emerald-500'
                                    : info.progressPercent > 50
                                      ? 'bg-accent'
                                      : 'bg-amber-500'
                                }`}
                                style={{ width: `${info.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Preview chips of first few assigned people (Secretary only) */}
                        {!isViewer && (
                          <div className="pt-2">
                            <div className="text-[11px] font-medium text-mut mb-1.5">
                              Scheduled Volunteers:
                            </div>
                            {info.assignedNames.length === 0 ? (
                              <div className="text-xs text-mut italic">
                                No one assigned yet
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {info.assignedNames.slice(0, 3).map((name, nIdx) => (
                                  <span
                                    key={nIdx}
                                    className="px-2 py-0.5 rounded-md bg-subtle text-sec text-[11px] font-medium"
                                  >
                                    {name}
                                  </span>
                                ))}
                                {info.assignedNames.length > 3 && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-mut">
                                    +{info.assignedNames.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Actions: Open/Edit (or View Schedule), Delete */}
                      <div
                        className={`border-t border-subtle flex items-center justify-between gap-2 ${
                          isViewer ? 'pt-2.5' : 'pt-3'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setScheduleViewMode('list');
                            setActiveScheduleId(schedule.id);
                          }}
                          className={`rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                            isViewer ? 'px-3 py-1.5' : 'px-3.5 py-1.5'
                          }`}
                        >
                          <span>{isViewer ? 'View Schedule' : 'Open / Edit'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {!isViewer && (
                          <button
                            type="button"
                            onClick={() => setScheduleToDelete(schedule)}
                            className="p-1.5 rounded-lg text-sec hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Delete Schedule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: UPCOMING GAPS TABLE */}
        {!isViewer && activeTab === 'gaps' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm mb-0.5">Upcoming Vacancy Detection (Next 4 Weeks)</p>
                <p>
                  These are recurring service dates within the next 28 days that require a volunteer role but currently have no person assigned. You can assign a volunteer directly using the dropdowns below.
                </p>
              </div>
            </div>

            {gapsList.length === 0 ? (
              <div className="p-12 rounded-2xl bg-surface border border-subtle text-center space-y-4 shadow-card">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-main">No gaps found!</h3>
                <p className="text-xs text-sec max-w-md mx-auto">
                  Every required role across all services for the next 4 weeks has an assigned person. Great job staying ahead!
                </p>
              </div>
            ) : (
              <div className="bg-surface rounded-2xl border border-subtle shadow-card overflow-hidden motion-list-enter">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-subtle bg-subtle/50 text-mut uppercase tracking-wider font-semibold">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Service</th>
                        <th className="py-3 px-4">Missing Role</th>
                        <th className="py-3 px-4 min-w-[260px]">Assign Now</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {gapsList.map((gap, gIdx) => {
                        const roleNode = nodesMap.get(gap.roleId);
                        const eligiblePeople = (roleNode?.assignedPeopleIds || [])
                          .map(pId => peopleMap.get(pId))
                          .filter(Boolean) as Person[];

                        return (
                          <tr key={gIdx} className="hover:bg-surface-hover/70 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-main">
                              {formatDate(gap.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: gap.service.color }}
                                />
                                <span className="font-semibold text-main">{gap.service.name}</span>
                                <span className="text-mut tabular-nums">
                                  ({formatTime(gap.service.startTime, settings.timeFormat)})
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
                                {gap.roleName} (Spot {gap.slotIndex + 1})
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <select
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) {
                                    const targetPerson = peopleMap.get(val);
                                    if (targetPerson) {
                                      saveAssignment({
                                        targetType: 'regular_service',
                                        targetId: gap.service.id,
                                        date: gap.date,
                                        roleId: gap.roleId,
                                        roleName: gap.roleName,
                                        slotIndex: gap.slotIndex,
                                        personId: targetPerson.id,
                                        personName: targetPerson.name,
                                        startTime: gap.service.startTime,
                                        endTime: gap.service.endTime || ''
                                      });
                                    }
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl border border-subtle bg-field text-main text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/40"
                              >
                                <option value="">Select a volunteer to fill gap...</option>
                                {eligiblePeople.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* =========================================================================
          SCHEDULE EDITOR COMPACT POPUP MODAL
         ========================================================================= */}
      {activeSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-full ${
              scheduleViewMode === 'calendar' ? 'max-w-4xl' : 'max-w-2xl sm:max-w-3xl'
            } bg-surface border border-subtle rounded-2xl shadow-xl text-main max-h-[88vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 transition-[max-width] duration-200`}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-subtle bg-surface space-y-2.5 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeRoleNode && isImportantRole(activeRoleNode) && (
                      <span className="text-accent shrink-0">
                        {renderRoleIcon(activeRoleNode.icon, "w-5 h-5")}
                      </span>
                    )}
                    <h3 className="text-base sm:text-lg font-bold text-main leading-tight truncate">
                      {activeRoleNode?.title || activeSchedule.roleName}
                    </h3>
                    {activeRoleNode?.parentId && nodesMap.get(activeRoleNode.parentId) && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-subtle text-sec font-medium">
                        {nodesMap.get(activeRoleNode.parentId)?.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-sec flex-wrap">
                    <Clock className="w-3.5 h-3.5 text-mut shrink-0" />
                    <span>
                      {formatMonthsSummary(activeMonths)} ({activeMonths.length} {activeMonths.length === 1 ? 'month' : 'months'})
                    </span>
                    <span>·</span>
                    <span>{activeRolePeople.length} qualified</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isViewer && recentSavedSlot && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 motion-notice-in">
                      <Check className="w-3 h-3" />
                      <span>Saved</span>
                    </span>
                  )}
                  {editorStats.unassigned > 0 ? (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>{editorStats.unassigned} unassigned</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>All filled</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveScheduleId(null)}
                    className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle cursor-pointer transition-colors"
                    title="Close Schedule Editor"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Services included line of chips */}
              <div className="pt-2 border-t border-subtle flex items-center gap-1.5 flex-wrap text-xs">
                <span className="font-semibold text-sec text-[11px] shrink-0">Services included:</span>
                {activeServices.map(srv => (
                  <span
                    key={srv.id}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-subtle text-sec text-xs font-medium border border-subtle"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: srv.color }} />
                    <span className="truncate max-w-[130px]">{srv.name}</span>
                    {!isViewer && (
                      <button
                        type="button"
                        title={`Remove ${srv.name} from this schedule`}
                        onClick={async () => {
                          const updated = (activeSchedule.serviceIds || []).filter(id => id !== srv.id);
                          await updateSchedule(activeSchedule.id, { serviceIds: updated });
                        }}
                        className="text-mut hover:text-red-500 cursor-pointer p-0.5 rounded hover:bg-surface ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}

                {/* Add service dropdown */}
                {!isViewer && regularServices.filter(s => !(activeSchedule.serviceIds || []).includes(s.id)).length > 0 && (
                  <select
                    value=""
                    onChange={async (e) => {
                      const chosenId = e.target.value;
                      if (chosenId) {
                        const updated = [...(activeSchedule.serviceIds || []), chosenId];
                        await updateSchedule(activeSchedule.id, { serviceIds: updated });
                      }
                    }}
                    className="px-2 py-0.5 rounded-md border border-dashed border-subtle bg-field text-accent hover:border-accent text-xs font-semibold cursor-pointer focus:outline-none"
                  >
                    <option value="">+ Add service...</option>
                    {regularServices
                      .filter(s => !(activeSchedule.serviceIds || []).includes(s.id))
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.kind === 'activity' ? ' (Activity)' : ''}</option>
                      ))}
                  </select>
                )}
              </div>

              {/* Months included line of chips */}
              <div className="pt-2 border-t border-subtle flex items-center gap-1.5 flex-wrap text-xs">
                <span className="font-semibold text-sec text-[11px] shrink-0">Months included:</span>
                {activeMonths.map(ym => (
                  <span
                    key={ym}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-subtle text-sec text-xs font-medium border border-subtle"
                  >
                    <Calendar className="w-3 h-3 text-accent shrink-0" />
                    <span>{formatMonthChip(ym)}</span>
                    {!isViewer && activeMonths.length > 1 && (
                      <button
                        type="button"
                        title={`Remove ${formatMonthChip(ym)} from this schedule`}
                        onClick={() => setMonthToRemove(ym)}
                        className="text-mut hover:text-red-500 cursor-pointer p-0.5 rounded hover:bg-surface ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}

                {/* Add month dropdown */}
                {!isViewer && availableMonthsToAdd.length > 0 && (
                  <select
                    value=""
                    onChange={async (e) => {
                      const chosen = e.target.value;
                      if (chosen) {
                        await handleAddMonthToActiveSchedule(chosen);
                      }
                    }}
                    className="px-2 py-0.5 rounded-md border border-dashed border-subtle bg-field text-accent hover:border-accent text-xs font-semibold cursor-pointer focus:outline-none"
                  >
                    <option value="">+ Add month...</option>
                    {availableMonthsToAdd.map(m => (
                      <option key={m.ym} value={m.ym}>{m.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* View Mode Switch (List | Calendar) & Helper Tools */}
              <div className="pt-2 border-t border-subtle flex items-center justify-between gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-subtle border border-subtle">
                  <button
                    type="button"
                    onClick={() => setScheduleViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scheduleViewMode === 'list'
                        ? 'bg-surface text-main shadow-xs'
                        : 'text-sec hover:text-main'
                    }`}
                  >
                    <List className="w-3.5 h-3.5 text-accent" />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleViewMode('calendar')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scheduleViewMode === 'calendar'
                        ? 'bg-surface text-main shadow-xs'
                        : 'text-sec hover:text-main'
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5 text-accent" />
                    <span>Calendar</span>
                  </button>
                </div>

                {!isViewer && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-mut uppercase tracking-wider mr-0.5 hidden sm:inline">
                      Tools:
                    </span>
                    <button
                      type="button"
                      disabled={activeRolePeople.length === 0 || editorStats.unassigned === 0}
                      onClick={() => {
                        setRotationPeopleIds(activeRolePeople.map(p => p.id));
                        setIsRotateModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                      title="Auto-fill unassigned dates by cycling through selected people"
                    >
                      <RotateCw className="w-3 h-3 text-accent" />
                      <span>Rotate through people</span>
                    </button>

                    <button
                      type="button"
                      disabled={editorStats.filled === 0 || editorStats.unassigned === 0}
                      onClick={handleRepeatLastPerson}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                      title="Repeat the most recently assigned person into all remaining unassigned dates"
                    >
                      <Copy className="w-3 h-3 text-accent" />
                      <span>Repeat last person</span>
                    </button>

                    <button
                      type="button"
                      disabled={editorStats.filled === 0}
                      onClick={() => setIsClearAllModalOpen(true)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/60 bg-surface hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                      title="Clear all assignments in this schedule period"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear all</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable Schedule Body: List View or Calendar View */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
              {scheduleViewMode === 'calendar' ? (
                <ScheduleCalendarView
                  key={activeSchedule.id}
                  roleId={activeSchedule.roleId}
                  activeMonths={activeMonths}
                  weekStartDay={settings.weekStartDay}
                  timeFormat={settings.timeFormat}
                  isViewer={isViewer}
                  activeRolePeople={activeRolePeople}
                  groupedOccurrences={groupedOccurrences}
                  recentSavedSlot={recentSavedSlot}
                  checkConflict={checkConflict}
                  onAssignPerson={handleAssignPerson}
                />
              ) : monthGroups.length === 0 ? (
                <div className="p-8 text-center text-xs text-mut bg-subtle rounded-xl border border-subtle space-y-2">
                  <CalendarDays className="w-8 h-8 mx-auto text-accent opacity-50" />
                  <p className="font-semibold text-main">No service dates in this period</p>
                  <p className="text-sec">
                    Please ensure services and months are included in this schedule.
                  </p>
                </div>
              ) : (
                monthGroups.map((mGroup) => {
                  const isCollapsed = !!collapsedMonths[mGroup.monthKey];

                  return (
                    <div
                      key={mGroup.monthKey}
                      className="rounded-xl border border-subtle overflow-hidden bg-surface shadow-2xs"
                    >
                      {/* Collapsible Month Header */}
                      <button
                        type="button"
                        onClick={() => {
                          setCollapsedMonths(prev => ({
                            ...prev,
                            [mGroup.monthKey]: !prev[mGroup.monthKey]
                          }));
                        }}
                        className="w-full px-3 sm:px-4 py-2.5 bg-subtle/80 hover:bg-subtle flex items-center justify-between text-left cursor-pointer transition-colors border-b border-subtle select-none"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`w-4 h-4 text-sec transition-transform duration-200 shrink-0 ${
                              isCollapsed ? '' : 'rotate-90'
                            }`}
                          />
                          <span className="text-xs sm:text-sm font-bold text-main">
                            {mGroup.monthTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-sec bg-surface px-2 py-0.5 rounded-md border border-subtle">
                            {mGroup.filledSlots} of {mGroup.totalSlots} filled
                          </span>
                          {mGroup.unassignedCount > 0 ? (
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                              {mGroup.unassignedCount} needed
                            </span>
                          ) : mGroup.totalSlots > 0 ? (
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                              Complete
                            </span>
                          ) : null}
                        </div>
                      </button>

                      {/* Month Occurrences */}
                      {!isCollapsed && (
                        <div className="p-2 sm:p-3 space-y-2 bg-surface">
                          {mGroup.dateGroups.length === 0 ? (
                            <div className="p-4 text-center text-xs text-mut italic">
                              No service occurrences scheduled in {mGroup.monthTitle}
                            </div>
                          ) : (
                            <>
                              {/* Small 3-column Heading Row */}
                              <div className="grid grid-cols-[minmax(108px,auto)_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1.2fr)_215px] items-center gap-x-3 px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-mut border-b border-subtle/80">
                                <span>Date</span>
                                <span>Service / Activity and time</span>
                                <span className="hidden sm:block">Assigned to</span>
                              </div>

                              {mGroup.dateGroups.map((group) => {
                                const isGroupUnassigned = !group.isCancelled && group.slots.some(s => !s.assignment?.personName);
                                const isToday = group.date === todayStr;

                                return (
                                  <div
                                    key={group.groupKey}
                                    className={`p-2.5 sm:p-3 rounded-xl bg-surface border transition-all ${
                                      group.isCancelled
                                        ? 'opacity-60 border-subtle bg-subtle/30'
                                        : isGroupUnassigned
                                          ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/15 dark:bg-amber-950/10'
                                          : 'border-subtle hover:border-accent/40'
                                    }`}
                                  >
                                    <div className="grid grid-cols-[minmax(108px,auto)_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1.2fr)_215px] items-center gap-x-3 gap-y-2">
                                      {/* Column 1: Larger Bold Date & Day */}
                                      <div className="min-w-0 space-y-1">
                                        <div className="text-[18px] sm:text-[21px] font-extrabold tracking-tight text-main leading-tight">
                                          {formatDate(group.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </div>
                                        {(isToday || group.isCancelled || group.noServiceOnDate) && (
                                          <div className="flex items-center gap-1 flex-wrap">
                                            {isToday && (
                                              <span className="px-1.5 py-0.2 rounded bg-accent-tint text-accent text-[10px] font-bold uppercase tracking-wider">
                                                Today
                                              </span>
                                            )}
                                            {group.isCancelled && (
                                              <span className="px-1.5 py-0.5 rounded bg-subtle text-mut border border-subtle text-[10px] font-semibold line-through">
                                                Cancelled
                                              </span>
                                            )}
                                            {group.noServiceOnDate && (
                                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-medium">
                                                No service on this date
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Column 2: Service/Activity with colored dot + time underneath */}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                            style={{ backgroundColor: group.color }}
                                          />
                                          <span className="text-xs sm:text-sm font-semibold text-main leading-snug break-words">
                                            {group.name}
                                          </span>
                                        </div>
                                        <div className="text-[11px] sm:text-xs text-mut tabular-nums pl-4 mt-0.5">
                                          {formatTime(group.startTime, settings.timeFormat)}
                                          {group.endTime ? ` – ${formatTime(group.endTime, settings.timeFormat)}` : ''}
                                        </div>
                                      </div>

                                      {/* Column 3: Assigned to (Secretary = dropdown, Viewer = plain text) */}
                                      <div className="col-span-2 sm:col-span-1 w-full shrink-0 space-y-1.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-subtle/50">
                                        <div className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-mut">
                                          Assigned to
                                        </div>
                                        {group.isCancelled ? (
                                          <div className="text-xs text-mut italic">
                                            Cancelled
                                          </div>
                                        ) : (
                                          group.slots.map((slot) => {
                                            const slotKey = `${slot.targetId}_${slot.date}_${activeSchedule.roleId}_${slot.slotIndex}`;
                                            const isAssigned = !!slot.assignment?.personName;
                                            const isCustomMode = !!showCustomInput[slotKey];
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
                                              <div key={slotKey} className="space-y-0.5">
                                                {slot.slotCount > 1 && (
                                                  <div className="text-[10px] font-semibold text-sec uppercase tracking-wider">
                                                    Spot {slot.slotIndex + 1}
                                                  </div>
                                                )}

                                                {isViewer ? (
                                                  isAssigned ? (
                                                    <div className="text-xs sm:text-sm font-semibold text-main">
                                                      {slot.assignment!.personName}
                                                    </div>
                                                  ) : (
                                                    <span className="inline-block px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 text-xs font-medium italic">
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
                                                        setCustomNameInputs({ ...customNameInputs, [slotKey]: e.target.value })
                                                      }
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          e.preventDefault();
                                                          const val = (customNameInputs[slotKey] || '').trim();
                                                          if (val) {
                                                            handleAssignPerson(
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
                                                      className="w-full px-2.5 py-1 text-xs rounded-lg border border-accent bg-field text-main focus:outline-none"
                                                    />
                                                    <button
                                                      type="button"
                                                      onMouseDown={(e) => e.preventDefault()}
                                                      onClick={() => {
                                                        const val = (customNameInputs[slotKey] || '').trim();
                                                        if (val) {
                                                          handleAssignPerson(
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
                                                      onClick={() => setShowCustomInput({ ...showCustomInput, [slotKey]: false })}
                                                      className="p-1.5 text-mut hover:text-main rounded-lg text-xs cursor-pointer"
                                                      title="Cancel"
                                                    >
                                                      <X className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center gap-1 w-full">
                                                    <select
                                                      value={slot.assignment?.personId || (slot.assignment?.personName ? '__custom__' : '')}
                                                      onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '__type_name__') {
                                                          setShowCustomInput({ ...showCustomInput, [slotKey]: true });
                                                          setCustomNameInputs({ ...customNameInputs, [slotKey]: '' });
                                                        } else if (val === '__clear__') {
                                                          handleAssignPerson(slot.targetType, slot.targetId, slot.date, slot.slotIndex, slot.startTime, slot.endTime, '');
                                                        } else if (val === '__custom__') {
                                                          // No-op
                                                        } else {
                                                          handleAssignPerson(slot.targetType, slot.targetId, slot.date, slot.slotIndex, slot.startTime, slot.endTime, val);
                                                        }
                                                      }}
                                                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-accent transition-colors cursor-pointer shadow-2xs ${
                                                        isAssigned
                                                          ? 'border-subtle bg-field text-main font-semibold'
                                                          : 'border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300'
                                                      }`}
                                                    >
                                                      <option value="">-- Choose person --</option>
                                                      {activeRolePeople.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                      ))}
                                                      {slot.assignment && !slot.assignment.personId && slot.assignment.personName && (
                                                        <option value="__custom__">
                                                          {slot.assignment.personName} (Custom)
                                                        </option>
                                                      )}
                                                      <option value="__type_name__">+ Type a name...</option>
                                                      {isAssigned && <option value="__clear__">-- Clear --</option>}
                                                    </select>
                                                  </div>
                                                )}

                                                {/* Conflict warning (Secretary only) */}
                                                {!isViewer && conflict && (
                                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                                    <span>Also scheduled for {conflict.otherRoleName}</span>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-subtle bg-surface flex items-center justify-between text-xs text-sec shrink-0">
              <span className="font-medium">
                {editorStats.filled} of {editorStats.total} dates assigned
              </span>
              <button
                type="button"
                onClick={() => setActiveScheduleId(null)}
                className="px-4 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold text-xs shadow-xs cursor-pointer transition-colors"
              >
                {isViewer ? 'Close' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE SCHEDULE MODAL
         ========================================================================= */}
      {!isViewer && isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-5 max-h-[90vh] overflow-y-auto motion-popup-in">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <h3 className="text-lg font-bold text-main flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent" />
                <span>Create a New Schedule</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-sec hover:text-main hover:bg-subtle cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateScheduleSubmit} className="space-y-5 text-xs">
              {/* STEP 1: Choose Ministry / Role */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-main uppercase tracking-wider">
                    Step 1: Choose Ministry / Role *
                  </label>
                  {selectedCreateNodePeople.length > 0 ? (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {selectedCreateNodePeople.length} people attached
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      0 people attached
                    </span>
                  )}
                </div>

                {flatTree.length === 0 ? (
                  <div className="p-3 rounded-xl bg-subtle text-sec leading-relaxed">
                    No ministry roles created yet. Please add roles on the People & Ministries page.
                  </div>
                ) : (
                  <select
                    value={newScheduleRoleId}
                    onChange={(e) => setNewScheduleRoleId(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  >
                    {flatTree.map((item) => (
                      <option key={item.node.id} value={item.node.id}>
                        {'\u00A0\u00A0\u00A0\u00A0'.repeat(item.depth)}
                        {item.depth > 0 ? '↳ ' : ''}
                        {item.node.title} {item.node.assignedPeopleIds?.length ? `(${item.node.assignedPeopleIds.length} attached)` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* Warning / helpful link if no people attached */}
                {selectedCreateNode && selectedCreateNodePeople.length === 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-[11px] flex items-start justify-between gap-2">
                    <div>
                      No people are currently attached to <strong>{selectedCreateNode.title}</strong>. You can attach people in People & Ministries, or you can still create this schedule and manually type in names.
                    </div>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateModalOpen(false);
                          onNavigate('people-ministries');
                        }}
                        className="text-accent underline font-bold shrink-0 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 2: Choose Months */}
              <div className="space-y-2.5 pt-2 border-t border-subtle">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-main uppercase tracking-wider">
                    Step 2: Choose Months *
                  </label>
                  <span className="text-[11px] font-semibold text-sec">
                    Select one or several months
                  </span>
                </div>

                {/* Quick buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                      setNewSelectedMonths([currentYm]);
                      setSelectorBaseYear(now.getFullYear());
                    }}
                    className="px-3 py-1.5 rounded-xl border border-subtle bg-subtle hover:bg-surface-hover text-main text-xs font-semibold cursor-pointer transition-colors"
                  >
                    This month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const next3: string[] = [];
                      for (let i = 0; i < 3; i++) {
                        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                        next3.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                      }
                      setNewSelectedMonths(next3);
                      setSelectorBaseYear(now.getFullYear());
                    }}
                    className="px-3 py-1.5 rounded-xl border border-subtle bg-subtle hover:bg-surface-hover text-main text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Next 3 months
                  </button>
                </div>

                {/* Year Navigation */}
                <div className="flex items-center justify-between px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectorBaseYear(y => y - 1)}
                    className="p-1 rounded-lg border border-subtle text-sec hover:text-main hover:bg-subtle cursor-pointer transition-colors"
                    title="Previous Year"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-main tracking-wide">
                    {selectorBaseYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectorBaseYear(y => y + 1)}
                    className="p-1 rounded-lg border border-subtle text-sec hover:text-main hover:bg-subtle cursor-pointer transition-colors"
                    title="Next Year"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Month Chips Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Array.from({ length: 12 }, (_, i) => {
                    const ym = `${selectorBaseYear}-${String(i + 1).padStart(2, '0')}`;
                    const isSelected = newSelectedMonths.includes(ym);
                    return (
                      <button
                        key={ym}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setNewSelectedMonths(newSelectedMonths.filter(m => m !== ym));
                          } else {
                            setNewSelectedMonths([...newSelectedMonths, ym].sort());
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-accent text-accent-contrast border-accent shadow-xs'
                            : 'bg-surface border-subtle hover:bg-subtle text-main'
                        }`}
                      >
                        <span>{formatMonthChip(ym)}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Selection summary */}
                <div className="text-[11px] text-sec flex items-center justify-between flex-wrap gap-1">
                  <span>
                    {newSelectedMonths.length === 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Please select at least one month</span>
                    ) : (
                      <span>
                        Selected ({newSelectedMonths.length} {newSelectedMonths.length === 1 ? 'month' : 'months'}):{' '}
                        <strong className="text-main">{newSelectedMonths.map(formatMonthChip).join(', ')}</strong>
                      </span>
                    )}
                  </span>
                  {newSelectedMonths.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNewSelectedMonths([])}
                      className="text-mut hover:text-red-500 underline cursor-pointer text-[10px]"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              </div>

              {/* STEP 3: Choose Services & Events to Include */}
              <div className="space-y-2 pt-2 border-t border-subtle">
                <label className="block text-xs font-bold text-main uppercase tracking-wider">
                  Step 3: Services to Include
                </label>
                <p className="text-[11px] text-sec">
                  Select which regular recurring services should be scheduled for this role.
                </p>

                <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-subtle rounded-xl border border-subtle">
                  {regularServices.length === 0 ? (
                    <div className="text-xs text-mut italic p-2">
                      No regular services created yet.
                    </div>
                  ) : (
                    regularServices.map((srv) => {
                      const isChecked = (newServiceIds || []).includes(srv.id);
                      return (
                        <label
                          key={srv.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-surface hover:bg-surface-hover cursor-pointer text-xs font-medium"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewServiceIds(newServiceIds.filter(id => id !== srv.id));
                              } else {
                                setNewServiceIds([...newServiceIds, srv.id]);
                              }
                            }}
                            className="rounded text-accent focus:ring-accent"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: srv.color }}
                          />
                          <span className="text-main font-semibold">{srv.name}{srv.kind === 'activity' ? ' (Activity)' : ''}</span>
                          <span className="text-mut text-[11px] ml-auto tabular-nums">
                            {formatTime(srv.startTime, settings.timeFormat)}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>

                {/* Optional Include Events */}
                <label className="flex items-center gap-2 p-2 rounded-xl bg-subtle cursor-pointer text-xs font-medium mt-2">
                  <input
                    type="checkbox"
                    checked={newIncludeEvents}
                    onChange={(e) => setNewIncludeEvents(e.target.checked)}
                    className="rounded text-accent focus:ring-accent"
                  />
                  <span className="text-main">
                    Also include one-time calendar events that require this role
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isCreatingSchedule}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-subtle text-sec hover:bg-subtle cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSchedule || !newScheduleRoleId || newSelectedMonths.length === 0}
                  className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold shadow-xs disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isCreatingSchedule ? (
                    <>
                      <Spinner size="xs" variant="contrast" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create Schedule</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          ROTATION MODAL
         ========================================================================= */}
      {!isViewer && isRotateModalOpen && activeSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-4 motion-popup-in">
            <h3 className="text-base font-bold text-main flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-accent" />
              <span>Rotate Through People</span>
            </h3>
            <p className="text-xs text-sec">
              Select which volunteers and the order to rotate. The schedule will automatically cycle through them to fill all {editorStats.unassigned} unassigned dates.
            </p>

            <div className="max-h-60 overflow-y-auto space-y-1.5 p-2 bg-subtle rounded-xl border border-subtle">
              {activeRolePeople.length === 0 ? (
                <div className="text-xs text-mut italic p-2">
                  No people attached to this role in People & Ministries. Attach people there first to use auto-rotation.
                </div>
              ) : (
                activeRolePeople.map((p) => {
                  const isChecked = rotationPeopleIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-surface hover:bg-surface-hover cursor-pointer text-xs font-medium"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setRotationPeopleIds(rotationPeopleIds.filter(id => id !== p.id));
                          } else {
                            setRotationPeopleIds([...rotationPeopleIds, p.id]);
                          }
                        }}
                        className="rounded text-accent focus:ring-accent"
                      />
                      <span className="text-main font-semibold">{p.name}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsRotateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-subtle text-sec font-medium hover:bg-subtle cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rotationPeopleIds.length === 0}
                onClick={handleApplyRotation}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold shadow-xs disabled:opacity-40 cursor-pointer"
              >
                Apply Rotation ({rotationPeopleIds.length} people)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Schedule Confirmation */}
      {!isViewer && (
        <ConfirmModal
          isOpen={!!scheduleToDelete}
          title="Delete Schedule Card?"
          message={`Are you sure you want to delete the schedule card for "${scheduleToDelete?.roleName}"? Your volunteer assignments on the calendar will be preserved.`}
          confirmLabel="Delete Schedule"
          onConfirm={() => {
            if (scheduleToDelete) {
              deleteSchedule(scheduleToDelete.id, false);
              setScheduleToDelete(null);
            }
          }}
          onCancel={() => setScheduleToDelete(null)}
        />
      )}

      {/* Clear All Assignments Confirmation */}
      {!isViewer && (
        <ConfirmModal
          isOpen={isClearAllModalOpen}
          title="Clear All Assignments for this Schedule?"
          message="This will remove all person assignments across this schedule period. Unassigned slots can be reassigned or rotated."
          confirmLabel="Clear All"
          onConfirm={handleClearAllScheduleAssignments}
          onCancel={() => setIsClearAllModalOpen(false)}
        />
      )}

      {/* Remove Month from Schedule Confirmation */}
      {!isViewer && (
        <ConfirmModal
          isOpen={!!monthToRemove}
          title={`Remove ${monthToRemove ? formatMonthChip(monthToRemove) : 'Month'} from Schedule?`}
          message={`This will hide dates in ${monthToRemove ? formatMonthLong(monthToRemove) : 'this month'} from this schedule card. All saved volunteer assignments in Firebase will be preserved and will reappear if you add this month back.`}
          confirmLabel="Remove Month"
          onConfirm={handleConfirmRemoveMonth}
          onCancel={() => setMonthToRemove(null)}
        />
      )}
    </div>
  );
};
