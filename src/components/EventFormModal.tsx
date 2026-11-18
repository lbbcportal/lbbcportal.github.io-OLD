/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, CheckSquare } from 'lucide-react';
import { ChurchEvent, RequiredRoleSpec } from '../types';
import { toDateString } from '../lib/dateTime';
import { useData } from '../context/DataContext';
import { subtractDaysFromDate } from '../lib/taskHelpers';
import { Spinner } from './LoadingIndicator';

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

interface EventDraftTask {
  id?: string;
  title: string;
  daysBefore: number;
  isExisting?: boolean;
}

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  editingEvent?: ChurchEvent | null;
  onSaved?: (eventId: string) => void;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  editingEvent,
  onSaved
}) => {
  const {
    events,
    nodes,
    categories,
    tasks,
    addEvent,
    updateEvent,
    addCategory,
    addTask,
    updateTask,
    deleteTask
  } = useData();

  const [eventTitle, setEventTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [color, setColor] = useState('#881337');
  const [requiredRoles, setRequiredRoles] = useState<RequiredRoleSpec[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [roleToAddId, setRoleToAddId] = useState('');

  // Tasks for this event
  const [draftTasks, setDraftTasks] = useState<EventDraftTask[]>([]);
  const [deletedTaskIds, setDeletedTaskIds] = useState<string[]>([]);
  const [taskTitleToAdd, setTaskTitleToAdd] = useState('');
  const [taskDaysBeforeToAdd, setTaskDaysBeforeToAdd] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const savedTemplates = events.filter(e => e.isTemplate);
  const availableRoles = nodes.filter(n => n.isRole);

  useEffect(() => {
    if (!isOpen) return;

    if (editingEvent) {
      setEventTitle(editingEvent.title);
      setStartDate(editingEvent.startDate);
      setEndDate(editingEvent.endDate || editingEvent.startDate);
      setStartTime(editingEvent.startTime || '10:00');
      setEndTime(editingEvent.endTime || '');
      setLocation(editingEvent.location || '');
      setNotes(editingEvent.notes || '');
      setCategoryName(editingEvent.category || '');
      setColor(editingEvent.color || '#881337');
      setRequiredRoles(editingEvent.requiredRoles || []);
      setSaveAsTemplate(false);
      setTemplateName('');

      const existing = tasks.filter(t => t.link?.targetType === 'event' && t.link?.targetId === editingEvent.id);
      setDraftTasks(existing.map(t => ({
        id: t.id,
        title: t.title,
        daysBefore: t.link?.daysBefore ?? 0,
        isExisting: true
      })));
      setDeletedTaskIds([]);
    } else {
      const d = initialDate || toDateString(new Date());
      setEventTitle('');
      setStartDate(d);
      setEndDate(d);
      setStartTime('10:00');
      setEndTime('12:00');
      setLocation('');
      setNotes('');
      setCategoryName('');
      setColor('#881337');
      setRequiredRoles([]);
      setSaveAsTemplate(false);
      setTemplateName('');
      setDraftTasks([]);
      setDeletedTaskIds([]);
    }
    setRoleToAddId('');
    setTaskTitleToAdd('');
    setTaskDaysBeforeToAdd(0);
  }, [isOpen, editingEvent, initialDate, tasks]);

  if (!isOpen) return null;

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

  const handleAddTask = () => {
    if (!taskTitleToAdd.trim()) return;
    setDraftTasks(prev => [
      ...prev,
      {
        title: taskTitleToAdd.trim(),
        daysBefore: taskDaysBeforeToAdd,
        isExisting: false
      }
    ]);
    setTaskTitleToAdd('');
    setTaskDaysBeforeToAdd(0);
  };

  const handleRemoveTask = (index: number) => {
    const item = draftTasks[index];
    if (item.isExisting && item.id) {
      setDeletedTaskIds(prev => [...prev, item.id!]);
    }
    setDraftTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (categoryName.trim() && !categories.some(c => c.name.toLowerCase() === categoryName.trim().toLowerCase())) {
        await addCategory(categoryName.trim(), color);
      }

      let savedId = '';
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
        savedId = editingEvent.id;
      } else {
        savedId = await addEvent({
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

      // Save, update or delete linked tasks
      for (const tid of deletedTaskIds) {
        await deleteTask(tid);
      }

      for (const dt of draftTasks) {
        const calculatedDue = subtractDaysFromDate(startDate, dt.daysBefore);
        if (!dt.isExisting) {
          await addTask({
            title: dt.title.trim(),
            status: 'todo',
            priority: 'normal',
            dueDate: calculatedDue,
            link: {
              targetType: 'event',
              targetId: savedId,
              daysBefore: dt.daysBefore
            }
          });
        } else if (dt.id) {
          await updateTask(dt.id, {
            dueDate: calculatedDue,
            link: {
              targetType: 'event',
              targetId: savedId,
              daysBefore: dt.daysBefore
            }
          });
        }
      }

      if (onSaved) onSaved(savedId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs motion-backdrop-in">
      <div className="w-full max-w-xl p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main max-h-[90vh] overflow-y-auto space-y-4 motion-popup-in">
        <div className="flex items-center justify-between pb-3 border-b border-subtle">
          <h3 className="text-base font-bold text-main">
            {editingEvent ? 'Edit Event' : 'Create Calendar Event'}
          </h3>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template loader */}
        {!editingEvent && savedTemplates.length > 0 && (
          <div className="p-3 rounded-xl bg-accent-tint border border-accent/20 flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-sec">Fill from template:</span>
            <select
              onChange={(e) => {
                const tmpl = savedTemplates.find(t => t.id === e.target.value);
                if (tmpl) handleApplyTemplate(tmpl);
              }}
              className="px-2.5 py-1 rounded-lg border border-subtle bg-field text-main text-xs"
            >
              <option value="">Choose a template...</option>
              {savedTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.templateName || t.title}</option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSaveEvent} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
              Event Title *
            </label>
            <input
              type="text"
              required
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="e.g. Youth Camp or Thanksgiving Dinner"
              className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                End Date (for multi-day events)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                Start Time *
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                End Time (Optional)
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          {/* Location & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Fellowship Hall"
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                Category (User Created)
              </label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Youth, Outreach, Fellowship"
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          {/* Color Label */}
          <div>
            <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
              Color Tag
            </label>
            <div className="flex items-center gap-2">
              {PRESET_EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                    color === c ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Role Assignments Setup */}
          <div className="p-4 rounded-xl bg-subtle border border-subtle space-y-3">
            <span className="font-semibold text-main uppercase tracking-wider block">
              Required Roles & Rosters
            </span>

            <div className="flex gap-2">
              <select
                value={roleToAddId}
                onChange={(e) => setRoleToAddId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs"
              >
                <option value="">Select a role from People & Ministries...</option>
                {availableRoles.map(r => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!roleToAddId}
                onClick={handleAddRoleSpec}
                className="px-3.5 py-2 rounded-xl bg-accent text-accent-contrast font-medium text-xs disabled:opacity-40 cursor-pointer"
              >
                Add Role
              </button>
            </div>

            {requiredRoles.length > 0 && (
              <div className="space-y-1.5">
                {requiredRoles.map((rSpec) => (
                  <div
                    key={rSpec.roleId}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface border border-subtle text-xs"
                  >
                    <span className="font-semibold text-main">{rSpec.roleName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sec">Count: {rSpec.count}</span>
                      <button
                        type="button"
                        onClick={() => setRequiredRoles(requiredRoles.filter(r => r.roleId !== rSpec.roleId))}
                        className="text-red-500 hover:bg-red-50 p-1 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks for this event */}
          <div className="p-4 rounded-xl bg-subtle border border-subtle space-y-3">
            <div>
              <span className="font-semibold text-main uppercase tracking-wider block text-xs flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-accent" />
                <span>Tasks for this event</span>
              </span>
              <p className="text-[11px] text-sec mt-0.5">
                Automatically creates linked tasks due relative to this event
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={taskTitleToAdd}
                onChange={(e) => setTaskTitleToAdd(e.target.value)}
                placeholder="e.g. Order flowers, setup sound..."
                className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTask();
                  }
                }}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sec text-xs whitespace-nowrap">Due</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={taskDaysBeforeToAdd}
                  onChange={(e) => setTaskDaysBeforeToAdd(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 px-2 py-2 rounded-xl border border-subtle bg-field text-main text-xs text-center focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <span className="text-sec text-xs whitespace-nowrap">days before</span>
                <button
                  type="button"
                  onClick={handleAddTask}
                  disabled={!taskTitleToAdd.trim()}
                  className="px-3.5 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold disabled:opacity-40 cursor-pointer shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {draftTasks.length > 0 && (
              <div className="space-y-1.5">
                {draftTasks.map((t, idx) => {
                  const computedDate = startDate ? subtractDaysFromDate(startDate, t.daysBefore) : '';
                  return (
                    <div
                      key={t.id || idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface border border-subtle text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span className="font-semibold text-main truncate">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sec text-[11px] bg-subtle px-2 py-0.5 rounded-md border border-subtle font-medium">
                          {t.daysBefore === 0 ? 'Day of event' : `${t.daysBefore}d before`}
                          {computedDate ? ` (${computedDate})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTask(idx)}
                          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 p-1 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Template Saving Option */}
          {!editingEvent && (
            <div className="p-3 rounded-xl bg-subtle border border-subtle space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-main">
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="rounded text-accent focus:ring-accent"
                />
                <span>Save this setup as a reusable Event Template</span>
              </label>
              {saveAsTemplate && (
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template Name (e.g. Monthly Potluck Template)"
                  className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs"
                />
              )}
            </div>
          )}

          <div>
            <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-subtle text-sec font-medium hover:bg-subtle transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                editingEvent ? 'Save Changes' : 'Create Event'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
