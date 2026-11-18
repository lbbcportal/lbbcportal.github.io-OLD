/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Check,
  CheckSquare,
  Calendar,
  Clock,
  User,
  Tag,
  Flag,
  Repeat,
  Link as LinkIcon,
  Plus,
  Trash2,
  Info
} from 'lucide-react';
import {
  Task,
  TaskPriority,
  TaskStatus,
  TaskRepeatType,
  TaskLink,
  TaskCategory,
  Person,
  ChurchEvent,
  RegularService
} from '../types';
import { toDateString } from '../lib/dateTime';
import { calculateLinkedDueDate } from '../lib/taskHelpers';
import { useData } from '../context/DataContext';
import { Spinner } from './LoadingIndicator';

export interface TaskEditorModalProps {
  isOpen: boolean;
  task?: Task | null;
  editingTask?: Task | null;
  onClose: () => void;
  onSave?: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, customId?: string) => Promise<string | void>;
  categories?: TaskCategory[];
  people?: Person[];
  events?: ChurchEvent[];
  regularServices?: RegularService[];
  prefilledDate?: string;
  prefilledLink?: TaskLink;
  prefilledTitle?: string;
  prefilledDetails?: string;
}

const WEEKDAYS = [
  { day: 0, label: 'Sun' },
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  isOpen,
  task,
  editingTask,
  onClose,
  onSave,
  categories,
  people,
  events,
  regularServices,
  prefilledDate,
  prefilledLink,
  prefilledTitle,
  prefilledDetails
}) => {
  const data = useData();
  const currentTask = task !== undefined ? task : editingTask;
  const currentCategories = categories || data.taskCategories;
  const currentPeople = people || data.people;
  const currentEvents = events || data.events;
  const currentServices = regularServices || data.regularServices;

  const currentSave = onSave || (async (taskData, customId) => {
    if (currentTask) {
      await data.updateTask(currentTask.id, taskData);
    } else {
      await data.addTask(taskData, customId);
    }
  });

  if (!isOpen) return null;

  const isEditing = !!currentTask;
  const draftIdRef = useRef<string>(currentTask?.id || ('task_' + Math.random().toString(36).substring(2, 10)));

  // Form states
  const [title, setTitle] = useState(currentTask?.title || prefilledTitle || '');
  const [details, setDetails] = useState(currentTask?.details || prefilledDetails || '');
  const [categoryId, setCategoryId] = useState(currentTask?.categoryId || '');
  const [priority, setPriority] = useState<TaskPriority>(currentTask?.priority || 'normal');
  const [status, setStatus] = useState<TaskStatus>(currentTask?.status || 'todo');

  // Dates & Times
  const [dueDate, setDueDate] = useState<string>(currentTask?.dueDate || prefilledDate || '');
  const [dueTime, setDueTime] = useState<string>(currentTask?.dueTime || '');

  // Assignment: select existing person OR type custom name
  const [assignMode, setAssignMode] = useState<'person' | 'custom'>(
    currentTask?.assignedPersonId ? 'person' : currentTask?.assignedTo ? 'custom' : 'person'
  );
  const [assignedPersonId, setAssignedPersonId] = useState<string>(currentTask?.assignedPersonId || '');
  const [assignedCustomName, setAssignedCustomName] = useState<string>(
    currentTask?.assignedPersonId ? '' : currentTask?.assignedTo || ''
  );

  // Link to event or service
  const initialLink = currentTask?.link || prefilledLink;
  const [isLinked, setIsLinked] = useState<boolean>(!!initialLink);
  const [linkType, setLinkType] = useState<'event' | 'regular_service'>(initialLink?.targetType || 'event');
  const [linkTargetId, setLinkTargetId] = useState<string>(initialLink?.targetId || '');
  const [linkDaysBefore, setLinkDaysBefore] = useState<number>(initialLink?.daysBefore ?? 0);

  // Repeat Config
  const [repeatType, setRepeatType] = useState<TaskRepeatType>(currentTask?.repeat?.type || 'none');
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(currentTask?.repeat?.weekdays || [0]);
  const [repeatMonthDays, setRepeatMonthDays] = useState<(number | 'last')[]>(
    currentTask?.repeat?.monthDays || [1]
  );
  const [newMonthDayInput, setNewMonthDayInput] = useState<string>('15');
  const [repeatServiceId, setRepeatServiceId] = useState<string>(currentTask?.repeat?.serviceId || currentServices[0]?.id || '');
  const [repeatDaysBefore, setRepeatDaysBefore] = useState<number>(currentTask?.repeat?.daysBefore ?? 0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valid 30-minute time intervals
  const timeOptions = useMemo(() => {
    const list: { val: string; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const rawTime = `${hh}:${mm}`;

        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        const displayLabel = `${displayH}:${mm} ${ampm}`;
        list.push({ val: rawTime, label: displayLabel });
      }
    }
    return list;
  }, []);

  // Compute live auto-calculated due date if linked
  const calculatedDueDate = useMemo(() => {
    if (!isLinked || !linkTargetId) return null;
    return calculateLinkedDueDate(
      {
        targetType: linkType,
        targetId: linkTargetId,
        daysBefore: linkDaysBefore
      },
      currentEvents,
      currentServices
    );
  }, [isLinked, linkType, linkTargetId, linkDaysBefore, currentEvents, currentServices]);

  // Weekday toggle
  const toggleWeekday = (day: number) => {
    setRepeatWeekdays(prev =>
      prev.includes(day)
        ? prev.length > 1 ? prev.filter(d => d !== day) : prev
        : [...prev, day].sort()
    );
  };

  // Add month day
  const handleAddMonthDay = () => {
    if (newMonthDayInput === 'last') {
      if (!repeatMonthDays.includes('last')) {
        setRepeatMonthDays(prev => [...prev, 'last']);
      }
      return;
    }
    const num = parseInt(newMonthDayInput, 10);
    if (!isNaN(num) && num >= 1 && num <= 31 && !repeatMonthDays.includes(num)) {
      setRepeatMonthDays(prev => [...prev, num]);
    }
  };

  const removeMonthDay = (item: number | 'last') => {
    if (repeatMonthDays.length <= 1) return;
    setRepeatMonthDays(prev => prev.filter(d => d !== item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a task title.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Resolve assigned name
      let finalAssignedTo: string | undefined = undefined;
      let finalAssignedPersonId: string | undefined = undefined;

      if (assignMode === 'person' && assignedPersonId) {
        finalAssignedPersonId = assignedPersonId;
        const p = currentPeople.find(item => item.id === assignedPersonId);
        finalAssignedTo = p ? p.name : undefined;
      } else if (assignMode === 'custom' && assignedCustomName.trim()) {
        finalAssignedTo = assignedCustomName.trim();
        finalAssignedPersonId = undefined;
      }

      // Resolve link
      const link: TaskLink | undefined = isLinked && linkTargetId
        ? {
            targetType: linkType,
            targetId: linkTargetId,
            daysBefore: Number(linkDaysBefore) || 0
          }
        : undefined;

      // Effective due date
      const finalDueDate = calculatedDueDate || (dueDate ? dueDate : undefined);

      // Repeat config
      let repeatConfig: any = undefined;
      if (repeatType !== 'none') {
        if (repeatType === 'daily') {
          repeatConfig = { type: 'daily' };
        } else if (repeatType === 'weekly') {
          repeatConfig = { type: 'weekly', weekdays: repeatWeekdays };
        } else if (repeatType === 'monthly') {
          repeatConfig = { type: 'monthly', monthDays: repeatMonthDays };
        } else if (repeatType === 'yearly') {
          repeatConfig = { type: 'yearly' };
        } else if (repeatType === 'service_occurrence') {
          repeatConfig = {
            type: 'service_occurrence',
            serviceId: repeatServiceId,
            daysBefore: Number(repeatDaysBefore) || 0
          };
        }
      }

      await currentSave(
        {
          title: title.trim(),
          details: details.trim() || undefined,
          categoryId: categoryId || undefined,
          priority,
          status,
          dueDate: finalDueDate,
          dueTime: dueTime || undefined,
          assignedTo: finalAssignedTo,
          assignedPersonId: finalAssignedPersonId,
          link,
          repeat: repeatConfig,
          completedDates: currentTask?.completedDates || [],
          snoozedUntil: currentTask?.snoozedUntil || undefined
        },
        draftIdRef.current
      );

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-100">
      <div className="relative w-full max-w-2xl bg-surface border border-subtle rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle bg-canvas shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-main">
                {isEditing ? 'Edit Task' : 'New Task'}
              </h2>
              <p className="text-xs text-mut">
                Plan, assign, schedule, and track ministry responsibilities
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Prepare communion elements, Print bulletin, Vacuum stage"
              className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent font-medium"
            />
          </div>

          {/* Details */}
          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Details & Instructions (Optional)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional notes, checklist steps, or location details..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent font-sans leading-relaxed"
            />
          </div>

          {/* Category, Priority, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              >
                <option value="">No category</option>
                {currentCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <div className="grid grid-cols-3 gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                {(['low', 'normal', 'high'] as TaskPriority[]).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`py-1 text-xs font-semibold rounded-lg capitalize transition-all cursor-pointer ${
                        isSelected
                          ? p === 'high'
                            ? 'bg-red-500 text-white shadow-2xs'
                            : p === 'normal'
                            ? 'bg-accent text-accent-contrast shadow-2xs'
                            : 'bg-surface text-main border border-strong shadow-2xs'
                          : 'text-mut hover:text-main'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          {/* Assigned To */}
          <div className="p-3.5 rounded-xl border border-subtle bg-subtle/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-accent" />
                <span>Assigned To (Optional)</span>
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAssignMode('person')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    assignMode === 'person' ? 'bg-surface font-semibold text-main shadow-2xs' : 'text-mut hover:text-main'
                  }`}
                >
                  From Roster
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('custom')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    assignMode === 'custom' ? 'bg-surface font-semibold text-main shadow-2xs' : 'text-mut hover:text-main'
                  }`}
                >
                  Type Name
                </button>
              </div>
            </div>

            {assignMode === 'person' ? (
              <select
                value={assignedPersonId}
                onChange={(e) => setAssignedPersonId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              >
                <option value="">Unassigned</option>
                {currentPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={assignedCustomName}
                onChange={(e) => setAssignedCustomName(e.target.value)}
                placeholder="Type assignee's name (e.g. Bro. David, Sis. Sarah)..."
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>

          {/* Due Date & Time (Independent from link) */}
          {!isLinked && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span>Due Date (Optional)</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span>Due Time (Optional, 12h)</span>
                </label>
                <select
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                >
                  <option value="">No specific time</option>
                  {timeOptions.map(t => (
                    <option key={t.val} value={t.val}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Link to Event or Service */}
          <div className="p-4 rounded-xl border border-subtle bg-subtle/25 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isLinked}
                  onChange={(e) => setIsLinked(e.target.checked)}
                  className="rounded text-accent focus:ring-accent/40 cursor-pointer"
                />
                <span className="text-xs font-bold text-main flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-accent" />
                  <span>Link to an Event or Regular Service</span>
                </span>
              </label>
              {isLinked && (
                <span className="text-[11px] text-accent font-semibold">
                  Due date follows automatically
                </span>
              )}
            </div>

            {isLinked && (
              <div className="pt-2 border-t border-subtle space-y-3 animate-in fade-in duration-100">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Link Target Type */}
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-sec font-medium mb-1">
                      Link Target:
                    </label>
                    <select
                      value={linkType}
                      onChange={(e) => {
                        const newType = e.target.value as 'event' | 'regular_service';
                        setLinkType(newType);
                        setLinkTargetId('');
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                    >
                      <option value="event">One-time Event</option>
                      <option value="regular_service">Regular Service</option>
                    </select>
                  </div>

                  {/* Specific Event or Service selection */}
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] text-sec font-medium mb-1">
                      {linkType === 'event' ? 'Select Event:' : 'Select Regular Service:'}
                    </label>
                    <select
                      value={linkTargetId}
                      onChange={(e) => setLinkTargetId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                    >
                      <option value="">Choose...</option>
                      {linkType === 'event'
                        ? currentEvents
                            .filter(ev => !ev.isTemplate)
                            .map(ev => (
                              <option key={ev.id} value={ev.id}>
                                {ev.title} ({ev.startDate})
                              </option>
                            ))
                        : currentServices.map(srv => (
                            <option key={srv.id} value={srv.id}>
                              {srv.name} {srv.kind === 'activity' ? '(Activity)' : ''} ({srv.startTime})
                            </option>
                          ))}
                    </select>
                  </div>

                  {/* Due [N] days before */}
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-sec font-medium mb-1">
                      Due [N] days before:
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={linkDaysBefore}
                      onChange={(e) => setLinkDaysBefore(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder="0 = same day"
                    />
                  </div>
                </div>

                {calculatedDueDate ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Calculated due date: <strong>{calculatedDueDate}</strong> ({linkDaysBefore === 0 ? 'Same day as event/service' : `${linkDaysBefore} day(s) before`}).
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-mut">
                    Select an event or service to automatically set and sync the task&apos;s due date.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Repeating Tasks Configuration */}
          <div className="p-4 rounded-xl border border-subtle bg-subtle/25 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-accent" />
                <span>Repeat Schedule</span>
              </label>
              {repeatType !== 'none' && (
                <span className="text-[11px] text-accent font-semibold">
                  Independent per-occurrence done state
                </span>
              )}
            </div>

            <div>
              <select
                value={repeatType}
                onChange={(e) => setRepeatType(e.target.value as TaskRepeatType)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer font-medium"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (choose weekdays)</option>
                <option value="monthly">Monthly (choose day(s) of month or last day)</option>
                <option value="yearly">Yearly</option>
                <option value="service_occurrence">Every occurrence of a regular service</option>
              </select>
            </div>

            {/* Weekly options: weekdays chips */}
            {repeatType === 'weekly' && (
              <div className="pt-2 space-y-2 animate-in fade-in duration-100">
                <span className="text-[11px] font-medium text-sec block">
                  Repeat on days of the week:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {WEEKDAYS.map(w => {
                    const isSelected = repeatWeekdays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => toggleWeekday(w.day)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-accent text-accent-contrast shadow-2xs'
                            : 'bg-surface border border-subtle text-sec hover:text-main'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Monthly options: day numbers + "last" */}
            {repeatType === 'monthly' && (
              <div className="pt-2 space-y-2.5 animate-in fade-in duration-100">
                <span className="text-[11px] font-medium text-sec block">
                  Repeat on day(s) of month:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {repeatMonthDays.map((d, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-subtle text-xs font-semibold text-main shadow-2xs"
                    >
                      <span>{d === 'last' ? 'Last day of month' : `Day ${d}`}</span>
                      {repeatMonthDays.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMonthDay(d)}
                          className="text-mut hover:text-red-500 cursor-pointer ml-0.5"
                          title="Remove day"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {/* Add another day */}
                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={newMonthDayInput}
                    onChange={(e) => setNewMonthDayInput(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    <option value="last">Last day of the month</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={String(n)}>
                        Day {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddMonthDay}
                    className="px-3 py-1.5 rounded-lg bg-surface border border-subtle hover:bg-subtle text-xs font-semibold text-main transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Day</span>
                  </button>
                </div>
              </div>
            )}

            {/* Every occurrence of a regular service */}
            {repeatType === 'service_occurrence' && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-100">
                <div>
                  <label className="block text-[11px] text-sec font-medium mb-1">
                    Regular Service:
                  </label>
                  <select
                    value={repeatServiceId}
                    onChange={(e) => setRepeatServiceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    {currentServices.map(srv => (
                      <option key={srv.id} value={srv.id}>
                        {srv.name} {srv.kind === 'activity' ? '(Activity)' : ''} ({srv.startTime})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-sec font-medium mb-1">
                    Due [N] days before each occurrence:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={repeatDaysBefore}
                    onChange={(e) => setRepeatDaysBefore(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="0 = day of service"
                  />
                </div>
              </div>
            )}

            {repeatType !== 'none' && (
              <p className="text-[11px] text-mut flex items-center gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>
                  Repeating occurrences for the next 60 days are tracked independently. Completing one occurrence does not complete future ones.
                </span>
              </p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-subtle shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>{isEditing ? 'Save Changes' : 'Create Task'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
