import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  X,
  Ban,
  Edit2,
  Copy,
  CalendarDays,
  Trash2,
  CheckSquare,
  CheckCircle2,
  Circle
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatTime } from '../lib/dateTime';
import { CalendarOccurrence, ChurchEvent, RequiredRoleSpec } from '../types';
import { renderRoleIcon, isImportantRole } from '../lib/roleIcons';
import { calculateLinkedDueDate } from '../lib/taskHelpers';
import { Spinner } from './LoadingIndicator';

interface OccurrenceDetailsModalProps {
  occurrence: CalendarOccurrence;
  onClose: () => void;
  onEditEvent?: (event: ChurchEvent) => void;
  onDuplicateEvent?: (event: ChurchEvent) => void;
  onRescheduleEvent?: (event: ChurchEvent) => void;
  onDeleteEvent?: (event: ChurchEvent) => void;
}

export const OccurrenceDetailsModal: React.FC<OccurrenceDetailsModalProps> = ({
  occurrence,
  onClose,
  onEditEvent,
  onDuplicateEvent,
  onRescheduleEvent,
  onDeleteEvent
}) => {
  const { isViewer } = useAuth();
  const {
    settings,
    assignments,
    setServiceOverride,
    deleteServiceOverride,
    events,
    nodes,
    tasks,
    taskCategories,
    regularServices,
    toggleTaskDone
  } = useData();

  // State for single-occurrence edit override sub-modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideName, setOverrideName] = useState(occurrence.title);
  const [overrideStartTime, setOverrideStartTime] = useState(occurrence.startTime);
  const [overrideEndTime, setOverrideEndTime] = useState(occurrence.endTime || '');
  const [overrideLocation, setOverrideLocation] = useState(occurrence.location || '');
  const [overrideNotes, setOverrideNotes] = useState(occurrence.notes || '');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // Look up assignments for this specific occurrence
  const occurrenceAssignments = useMemo(() => {
    return assignments.filter(
      a => a.targetId === occurrence.sourceId && a.date === occurrence.date
    );
  }, [assignments, occurrence]);

  // If this is an event, find the underlying event object
  const underlyingEvent = useMemo(() => {
    if (occurrence.type !== 'event') return null;
    return events.find(e => e.id === occurrence.sourceId) || null;
  }, [events, occurrence]);

  // Toggle cancellation for regular service on this specific date
  const handleToggleCancel = async () => {
    if (occurrence.type !== 'regular_service' || isSavingOverride) return;
    setIsSavingOverride(true);
    try {
      if (occurrence.isCancelled) {
        if (occurrence.overrideId) {
          await deleteServiceOverride(occurrence.overrideId);
        } else {
          await deleteServiceOverride(`${occurrence.sourceId}_${occurrence.date}`);
        }
      } else {
        await setServiceOverride({
          id: `${occurrence.sourceId}_${occurrence.date}`,
          serviceId: occurrence.sourceId,
          date: occurrence.date,
          isCancelled: true,
          updatedAt: new Date().toISOString()
        });
      }
      onClose();
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Save single-occurrence modification for this specific date
  const handleSaveOverride = async () => {
    if (occurrence.type !== 'regular_service' || isSavingOverride) return;
    setIsSavingOverride(true);
    try {
      await setServiceOverride({
        id: `${occurrence.sourceId}_${occurrence.date}`,
        serviceId: occurrence.sourceId,
        date: occurrence.date,
        isCancelled: false,
        name: overrideName.trim(),
        startTime: overrideStartTime,
        endTime: overrideEndTime,
        location: overrideLocation.trim(),
        notes: overrideNotes.trim(),
        updatedAt: new Date().toISOString()
      });
      setIsOverrideModalOpen(false);
      onClose();
    } finally {
      setIsSavingOverride(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
        <div className="w-full max-w-lg p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-5 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: occurrence.color || 'var(--accent-base)' }}
                />
                <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                  {occurrence.type === 'regular_service'
                    ? (occurrence.serviceKind === 'activity' ? 'Regular Activity Occurrence' : 'Regular Service Occurrence')
                    : 'Calendar Event'}
                </span>
                {occurrence.isCancelled && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                    Cancelled for this date
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-main">{occurrence.title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-mut hover:text-main cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Time & Location */}
          <div className="space-y-2 text-xs text-sec">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-accent" />
              <span className="font-semibold text-main">
                {formatDate(occurrence.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <span className="tabular-nums">
                {formatTime(occurrence.startTime, settings.timeFormat)}
                {occurrence.endTime ? ` - ${formatTime(occurrence.endTime, settings.timeFormat)}` : ''}
              </span>
            </div>
            {occurrence.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-accent" />
                <span>{occurrence.location}</span>
              </div>
            )}
            {occurrence.notes && (
              <div className="p-3 rounded-xl bg-subtle border border-subtle text-sec italic">
                "{occurrence.notes}"
              </div>
            )}
          </div>

          {/* Assigned Roles & Volunteers */}
          <div className="space-y-3 pt-3 border-t border-subtle">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-main uppercase tracking-wider">
                Assigned Ministry Roles
              </h4>
              <span className="text-xs text-sec">
                {occurrenceAssignments.length} / {occurrence.requiredRoles.reduce((s, r) => s + r.count, 0)} filled
              </span>
            </div>

            {occurrence.requiredRoles.length === 0 ? (
              <p className="text-xs text-mut italic">No roles specified for this service/event.</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const importantRoleList: { spec: RequiredRoleSpec; iconKey?: string }[] = [];
                  const standardRoleList: { spec: RequiredRoleSpec }[] = [];

                  for (const spec of occurrence.requiredRoles) {
                    const node = nodes.find(n => n.id === spec.roleId);
                    if (node && isImportantRole(node) && node.icon) {
                      importantRoleList.push({ spec, iconKey: node.icon });
                    } else {
                      standardRoleList.push({ spec });
                    }
                  }

                  return (
                    <>
                      {/* Important Roles First (Highlighted with Icon) */}
                      {importantRoleList.length > 0 && (
                        <div className="space-y-2">
                          {importantRoleList.map(({ spec, iconKey }) => {
                            const assigned = occurrenceAssignments.filter(a => a.roleId === spec.roleId);
                            return (
                              <div
                                key={spec.roleId}
                                className="p-3 rounded-xl bg-accent/5 border border-accent/40 space-y-2 text-xs shadow-2xs"
                              >
                                <div className="flex items-center justify-between font-semibold text-main">
                                  <div className="flex items-center gap-2">
                                    <span className="p-1 rounded-md bg-accent/15 text-accent">
                                      {renderRoleIcon(iconKey, 'w-3.5 h-3.5')}
                                    </span>
                                    <span className="font-bold text-main">{spec.roleName}</span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-accent-tint text-accent">
                                      Important Role
                                    </span>
                                  </div>
                                  <span className="text-sec text-[11px] font-medium">x{spec.count} required</span>
                                </div>

                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {assigned.length > 0 ? (
                                    assigned.map((a, aIdx) => (
                                      <span
                                        key={aIdx}
                                        className="px-2.5 py-1 rounded-lg bg-surface border border-accent/30 font-semibold text-main text-xs shadow-2xs"
                                      >
                                        {a.personName}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-amber-600 dark:text-amber-400 font-medium italic text-xs">
                                      Unassigned (volunteer needed)
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Standard / Other Roles Followed */}
                      {standardRoleList.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {standardRoleList.map(({ spec }) => {
                            const assigned = occurrenceAssignments.filter(a => a.roleId === spec.roleId);
                            return (
                              <div
                                key={spec.roleId}
                                className="p-3 rounded-xl bg-subtle border border-subtle space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between font-semibold text-main">
                                  <span>{spec.roleName}</span>
                                  <span className="text-mut text-[11px]">x{spec.count} required</span>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  {assigned.length > 0 ? (
                                    assigned.map((a, aIdx) => (
                                      <span
                                        key={aIdx}
                                        className="px-2.5 py-1 rounded-lg bg-surface border border-subtle font-medium text-main text-xs"
                                      >
                                        {a.personName}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-mut italic">No volunteer assigned</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Tasks for this Event */}
          {!isViewer && occurrence.type === 'event' && (() => {
            const linkedTasks = tasks.filter(
              t => t.link?.targetType === 'event' && t.link?.targetId === occurrence.sourceId
            );

            if (linkedTasks.length === 0) return null;

            return (
              <div className="space-y-2.5 pt-3 border-t border-subtle">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-accent" />
                    <span>Tasks for this Event</span>
                  </h4>
                  <span className="text-xs text-sec">
                    {linkedTasks.filter(t => t.status === 'done').length} / {linkedTasks.length} done
                  </span>
                </div>

                <div className="space-y-1.5">
                  {linkedTasks.map(t => {
                    const isDone = t.status === 'done';
                    const dueDate = calculateLinkedDueDate(t.link!, events, regularServices);
                    const cat = taskCategories.find(c => c.id === t.categoryId);

                    return (
                      <div
                        key={t.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 text-xs transition-colors ${
                          isDone
                            ? 'bg-subtle/30 border-subtle opacity-70'
                            : 'bg-surface border-subtle hover:border-accent/40 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleTaskDone(t.id)}
                            className="text-sec hover:text-accent transition-colors shrink-0 cursor-pointer p-0.5"
                            title={isDone ? 'Mark undone' : 'Mark done'}
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                            ) : (
                              <Circle className="w-4 h-4 text-mut hover:text-accent" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <span className={`font-semibold block truncate ${isDone ? 'line-through text-mut' : 'text-main'}`}>
                              {t.title}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-mut mt-0.5 flex-wrap">
                              {t.link?.daysBefore !== undefined && (
                                <span>
                                  {t.link.daysBefore === 0
                                    ? 'Due day of event'
                                    : `Due ${t.link.daysBefore} days before`}
                                  {dueDate && ` (${dueDate})`}
                                </span>
                              )}
                              {t.assignedTo && (
                                <span>• {t.assignedTo}</span>
                              )}
                              {cat && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                                  style={{
                                    backgroundColor: `${cat.color}15`,
                                    color: cat.color
                                  }}
                                >
                                  {cat.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-subtle flex flex-wrap items-center justify-between gap-2">
            {isViewer ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec text-xs font-medium cursor-pointer ml-auto"
              >
                Close
              </button>
            ) : occurrence.type === 'regular_service' ? (
              <>
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={handleToggleCancel}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                    occurrence.isCancelled
                      ? 'border-subtle bg-surface text-main hover:bg-surface-hover'
                      : 'border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                  }`}
                >
                  {isSavingOverride ? (
                    <>
                      <Spinner size="xs" variant="accent" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      <span>{occurrence.isCancelled ? 'Restore Occurrence' : 'Cancel This Date'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={() => {
                    setOverrideName(occurrence.title);
                    setOverrideStartTime(occurrence.startTime);
                    setOverrideEndTime(occurrence.endTime || '');
                    setOverrideLocation(occurrence.location || '');
                    setOverrideNotes(occurrence.notes || '');
                    setIsOverrideModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  Edit This Date Only
                </button>
              </>
            ) : underlyingEvent && onEditEvent ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditEvent(underlyingEvent);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-accent" />
                    <span>Edit Event</span>
                  </button>

                  {onDuplicateEvent && (
                    <button
                      type="button"
                      onClick={() => onDuplicateEvent(underlyingEvent)}
                      className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-accent" />
                      <span>Duplicate</span>
                    </button>
                  )}

                  {onRescheduleEvent && (
                    <button
                      type="button"
                      onClick={() => onRescheduleEvent(underlyingEvent)}
                      className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-accent" />
                      <span>Reschedule</span>
                    </button>
                  )}
                </div>

                {onDeleteEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onDeleteEvent(underlyingEvent);
                    }}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                    title="Delete Event"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec text-xs font-medium cursor-pointer ml-auto"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= EDIT SINGLE OCCURRENCE MODAL ================= */}
      {!isViewer && isOverrideModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="text-base font-bold text-main">
                Edit Occurrence for {formatDate(occurrence.date)}
              </h3>
              <button
                type="button"
                disabled={isSavingOverride}
                onClick={() => setIsOverrideModalOpen(false)}
                className="p-1 rounded-lg text-mut hover:text-main cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-sec">
              Changes made here apply ONLY to this specific date ({formatDate(occurrence.date)}). The regular weekly schedule remains unchanged.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1">
                  Title / Special Name
                </label>
                <input
                  type="text"
                  value={overrideName}
                  onChange={(e) => setOverrideName(e.target.value)}
                  placeholder="e.g. Easter Sunday Celebration"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={overrideStartTime}
                    onChange={(e) => setOverrideStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={overrideEndTime}
                    onChange={(e) => setOverrideEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1">
                  Location Override
                </label>
                <input
                  type="text"
                  value={overrideLocation}
                  onChange={(e) => setOverrideLocation(e.target.value)}
                  placeholder="e.g. Outdoor Pavilion"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1">
                  Notes Override
                </label>
                <textarea
                  rows={2}
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder="Special instructions for this week..."
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs resize-none"
                />
              </div>

              <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-subtle text-sec font-medium hover:bg-subtle cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={handleSaveOverride}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-medium shadow-xs cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {isSavingOverride ? (
                    <>
                      <Spinner size="xs" variant="contrast" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    'Save Override'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
