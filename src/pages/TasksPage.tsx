/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  CheckSquare,
  Plus,
  Tag,
  Search,
  Filter,
  ArrowUpDown,
  Calendar,
  Clock,
  User,
  AlertCircle,
  Check,
  Edit2,
  Trash2,
  Repeat,
  Link as LinkIcon,
  ChevronRight,
  Smile,
  Sparkles,
  Inbox,
  X,
  Flag,
  Moon
} from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  Task,
  TaskPriority,
  TaskStatus,
  TaskCategory,
  TaskOccurrenceItem
} from '../types';
import { toDateString } from '../lib/dateTime';
import {
  expandTaskOccurrences,
  formatDueDisplay,
  getTaskLinkInfo
} from '../lib/taskHelpers';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { TaskCategoryModal } from '../components/TaskCategoryModal';
import { SnoozeModal } from '../components/SnoozeModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

type TabType = 'all' | 'today' | 'upcoming' | 'overdue' | 'done';
type SortType = 'due_date' | 'priority' | 'recently_added';

export const TasksPage: React.FC = () => {
  const {
    tasks,
    taskCategories,
    regularServices,
    overrides,
    events,
    people,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskDone,
    snoozeTask,
    addTaskCategory,
    updateTaskCategory,
    deleteTaskCategory,
    dataLoading
  } = useData();

  const todayStr = useMemo(() => toDateString(new Date()), []);

  // Quick Add State
  const [quickTitle, setQuickTitle] = useState('');
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortType>('due_date');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const [snoozeTaskItem, setSnoozeTaskItem] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Quick Add handler
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || quickSubmitting) return;

    setQuickSubmitting(true);
    try {
      await addTask({
        title: quickTitle.trim(),
        priority: 'normal',
        status: 'todo'
      });
      setQuickTitle('');
    } catch (err) {
      console.error('Failed to quick add task', err);
    } finally {
      setQuickSubmitting(false);
    }
  };

  // Expand all tasks (including repeating occurrences for the next 60 days + past undone)
  const allOccurrences = useMemo(() => {
    return expandTaskOccurrences(
      tasks,
      regularServices,
      overrides,
      events,
      todayStr,
      60,
      60
    );
  }, [tasks, regularServices, overrides, events, todayStr]);

  // Tab counts
  const tabCounts = useMemo(() => {
    let todayCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    let doneCount = 0;

    for (const item of allOccurrences) {
      if (item.isDone) {
        doneCount++;
      } else {
        if (item.isOverdue) {
          overdueCount++;
        } else if (item.isToday) {
          todayCount++;
        } else if (item.occurrenceDate > todayStr) {
          upcomingCount++;
        }
      }
    }

    return {
      all: allOccurrences.length,
      today: todayCount,
      upcoming: upcomingCount,
      overdue: overdueCount,
      done: doneCount
    };
  }, [allOccurrences, todayStr]);

  // Filtered & Sorted occurrences
  const displayedOccurrences = useMemo(() => {
    let list = allOccurrences.filter((item) => {
      // 1. Tab filter
      if (activeTab === 'today') {
        if (!item.isToday || item.isDone) return false;
      } else if (activeTab === 'upcoming') {
        if (item.isDone || item.occurrenceDate <= todayStr || !item.occurrenceDate) return false;
      } else if (activeTab === 'overdue') {
        if (!item.isOverdue || item.isDone) return false;
      } else if (activeTab === 'done') {
        if (!item.isDone) return false;
      }

      // 2. Category filter
      if (categoryFilter === 'none') {
        if (item.task.categoryId) return false;
      } else if (categoryFilter !== 'all') {
        if (item.task.categoryId !== categoryFilter) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.task.title.toLowerCase().includes(q);
        const detailsMatch = item.task.details?.toLowerCase().includes(q);
        const assigneeMatch = item.task.assignedTo?.toLowerCase().includes(q);
        const cat = taskCategories.find(c => c.id === item.task.categoryId);
        const catMatch = cat?.name.toLowerCase().includes(q);
        if (!titleMatch && !detailsMatch && !assigneeMatch && !catMatch) {
          return false;
        }
      }

      return true;
    });

    // Sort
    list.sort((a, b) => {
      // Priority weights
      const pWeights = { high: 3, normal: 2, low: 1 };

      if (sortBy === 'priority') {
        const diffP = pWeights[b.task.priority || 'normal'] - pWeights[a.task.priority || 'normal'];
        if (diffP !== 0) return diffP;
        // fallback to due date
        return (a.occurrenceDate || '9999').localeCompare(b.occurrenceDate || '9999');
      }

      if (sortBy === 'recently_added') {
        return (b.task.createdAt || '').localeCompare(a.task.createdAt || '');
      }

      // Default: 'due_date'
      // Overdue first, then today, then upcoming, then no due date
      const dateA = a.occurrenceDate || '9999-99-99';
      const dateB = b.occurrenceDate || '9999-99-99';
      const dateCmp = dateA.localeCompare(dateB);
      if (dateCmp !== 0) return dateCmp;

      // Higher priority next
      const diffP = pWeights[b.task.priority || 'normal'] - pWeights[a.task.priority || 'normal'];
      if (diffP !== 0) return diffP;

      return a.task.title.localeCompare(b.task.title);
    });

    return list;
  }, [allOccurrences, activeTab, categoryFilter, searchQuery, sortBy, taskCategories, todayStr]);

  // Category map for quick lookup
  const categoryMap = useMemo(() => {
    const map = new Map<string, TaskCategory>();
    taskCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [taskCategories]);

  // Toggle status between To do and In progress
  const handleToggleStatus = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'in_progress' ? 'todo' : 'in_progress';
    try {
      await updateTask(task.id, { status: nextStatus });
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 motion-page-enter">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-subtle">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main flex items-center gap-2.5">
            <CheckSquare className="w-6 h-6 text-accent" />
            <span>Ministry Tasks</span>
          </h1>
          <p className="text-xs sm:text-sm text-mut mt-0.5">
            Track ministry responsibilities, event preparations, and recurring service checklists
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {/* Categories Manager Button */}
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-subtle text-sec hover:text-main text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-accent" />
            <span>Categories</span>
            {taskCategories.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-subtle text-[10px] font-bold text-sec">
                {taskCategories.length}
              </span>
            )}
          </button>

          {/* New Task Button */}
          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setIsEditorOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-accent-contrast" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Quick Add Bar */}
      <form onSubmit={handleQuickAdd} className="relative">
        <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl border border-subtle bg-surface shadow-xs focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent transition-all">
          <div className="pl-3 text-mut">
            <Plus className="w-5 h-5 text-accent" />
          </div>
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="What needs to be done? Type a task title and press Enter to add instantly..."
            className="flex-1 bg-transparent border-none text-main text-xs sm:text-sm placeholder:text-mut focus:outline-none py-1.5 font-medium"
          />
          <button
            type="submit"
            disabled={!quickTitle.trim() || quickSubmitting}
            className="px-3.5 py-1.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-2xs cursor-pointer disabled:opacity-40 shrink-0 inline-flex items-center gap-1.5"
          >
            {quickSubmitting ? (
              <>
                <Spinner size="xs" variant="contrast" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Add</span>
            )}
          </button>
        </div>
      </form>

      {dataLoading.tasks ? (
        <PageLoading />
      ) : (
        <>

      {/* Filter and Tab Controls */}
      <div className="space-y-3">
        {/* Top Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all' as TabType, label: 'All', count: tabCounts.all, isAlert: false },
            { id: 'today' as TabType, label: 'Today', count: tabCounts.today, isAlert: false },
            { id: 'upcoming' as TabType, label: 'Upcoming', count: tabCounts.upcoming, isAlert: false },
            { id: 'overdue' as TabType, label: 'Overdue', count: tabCounts.overdue, isAlert: tabCounts.overdue > 0 },
            { id: 'done' as TabType, label: 'Done', count: tabCounts.done, isAlert: false }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-accent text-accent-contrast shadow-2xs'
                    : 'bg-surface hover:bg-subtle text-sec hover:text-main border border-subtle'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-accent-chip'
                      : tab.isAlert
                      ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                      : 'bg-subtle text-mut'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter / Sort / Search Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-mut absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, assignees, or categories..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mut hover:text-main p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 bg-field border border-subtle rounded-xl px-2.5 py-1.5 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-mut shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent border-none text-main text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Categories</option>
                <option value="none">No category</option>
                {taskCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-field border border-subtle rounded-xl px-2.5 py-1.5 shadow-2xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-mut shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="bg-transparent border-none text-main text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="due_date">Sort: Due date</option>
                <option value="priority">Sort: Priority</option>
                <option value="recently_added">Sort: Recently added</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Task List / Rows (wrapped once so filters/search/tabs never replay fade) */}
      <div className="motion-list-enter">
      {displayedOccurrences.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl border-2 border-dashed border-subtle bg-surface/50 max-w-lg mx-auto my-6 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent flex items-center justify-center mx-auto shadow-2xs">
            {activeTab === 'overdue' ? (
              <Smile className="w-7 h-7 text-emerald-600" />
            ) : activeTab === 'done' ? (
              <CheckSquare className="w-7 h-7 text-accent" />
            ) : (
              <Inbox className="w-7 h-7 text-accent" />
            )}
          </div>
          <h3 className="text-base font-bold text-main">
            {activeTab === 'overdue'
              ? 'All caught up!'
              : activeTab === 'today'
              ? 'No tasks due today'
              : activeTab === 'upcoming'
              ? 'No upcoming tasks'
              : activeTab === 'done'
              ? 'No completed tasks yet'
              : 'No tasks found'}
          </h3>
          <p className="text-xs text-mut max-w-sm mx-auto">
            {activeTab === 'overdue'
              ? 'You have zero overdue tasks. Everything is in order!'
              : activeTab === 'today'
              ? 'No tasks scheduled for today. Use the quick add bar above to schedule responsibilities.'
              : 'Use the quick add bar at the top or click "New Task" to create a task.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayedOccurrences.map((item, idx) => {
            const task = item.task;
            const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
            const dueDisplay = formatDueDisplay(item.occurrenceDate, task.dueTime, todayStr);
            const linkInfo = getTaskLinkInfo(task.link, events, regularServices);
            const isRepeating = task.repeat && task.repeat.type && task.repeat.type !== 'none';

            return (
              <div
                key={`${task.id}_${item.occurrenceDate || idx}`}
                className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  item.isDone
                    ? 'bg-surface/50 border-subtle opacity-70 hover:opacity-100'
                    : item.isOverdue
                    ? 'bg-red-50/30 dark:bg-red-950/10 border-red-200 dark:border-red-900/60 shadow-xs'
                    : item.isToday
                    ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/60 shadow-xs'
                    : 'bg-surface border-subtle hover:border-accent/30 hover:shadow-2xs'
                }`}
              >
                {/* Left side: Round Checkbox + Title + Meta Chips */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Round Checkbox (Done with undo) */}
                  <button
                    type="button"
                    onClick={() => toggleTaskDone(task.id, item.occurrenceDate)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all cursor-pointer ${
                      item.isDone
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                        : 'border-strong hover:border-accent bg-surface hover:bg-accent-tint'
                    }`}
                    title={item.isDone ? 'Mark as undone' : 'Mark as done'}
                  >
                    {item.isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Title + Priority + Status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold tracking-tight ${
                          item.isDone ? 'line-through text-mut' : 'text-main'
                        }`}
                      >
                        {task.title}
                      </span>

                      {/* Category Chip */}
                      {cat && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs"
                          style={{
                            backgroundColor: `${cat.color}15`,
                            color: cat.color,
                            borderColor: `${cat.color}35`
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span>{cat.name}</span>
                        </span>
                      )}

                      {/* Priority Marker */}
                      {task.priority === 'high' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
                          <Flag className="w-2.5 h-2.5 fill-current" />
                          <span>HIGH</span>
                        </span>
                      )}

                      {/* Status Chip (Click to toggle To do / In progress) */}
                      {!item.isDone && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(task)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                            task.status === 'in_progress'
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                              : 'bg-subtle text-sec border border-subtle hover:bg-surface-hover'
                          }`}
                          title="Click to toggle status between To do and In progress"
                        >
                          <span>{task.status === 'in_progress' ? 'In Progress' : 'To Do'}</span>
                        </button>
                      )}

                      {/* Snoozed Tag */}
                      {item.isSnoozed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Snoozed until {task.snoozedUntil}</span>
                        </span>
                      )}
                    </div>

                    {/* Details if any */}
                    {task.details && (
                      <p className="text-xs text-mut line-clamp-1">
                        {task.details}
                      </p>
                    )}

                    {/* Secondary meta info row */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-mut pt-0.5">
                      {/* Due Date */}
                      {item.occurrenceDate ? (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            item.isDone
                              ? 'text-mut font-normal'
                              : item.isOverdue
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : item.isToday
                              ? 'text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-sec'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{dueDisplay.label}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-mut">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>No due date</span>
                        </span>
                      )}

                      {/* Assigned Person */}
                      {task.assignedTo && (
                        <span className="inline-flex items-center gap-1 text-sec font-medium">
                          <User className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span>{task.assignedTo}</span>
                        </span>
                      )}

                      {/* Linked Target Tag */}
                      {linkInfo && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-subtle text-[11px] font-medium text-sec">
                          <LinkIcon className="w-3 h-3 text-accent shrink-0" />
                          <span>{linkInfo.label}</span>
                        </span>
                      )}

                      {/* Repeat Indicator */}
                      {isRepeating && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-accent font-semibold bg-accent-tint">
                          <Repeat className="w-3 h-3" />
                          <span className="capitalize">{task.repeat?.type?.replace('_', ' ')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Action Buttons */}
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-subtle/50 w-full sm:w-auto justify-end">
                  {/* Snooze Button */}
                  <button
                    type="button"
                    onClick={() => setSnoozeTaskItem(task)}
                    className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                    title="Snooze task"
                  >
                    <Clock className="w-4 h-4" />
                  </button>

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(task);
                      setIsEditorOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                    title="Edit task"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => setTaskToDelete(task)}
                    className="p-1.5 rounded-lg text-mut hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="Delete task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
        </>
      )}

      {/* Task Editor Modal */}
      {isEditorOpen && (
        <TaskEditorModal
          isOpen={isEditorOpen}
          task={editingTask}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingTask(null);
          }}
          onSave={async (taskData, customId) => {
            if (editingTask) {
              await updateTask(editingTask.id, taskData);
            } else {
              await addTask(taskData, customId);
            }
          }}
          categories={taskCategories}
          people={people}
          events={events}
          regularServices={regularServices}
        />
      )}

      {/* Task Categories Modal */}
      {isCategoryModalOpen && (
        <TaskCategoryModal
          isOpen={isCategoryModalOpen}
          categories={taskCategories}
          onClose={() => setIsCategoryModalOpen(false)}
          onAddCategory={addTaskCategory}
          onUpdateCategory={updateTaskCategory}
          onDeleteCategory={deleteTaskCategory}
        />
      )}

      {/* Snooze Modal */}
      {snoozeTaskItem && (
        <SnoozeModal
          isOpen={!!snoozeTaskItem}
          taskTitle={snoozeTaskItem.title}
          onClose={() => setSnoozeTaskItem(null)}
          onSnooze={async (untilDate: string) => {
            if (snoozeTaskItem) {
              await snoozeTask(snoozeTaskItem.id, untilDate);
              setSnoozeTaskItem(null);
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <ConfirmModal
          isOpen={!!taskToDelete}
          title="Delete Task"
          message={`Are you sure you want to delete "${taskToDelete.title}"? This cannot be undone.`}
          confirmLabel="Delete Task"
          isDestructive={true}
          onConfirm={async () => {
            if (taskToDelete) {
              await deleteTask(taskToDelete.id);
              setTaskToDelete(null);
            }
          }}
          onCancel={() => setTaskToDelete(null)}
        />
      )}
    </div>
  );
};
