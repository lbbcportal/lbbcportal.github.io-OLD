import React, { useState, useMemo } from 'react';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Calendar,
  Users,
  X,
  Minus
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { RegularService, RequiredRoleSpec, OutlineNode } from '../types';
import { formatTime } from '../lib/dateTime';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 30-minute intervals from 00:00 to 23:30
const TIME_OPTIONS_30_MIN: string[] = [];
for (let h = 0; h < 24; h++) {
  const hh = h.toString().padStart(2, '0');
  TIME_OPTIONS_30_MIN.push(`${hh}:00`);
  TIME_OPTIONS_30_MIN.push(`${hh}:30`);
}

const PRESET_COLORS = [
  '#881337', // Maroon
  '#0284c7', // Sky / Glacier Blue
  '#2e6f40', // Sage Green
  '#ea580c', // Orange
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#0d9488', // Teal
  '#d97706', // Amber
];

export const RegularServicesPage: React.FC = () => {
  const { isViewer } = useAuth();
  const {
    regularServices,
    addRegularService,
    updateRegularService,
    deleteRegularService,
    nodes,
    settings,
    dataLoading
  } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<'service' | 'activity'>('service');
  const [editingService, setEditingService] = useState<RegularService | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<RegularService | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([0]); // Default Sunday
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#881337');
  const [requiredRoles, setRequiredRoles] = useState<RequiredRoleSpec[]>([]);

  // Selected role to add to service spec
  const [roleToAddId, setRoleToAddId] = useState('');

  // Split items into regular worship services and regular activities
  const services = useMemo(
    () => regularServices.filter(s => (s.kind || 'service') === 'service'),
    [regularServices]
  );
  const activities = useMemo(
    () => regularServices.filter(s => s.kind === 'activity'),
    [regularServices]
  );

  interface OutlineNodeWithDepth {
    node: OutlineNode;
    depth: number;
    parentTitle?: string;
    fullPath: string;
  }

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

  // Time options with fallback for non-30-minute intervals
  const startTimeOptions = useMemo(() => {
    if (startTime && !TIME_OPTIONS_30_MIN.includes(startTime)) {
      return [...TIME_OPTIONS_30_MIN, startTime].sort();
    }
    return TIME_OPTIONS_30_MIN;
  }, [startTime]);

  const endTimeOptions = useMemo(() => {
    if (endTime && !TIME_OPTIONS_30_MIN.includes(endTime)) {
      return [...TIME_OPTIONS_30_MIN, endTime].sort();
    }
    return TIME_OPTIONS_30_MIN;
  }, [endTime]);

  const openNewServiceModal = () => {
    setModalKind('service');
    setEditingService(null);
    setName('');
    setSelectedDays([0]);
    setStartTime('10:00');
    setEndTime('11:30');
    setLocation('Main Church');
    setNotes('');
    setColor(PRESET_COLORS[0]);
    setRequiredRoles([]);
    setRoleToAddId('');
    setIsModalOpen(true);
  };

  const openNewActivityModal = () => {
    setModalKind('activity');
    setEditingService(null);
    setName('');
    setSelectedDays([3]); // Default Wednesday
    setStartTime('19:00');
    setEndTime('20:30');
    setLocation('');
    setNotes('');
    setColor(PRESET_COLORS[1]);
    setRequiredRoles([]);
    setRoleToAddId('');
    setIsModalOpen(true);
  };

  const openEditServiceModal = (item: RegularService) => {
    const isAct = item.kind === 'activity';
    setModalKind(isAct ? 'activity' : 'service');
    setEditingService(item);
    setName(item.name);
    setSelectedDays(item.daysOfWeek || [0]);
    setStartTime(item.startTime);
    setEndTime(item.endTime || '');
    setLocation(item.location || '');
    setNotes(item.notes || '');
    setColor(item.color || PRESET_COLORS[0]);
    setRequiredRoles(item.requiredRoles || []);
    setRoleToAddId('');
    setIsModalOpen(true);
  };

  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter(d => d !== dayIndex));
      }
    } else {
      setSelectedDays([...selectedDays, dayIndex].sort());
    }
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

  const handleUpdateRoleCount = (roleId: string, delta: number) => {
    setRequiredRoles(prev =>
      prev
        .map(r => (r.roleId === roleId ? { ...r, count: Math.max(1, r.count + delta) } : r))
        .filter(r => r.count > 0)
    );
  };

  const handleRemoveRoleSpec = (roleId: string) => {
    setRequiredRoles(prev => prev.filter(r => r.roleId !== roleId));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (editingService) {
        const updates: Partial<RegularService> = {
          name: name.trim(),
          daysOfWeek: selectedDays,
          startTime,
          endTime: endTime.trim(),
          location: location.trim(),
          notes: notes.trim(),
          color,
          requiredRoles,
        };
        if (editingService.kind === 'activity') {
          updates.kind = 'activity';
        }
        await updateRegularService(editingService.id, updates);
      } else {
        const newRecord: Omit<RegularService, 'id' | 'createdAt' | 'updatedAt'> = {
          name: name.trim(),
          daysOfWeek: selectedDays,
          startTime,
          endTime: endTime.trim(),
          location: location.trim(),
          notes: notes.trim(),
          color,
          requiredRoles,
          ...(modalKind === 'activity' ? { kind: 'activity' } : {})
        };
        await addRegularService(newRecord);
      }
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isActivityModal = modalKind === 'activity';

  // Helper to render a grid of item cards
  const renderItemCards = (items: RegularService[], isAct: boolean) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 motion-list-enter viewer-stagger-grid">
        {items.map((item) => {
          const dayNames = item.daysOfWeek.map(d => DAY_LABELS[d]).join(', ');

          return (
            <div
              key={item.id}
              className="rounded-2xl bg-surface border border-subtle shadow-card hover:shadow-md motion-card p-5 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Top Bar with Color Indicator and Day Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                      {dayNames}
                    </span>
                    {isAct && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-accent-tint text-accent uppercase tracking-wide">
                        Activity
                      </span>
                    )}
                  </div>

                  {!isViewer && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditServiceModal(item)}
                        className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors"
                        title={isAct ? 'Edit Activity' : 'Edit Service'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setServiceToDelete(item)}
                        className="p-1.5 rounded-lg text-sec hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title={isAct ? 'Delete Activity' : 'Delete Service'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-main line-clamp-1">{item.name}</h3>
                  <div className="flex flex-col gap-1 text-xs text-sec mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-mut shrink-0" />
                      <span className="tabular-nums">
                        {formatTime(item.startTime, settings.timeFormat)}
                        {item.endTime ? ` - ${formatTime(item.endTime, settings.timeFormat)}` : ''}
                      </span>
                    </div>
                    {item.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-mut shrink-0" />
                        <span className="truncate">{item.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {item.notes && (
                  <p className="text-xs text-mut line-clamp-2 italic">
                    "{item.notes}"
                  </p>
                )}

                {/* Required Roles Specification */}
                <div className="pt-3 border-t border-subtle">
                  <span className="text-[11px] font-semibold text-mut uppercase tracking-wider block mb-2">
                    Required Roles Per Week ({item.requiredRoles?.reduce((s, r) => s + r.count, 0) || 0} spots)
                  </span>
                  {item.requiredRoles && item.requiredRoles.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.requiredRoles.map((r, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-subtle border border-subtle text-sec"
                        >
                          <span>{r.roleName}</span>
                          <span className="px-1.5 py-0.2 rounded bg-surface border border-subtle text-[11px] font-bold text-accent tabular-nums">
                            x{r.count}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-mut italic">No roles configured</span>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-subtle text-[11px] text-mut flex items-center justify-between">
                <span>Weekly Recurring</span>
                <span className="text-accent font-medium">Auto-populates calendar</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 motion-page-enter">
      {/* Page Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-main">Services & Activities</h1>
          <p className="text-sm text-sec mt-0.5">
            {isViewer
              ? 'Browse weekly recurring worship services, midweek meetings, and church activities.'
              : 'Configure weekly recurring services and activities. They will automatically populate on the calendar and rosters.'}
          </p>
        </div>
        {!isViewer && (
          <button
            type="button"
            onClick={openNewServiceModal}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Regular Service</span>
          </button>
        )}
      </div>

      {dataLoading.services ? (
        <PageLoading />
      ) : (
        <>
      {/* SECTION 1: Regular Services */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-main">Regular Services</h2>
            <p className="text-xs text-sec mt-0.5">
              Weekly worship services, Sunday schools, and midweek prayer meetings.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-subtle border border-subtle text-sec">
            {services.length} {services.length === 1 ? 'service' : 'services'}
          </span>
        </div>

        {services.length === 0 ? (
          <div className="p-10 rounded-2xl bg-surface border border-subtle text-center space-y-3.5 shadow-card">
            <div className="w-12 h-12 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-base font-semibold text-main">No regular services yet</h3>
              <p className="text-xs text-sec mt-1 leading-relaxed">
                {isViewer
                  ? 'No weekly worship services or prayer meetings have been published yet.'
                  : 'Create your church\'s weekly worship services or prayer meetings. Specify which days they occur and what volunteer roles are required each week.'}
              </p>
            </div>
            {!isViewer && (
              <button
                type="button"
                onClick={openNewServiceModal}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Service</span>
              </button>
            )}
          </div>
        ) : (
          renderItemCards(services, false)
        )}
      </div>

      {/* SECTION 2: Regular Activities */}
      <div className="space-y-4 pt-6 border-t border-subtle viewer-scroll-section">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-main">Regular Activities</h2>
            <p className="text-xs text-sec mt-0.5">
              Recurring ministries, Bible studies, youth fellowships, discipleship classes, and visitation.
            </p>
          </div>
          {!isViewer && (
            <button
              type="button"
              onClick={openNewActivityModal}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New Regular Activity</span>
            </button>
          )}
        </div>

        {activities.length === 0 ? (
          <div className="p-10 rounded-2xl bg-surface border border-subtle text-center space-y-3.5 shadow-card">
            <div className="w-12 h-12 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-base font-semibold text-main">No regular activities yet.</h3>
              <p className="text-xs text-sec mt-1 leading-relaxed">
                Add recurring church activities like Home Bible Studies, Youth Fellowships, Discipleship Classes, Visitation, or Soul Winning teams.
              </p>
            </div>
            {!isViewer && (
              <button
                type="button"
                onClick={openNewActivityModal}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Activity</span>
              </button>
            )}
          </div>
        ) : (
          renderItemCards(activities, true)
        )}
      </div>
        </>
      )}

      {/* Service / Activity Create & Edit Modal */}
      {!isViewer && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
          <div className="w-full max-w-xl p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main max-h-[90vh] overflow-y-auto space-y-5 motion-popup-in">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="text-base font-bold text-main">
                {editingService
                  ? (editingService.kind === 'activity' ? 'Edit Regular Activity' : 'Edit Regular Service')
                  : (isActivityModal ? 'Create Regular Activity' : 'Create Regular Service')}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-mut hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  {isActivityModal ? 'Activity Name *' : 'Service Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    isActivityModal
                      ? 'e.g. Home Bible Study, Youth Fellowship, Discipleship Class, Visitation, Soul Winning'
                      : 'e.g. Sunday Morning Worship'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Day of Week Multi-Select */}
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  Recurring Day(s) of the Week *
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {FULL_DAY_LABELS.map((dayName, idx) => {
                    const isSelected = selectedDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`py-2 text-center rounded-xl font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-accent text-accent-contrast shadow-xs'
                            : 'bg-subtle text-sec hover:bg-surface-hover border border-subtle'
                        }`}
                        title={dayName}
                      >
                        {DAY_LABELS[idx]}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-mut mt-1 block">
                  Select one or multiple days (e.g. both Sunday and Wednesday).
                </span>
              </div>

              {/* Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                    Start Time *
                  </label>
                  <select
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent cursor-pointer"
                  >
                    {startTimeOptions.map((t) => (
                      <option key={t} value={t}>
                        {formatTime(t, settings.timeFormat)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                    End Time (Optional)
                  </label>
                  <select
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent cursor-pointer"
                  >
                    <option value="">-- None / Open-ended --</option>
                    {endTimeOptions.map((t) => (
                      <option key={t} value={t}>
                        {formatTime(t, settings.timeFormat)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  Location (Optional)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Main Church, Fellowship Hall, or Host Home"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Color Label */}
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  Calendar Color Label
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                        color === c ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Required Roles Specification */}
              <div className="p-4 rounded-xl bg-subtle border border-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main uppercase tracking-wider">
                    {isActivityModal ? 'Required Roles / Responsibilities' : 'Required Roles Roster'}
                  </span>
                  <span className="text-[11px] text-mut">From People & Ministries</span>
                </div>

                {flatTree.length === 0 ? (
                  <p className="text-xs text-mut italic">
                    No roles created yet. Go to People & Ministries to create roles (like Leader, Teacher, Driver, Facilitator).
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={roleToAddId}
                      onChange={(e) => setRoleToAddId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent cursor-pointer"
                    >
                      <option value="">Select a role to require...</option>
                      {flatTree.map((item) => (
                        <option key={item.node.id} value={item.node.id}>
                          {'\u00A0\u00A0\u00A0\u00A0'.repeat(item.depth)}
                          {item.depth > 0 ? '↳ ' : ''}
                          {item.node.title} {item.node.assignedPeopleIds?.length ? `(${item.node.assignedPeopleIds.length} attached)` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!roleToAddId}
                      onClick={handleAddRoleSpec}
                      className="px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-medium text-xs shadow-xs disabled:opacity-40 cursor-pointer"
                    >
                      Add Role
                    </button>
                  </div>
                )}

                {/* Selected required roles */}
                {requiredRoles.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {requiredRoles.map((roleSpec) => (
                      <div
                        key={roleSpec.roleId}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface border border-subtle"
                      >
                        <span className="font-medium text-main">{roleSpec.roleName}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateRoleCount(roleSpec.roleId, -1)}
                            className="p-1 rounded text-sec hover:bg-subtle"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-bold text-main tabular-nums min-w-[20px] text-center">
                            x{roleSpec.count}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateRoleCount(roleSpec.roleId, 1)}
                            className="p-1 rounded text-sec hover:bg-subtle"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoleSpec(roleSpec.roleId)}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  General Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    isActivityModal
                      ? 'e.g. Bring your study guides, meets at youth room...'
                      : 'e.g. Communion on 1st Sunday of each month...'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none"
                />
              </div>

              <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec font-medium cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-medium shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size="xs" variant="contrast" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>
                      {editingService
                        ? 'Save Changes'
                        : (isActivityModal ? 'Create Activity' : 'Create Service')}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {!isViewer && (
        <ConfirmModal
          isOpen={!!serviceToDelete}
          title={`Delete "${serviceToDelete?.name}"?`}
          message={`This recurring ${serviceToDelete?.kind === 'activity' ? 'activity' : 'service'} will be deleted from all future calendar weeks and its associated roster assignments will be removed.`}
          confirmLabel={`Delete ${serviceToDelete?.kind === 'activity' ? 'Activity' : 'Service'}`}
          onConfirm={async () => {
            if (serviceToDelete) {
              await deleteRegularService(serviceToDelete.id);
              setServiceToDelete(null);
            }
          }}
          onCancel={() => setServiceToDelete(null)}
        />
      )}
    </div>
  );
};
