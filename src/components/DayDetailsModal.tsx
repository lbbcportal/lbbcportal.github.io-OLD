import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  X,
  Plus,
  Cake,
  Ban,
  CalendarDays,
  Users,
  CheckCircle2,
  Circle,
  Moon,
  CheckSquare
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatTime, toDateString } from '../lib/dateTime';
import { CalendarOccurrence, Person, Task, TaskOccurrenceItem } from '../types';
import { renderRoleIcon, isImportantRole } from '../lib/roleIcons';
import { expandTaskOccurrences } from '../lib/taskHelpers';
import { TaskEditorModal } from './TaskEditorModal';
import { SnoozeModal } from './SnoozeModal';

export interface DayDetailsModalProps {
  date: Date;
  occurrences: CalendarOccurrence[];
  birthdays: Person[];
  onClose: () => void;
  onSelectOccurrence: (occ: CalendarOccurrence) => void;
  onCreateEvent: (dateStr: string) => void;
}

export const DayDetailsModal: React.FC<DayDetailsModalProps> = ({
  date,
  occurrences,
  birthdays,
  onClose,
  onSelectOccurrence,
  onCreateEvent
}) => {
  const { isViewer } = useAuth();
  const {
    settings,
    nodes,
    assignments,
    tasks,
    taskCategories,
    regularServices,
    overrides,
    events,
    toggleTaskDone,
    snoozeTask
  } = useData();
  const dateStr = toDateString(date);
  const todayStr = toDateString(new Date());

  // Task editor & snooze modal state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [prefilledTaskDate, setPrefilledTaskDate] = useState<string | undefined>(undefined);
  const [snoozeTaskTarget, setSnoozeTaskTarget] = useState<Task | null>(null);

  // Compute tasks due on this date
  const dayTaskItems = useMemo(() => {
    if (isViewer) return [];
    const all = expandTaskOccurrences(tasks, regularServices, overrides, events, todayStr, 90, 90);
    return all.filter(item => item.occurrenceDate === dateStr);
  }, [isViewer, tasks, regularServices, overrides, events, todayStr, dateStr]);

  // Format full date title, e.g. "Wednesday, November 4, 2026"
  const formattedDateTitle = formatDate(dateStr, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Helper to extract important roles and their assigned people for a regular service
  const getImportantRolesForOccurrence = (occ: CalendarOccurrence) => {
    return (occ.requiredRoles || [])
      .map(r => {
        const node = nodes.find(n => n.id === r.roleId);
        if (!node || !isImportantRole(node)) return null;
        const assigned = assignments.filter(
          a => a.targetId === occ.sourceId && a.date === occ.date && a.roleId === r.roleId
        );
        return {
          roleId: r.roleId,
          roleName: r.roleName,
          iconKey: node.icon,
          assignedPeople: assigned.map(a => a.personName)
        };
      })
      .filter(Boolean) as {
        roleId: string;
        roleName: string;
        iconKey?: string;
        assignedPeople: string[];
      }[];
  };

  const hasItems = occurrences.length > 0 || birthdays.length > 0 || (!isViewer && dayTaskItems.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
        <div className="w-full max-w-lg p-5 sm:p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-5 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-accent-tint text-accent shrink-0">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-main leading-snug">
                  {formattedDateTitle}
                </h3>
                <p className="text-xs text-sec">
                  {!hasItems
                    ? 'No scheduled activities'
                    : `${occurrences.length} ${occurrences.length === 1 ? 'service/event' : 'services/events'}${
                        !isViewer && dayTaskItems.length > 0 ? ` · ${dayTaskItems.length} task${dayTaskItems.length === 1 ? '' : 's'}` : ''
                      }${
                        birthdays.length > 0 ? ` · ${birthdays.length} birthday${birthdays.length === 1 ? '' : 's'}` : ''
                      }`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
            {/* Birthdays Section */}
            {birthdays.length > 0 && (
              <div className="p-3.5 rounded-xl bg-pink-50/70 dark:bg-pink-950/30 border border-pink-200/70 dark:border-pink-900/50 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-700 dark:text-pink-300">
                  <Cake className="w-4 h-4 text-pink-500 shrink-0" />
                  <span>Birthdays</span>
                  <span className="text-[11px] font-normal text-pink-600 dark:text-pink-400">
                    ({birthdays.length})
                  </span>
                </div>
                <div className="space-y-1.5 pl-6">
                  {birthdays.map((person) => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between gap-2 text-xs text-main"
                    >
                      <span className="font-semibold">{person.name}</span>
                      {person.department && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface text-sec border border-subtle font-medium">
                          {person.department}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tasks Section */}
            {!isViewer && (
            <div className="p-3.5 rounded-xl bg-subtle/50 border border-subtle space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-main">
                  <CheckSquare className="w-4 h-4 text-accent shrink-0" />
                  <span>Tasks</span>
                  {dayTaskItems.length > 0 && (
                    <span className="text-[11px] font-normal text-sec">
                      ({dayTaskItems.filter((t: TaskOccurrenceItem) => t.isDone).length}/{dayTaskItems.length} completed)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null);
                    setPrefilledTaskDate(dateStr);
                    setIsTaskEditorOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover border border-subtle text-accent text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              </div>

              {dayTaskItems.length === 0 ? (
                <p className="text-xs text-mut italic pl-1">No tasks due on this day.</p>
              ) : (
                <div className="space-y-1.5">
                  {dayTaskItems.map((item: TaskOccurrenceItem, tIdx: number) => {
                    const cat = taskCategories.find(c => c.id === item.task.categoryId);

                    return (
                      <div
                        key={`${item.task.id}_${item.occurrenceDate}_${tIdx}`}
                        onClick={() => {
                          setEditingTask(item.task);
                          setPrefilledTaskDate(undefined);
                          setIsTaskEditorOpen(true);
                        }}
                        className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                          item.isDone
                            ? 'bg-subtle/30 border-subtle opacity-65'
                            : item.isOverdue
                            ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 hover:border-red-400'
                            : 'bg-surface border-subtle hover:border-accent/40 shadow-2xs'
                        }`}
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
                            title={item.isDone ? 'Mark as undone' : 'Mark as done'}
                          >
                            {item.isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                            ) : (
                              <Circle className="w-4 h-4 text-mut hover:text-accent" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs font-semibold leading-tight truncate ${
                                  item.isDone ? 'line-through text-mut' : 'text-main'
                                }`}
                              >
                                {item.task.title}
                              </span>

                              {cat && (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md"
                                  style={{
                                    backgroundColor: `${cat.color}15`,
                                    color: cat.color,
                                    border: `1px solid ${cat.color}35`
                                  }}
                                >
                                  {cat.name}
                                </span>
                              )}

                              {item.task.priority === 'high' && !item.isDone && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                                  High
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
                              {item.isSnoozed && (
                                <span className="text-amber-600 dark:text-amber-400 font-medium">
                                  • Snoozed
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Snooze button */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSnoozeTaskTarget(item.task);
                            }}
                            className="p-1 rounded-lg text-mut hover:text-amber-600 hover:bg-subtle transition-colors cursor-pointer"
                            title="Snooze task"
                          >
                            <Moon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Empty State when nothing scheduled */}
            {!hasItems && (
              <div className="py-10 text-center space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-subtle text-mut mx-auto flex items-center justify-center">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-main">Nothing scheduled</h4>
                <p className="text-xs text-sec max-w-xs mx-auto">
                  {isViewer
                    ? 'No regular services, events, or birthdays are scheduled for this day.'
                    : 'No regular services, events, tasks, or birthdays are scheduled for this day.'}
                </p>
              </div>
            )}

            {/* If there are birthdays or tasks but no occurrences */}
            {(birthdays.length > 0 || (!isViewer && dayTaskItems.length > 0)) && occurrences.length === 0 && (
              <div className="py-2 text-center text-xs text-sec">
                No services or events scheduled for this day.
              </div>
            )}

          {/* Occurrences List */}
          {occurrences.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-mut">
                Scheduled Services & Events
              </div>

              {occurrences.map((occ, idx) => {
                const importantRoles = getImportantRolesForOccurrence(occ);

                return (
                  <div
                    key={`${occ.sourceId}_${occ.date}_${idx}`}
                    onClick={() => onSelectOccurrence(occ)}
                    className="group p-3.5 sm:p-4 rounded-xl bg-subtle/50 hover:bg-surface-hover border border-subtle hover:border-accent/40 shadow-2xs transition-all cursor-pointer relative overflow-hidden text-left"
                  >
                    {/* Colored left bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1.5"
                      style={{ backgroundColor: occ.color || 'var(--accent-base)' }}
                    />

                    <div className="pl-2 space-y-2.5">
                      {/* Title & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-main group-hover:text-accent transition-colors truncate">
                              {occ.title}
                            </h4>
                            {occ.isCancelled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800">
                                <Ban className="w-3 h-3" />
                                Cancelled this date
                              </span>
                            ) : occ.type === 'regular_service' ? (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface text-sec border border-subtle">
                                {occ.serviceKind === 'activity' ? 'Regular Activity' : 'Regular Service'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-accent-tint text-accent border border-accent/20">
                                {occ.category || 'Event'}
                              </span>
                            )}
                          </div>

                          {/* Time & Location */}
                          <div className="flex items-center gap-3 text-xs text-sec mt-1 flex-wrap">
                            <span className="flex items-center gap-1 font-medium">
                              <Clock className="w-3.5 h-3.5 text-mut" />
                              {formatTime(occ.startTime, settings.timeFormat)}
                              {occ.endTime && ` – ${formatTime(occ.endTime, settings.timeFormat)}`}
                            </span>
                            {occ.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-mut" />
                                {occ.location}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="text-xs text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
                          Details &rarr;
                        </span>
                      </div>

                      {/* Important Roles for Regular Services */}
                      {occ.type === 'regular_service' && (
                        <div className="pt-2 border-t border-subtle/60">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-mut mb-1.5 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>Important Roles</span>
                          </div>
                          {importantRoles.length === 0 ? (
                            <p className="text-xs text-mut italic">No important roles defined</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {importantRoles.map((item, rIdx) => (
                                <div
                                  key={rIdx}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-subtle text-xs"
                                >
                                  <span className="text-accent shrink-0">
                                    {renderRoleIcon(item.iconKey || item.roleName, 'w-3.5 h-3.5')}
                                  </span>
                                  <span className="text-sec font-medium">{item.roleName}:</span>
                                  {item.assignedPeople.length > 0 ? (
                                    <span className="text-main font-semibold">
                                      {item.assignedPeople.join(', ')}
                                    </span>
                                  ) : (
                                    <span className="text-mut italic">Unassigned</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Event Notes */}
                      {occ.type === 'event' && occ.notes && (
                        <p className="text-xs text-sec italic line-clamp-2 pt-1 border-t border-subtle/50">
                          {occ.notes}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`pt-3 border-t border-subtle flex items-center gap-3 shrink-0 ${isViewer ? 'justify-end' : 'justify-between'}`}>
          {!isViewer && (
            <button
              type="button"
              onClick={() => {
                onCreateEvent(dateStr);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    {/* Task Editor Modal */}
    {!isViewer && isTaskEditorOpen && (
      <TaskEditorModal
        isOpen={isTaskEditorOpen}
        onClose={() => {
          setIsTaskEditorOpen(false);
          setEditingTask(null);
          setPrefilledTaskDate(undefined);
        }}
        editingTask={editingTask}
        prefilledDate={prefilledTaskDate}
      />
    )}

    {/* Snooze Modal */}
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
  </>
  );
};
