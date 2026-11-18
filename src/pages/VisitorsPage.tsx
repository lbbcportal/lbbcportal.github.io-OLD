import React, { useState, useMemo, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  CalendarPlus,
  BarChart3,
  List,
  Phone,
  MapPin,
  User,
  Calendar,
  X,
  Check,
  FilterX
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Visitor, VisitorCivilStatus, VisitorFollowUpStatus } from '../types';
import { formatDate, getTodayString } from '../lib/dateTime';
import {
  VisitorDateRangePreset,
  getVisitorDateRangeBounds,
  visitorHasVisitInRange,
  getFirstVisitDate,
  getLatestVisitDate,
  getVisitorAgeGroupId,
  formatAgeGroupLabel,
  exportVisitorsToCsv
} from '../lib/visitorHelpers';
import { ConfirmModal } from '../components/ConfirmModal';
import { VisitorFormModal } from '../components/VisitorFormModal';
import { VisitorAnalyticsTab } from '../components/VisitorAnalyticsTab';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

interface VisitorsPageProps {
  initialFollowUpFilter?: VisitorFollowUpStatus | 'ALL';
  onConsumeInitialFilter?: () => void;
}

type VisitorsTab = 'list' | 'analytics';
type VisitorSortOption = 'newest' | 'oldest' | 'name_asc' | 'most_visits';

const CIVIL_STATUS_FILTERS: VisitorCivilStatus[] = [
  'Single',
  'Married',
  'Widowed',
  'Separated',
  'Other'
];

const FOLLOW_UP_FILTERS: VisitorFollowUpStatus[] = [
  'To follow up',
  'Followed up',
  'Not needed'
];

function getFollowUpBadgeClass(status: VisitorFollowUpStatus): string {
  if (status === 'To follow up') {
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
  }
  if (status === 'Followed up') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  }
  return 'bg-subtle text-sec border-subtle';
}

export const VisitorsPage: React.FC<VisitorsPageProps> = ({
  initialFollowUpFilter,
  onConsumeInitialFilter
}) => {
  const {
    visitors,
    visitorSettings,
    people,
    regularServices,
    addVisitor,
    updateVisitor,
    deleteVisitor,
    addVisitorReturnVisit,
    updateVisitorSettings,
    trackBusyOperation,
    dataLoading
  } = useData();

  const [activeTab, setActiveTab] = useState<VisitorsTab>('list');

  // List filters & sorting
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePreset, setDatePreset] = useState<VisitorDateRangePreset>('all');
  const [customSinceDate, setCustomSinceDate] = useState<string>('');
  const [barangayFilter, setBarangayFilter] = useState<string>('ALL');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('ALL');
  const [civilStatusFilter, setCivilStatusFilter] = useState<string>('ALL');
  const [followUpFilter, setFollowUpFilter] = useState<string>(initialFollowUpFilter || 'ALL');
  const [sortBy, setSortBy] = useState<VisitorSortOption>('newest');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Visitor | null>(null);

  // Return Visit Modal
  const [returnVisitTarget, setReturnVisitTarget] = useState<Visitor | null>(null);
  const [returnVisitDate, setReturnVisitDate] = useState<string>(getTodayString());
  const [isSavingReturnVisit, setIsSavingReturnVisit] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);

  // Sync external initial filter (e.g. clicking "N visitors to follow up" on Home)
  useEffect(() => {
    if (initialFollowUpFilter && initialFollowUpFilter !== 'ALL') {
      setActiveTab('list');
      setFollowUpFilter(initialFollowUpFilter);
      onConsumeInitialFilter?.();
    }
  }, [initialFollowUpFilter, onConsumeInitialFilter]);

  const barangayOptions = useMemo(() => {
    const set = new Set<string>();
    visitors.forEach(v => {
      if (v.barangay?.trim()) set.add(v.barangay.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [visitors]);

  const dateBounds = useMemo(
    () => getVisitorDateRangeBounds(datePreset, customSinceDate),
    [datePreset, customSinceDate]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      datePreset !== 'all' ||
      barangayFilter !== 'ALL' ||
      ageGroupFilter !== 'ALL' ||
      civilStatusFilter !== 'ALL' ||
      followUpFilter !== 'ALL'
    );
  }, [searchQuery, datePreset, barangayFilter, ageGroupFilter, civilStatusFilter, followUpFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    setDatePreset('all');
    setCustomSinceDate('');
    setBarangayFilter('ALL');
    setAgeGroupFilter('ALL');
    setCivilStatusFilter('ALL');
    setFollowUpFilter('ALL');
  };

  const filteredVisitors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = visitors.filter(v => {
      if (q) {
        const hayName = (v.name || '').toLowerCase();
        const hayBrgy = (v.barangay || '').toLowerCase();
        const hayAddr = (v.address || '').toLowerCase();
        if (!hayName.includes(q) && !hayBrgy.includes(q) && !hayAddr.includes(q)) {
          return false;
        }
      }

      if (datePreset !== 'all') {
        if (!visitorHasVisitInRange(v, dateBounds.start, dateBounds.end)) {
          return false;
        }
      }

      if (barangayFilter !== 'ALL') {
        if ((v.barangay?.trim() || '') !== barangayFilter) return false;
      }

      if (ageGroupFilter !== 'ALL') {
        const groupId = getVisitorAgeGroupId(v.age, visitorSettings.ageGroups);
        if (groupId !== ageGroupFilter) return false;
      }

      if (civilStatusFilter !== 'ALL') {
        if ((v.civilStatus || '') !== civilStatusFilter) return false;
      }

      if (followUpFilter !== 'ALL') {
        if (v.followUpStatus !== followUpFilter) return false;
      }

      return true;
    });

    const sorted = [...matched];
    sorted.sort((a, b) => {
      if (sortBy === 'newest') {
        const aDate = getLatestVisitDate(a.visits) || a.createdAt || '';
        const bDate = getLatestVisitDate(b.visits) || b.createdAt || '';
        return bDate.localeCompare(aDate) || (b.createdAt || '').localeCompare(a.createdAt || '');
      }
      if (sortBy === 'oldest') {
        const aDate = getFirstVisitDate(a.visits) || a.createdAt || '';
        const bDate = getFirstVisitDate(b.visits) || b.createdAt || '';
        return aDate.localeCompare(bDate) || (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      // most_visits
      const diff = (b.visits?.length || 0) - (a.visits?.length || 0);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '');
    });

    return sorted;
  }, [
    visitors,
    searchQuery,
    datePreset,
    dateBounds,
    barangayFilter,
    ageGroupFilter,
    civilStatusFilter,
    followUpFilter,
    sortBy,
    visitorSettings.ageGroups
  ]);

  const handleOpenAdd = () => {
    setEditingVisitor(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (visitor: Visitor) => {
    setEditingVisitor(visitor);
    setIsFormModalOpen(true);
  };

  const handleOpenReturnVisit = (visitor: Visitor) => {
    setReturnVisitTarget(visitor);
    setReturnVisitDate(getTodayString());
  };

  const handleConfirmReturnVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnVisitTarget || !returnVisitDate) return;
    setIsSavingReturnVisit(true);
    try {
      await addVisitorReturnVisit(returnVisitTarget.id, returnVisitDate);
      setReturnVisitTarget(null);
    } finally {
      setIsSavingReturnVisit(false);
    }
  };

  const handleExportCsv = async () => {
    if (filteredVisitors.length === 0 || isExportingCsv) return;
    setIsExportingCsv(true);
    try {
      await trackBusyOperation(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        exportVisitorsToCsv(filteredVisitors);
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 motion-page-enter">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-main tracking-tight">
            Visitors
          </h1>
          <p className="text-sm text-sec mt-1">
            First-time and returning visitor log, follow-ups, and Sunday attendance trends
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-sm font-semibold shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Visitor</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-subtle pb-3">
        <div className="inline-flex p-1 rounded-xl bg-surface border border-subtle shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'list'
                ? 'bg-accent text-accent-contrast shadow-xs'
                : 'text-sec hover:text-main hover:bg-surface-hover'
            }`}
          >
            <List className="w-4 h-4" />
            <span>Visitor List</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                activeTab === 'list'
                  ? 'bg-accent-chip'
                  : 'bg-subtle text-sec'
              }`}
            >
              {visitors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-accent text-accent-contrast shadow-xs'
                : 'text-sec hover:text-main hover:bg-surface-hover'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </button>
        </div>

        {activeTab === 'list' && !dataLoading.visitors && visitors.length > 0 && (
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredVisitors.length === 0 || isExportingCsv}
            className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-main text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isExportingCsv ? (
              <>
                <Spinner size="xs" variant="accent" />
                <span>Preparing file...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-accent" />
                <span>Export CSV ({filteredVisitors.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      {dataLoading.visitors ? (
        <PageLoading />
      ) : (
        <>
      {/* TAB 1: VISITOR LIST */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search */}
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-mut absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, barangay, or address..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Date Range */}
              <div className="md:col-span-4 flex items-center gap-2">
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as VisitorDateRangePreset)}
                  className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  aria-label="Filter by date range"
                >
                  <option value="all">All time</option>
                  <option value="this_month">This month</option>
                  <option value="last_3_months">Last 3 months</option>
                  <option value="since">Since a date I pick</option>
                </select>
                {datePreset === 'since' && (
                  <input
                    type="date"
                    value={customSinceDate}
                    onChange={(e) => setCustomSinceDate(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0"
                  />
                )}
              </div>

              {/* Sort */}
              <div className="md:col-span-3">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as VisitorSortOption)}
                  className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  aria-label="Sort visitors"
                >
                  <option value="newest">Sort: Newest first</option>
                  <option value="oldest">Sort: Oldest first</option>
                  <option value="name_asc">Sort: Name (A–Z)</option>
                  <option value="most_visits">Sort: Most visits</option>
                </select>
              </div>
            </div>

            {/* Secondary Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={barangayFilter}
                onChange={(e) => setBarangayFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                aria-label="Filter by barangay"
              >
                <option value="ALL">All Barangays</option>
                {barangayOptions.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <select
                value={ageGroupFilter}
                onChange={(e) => setAgeGroupFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                aria-label="Filter by age group"
              >
                <option value="ALL">All Age Groups</option>
                {visitorSettings.ageGroups.map(rule => (
                  <option key={rule.id} value={rule.id}>
                    {formatAgeGroupLabel(rule)}
                  </option>
                ))}
                <option value="unknown">Unknown Age</option>
              </select>

              <select
                value={civilStatusFilter}
                onChange={(e) => setCivilStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                aria-label="Filter by civil status"
              >
                <option value="ALL">All Civil Statuses</option>
                {CIVIL_STATUS_FILTERS.map(cs => (
                  <option key={cs} value={cs}>{cs}</option>
                ))}
              </select>

              <select
                value={followUpFilter}
                onChange={(e) => setFollowUpFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                aria-label="Filter by follow-up status"
              >
                <option value="ALL">All Follow-up Statuses</option>
                {FOLLOW_UP_FILTERS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-sec">
                  Showing <strong className="text-main">{filteredVisitors.length}</strong> of {visitors.length} visitors
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-accent hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <FilterX className="w-3.5 h-3.5" />
                  <span>Clear filters</span>
                </button>
              </div>
            )}
          </div>

          {/* Empty State / Results (wrapped once so search/filters never replay fade) */}
          <div className="motion-list-enter">
          {visitors.length === 0 ? (
            <div className="rounded-2xl border border-subtle bg-surface shadow-card p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-accent-tint text-accent flex items-center justify-center mx-auto">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-main">No visitors recorded yet</h3>
                <p className="text-xs sm:text-sm text-sec max-w-md mx-auto">
                  Start entering Sunday visitor slips in a batch using "Add Visitor" and "Save and add another".
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Visitor</span>
              </button>
            </div>
          ) : filteredVisitors.length === 0 ? (
            <div className="rounded-2xl border border-subtle bg-surface shadow-card p-10 text-center space-y-3">
              <h3 className="text-base font-bold text-main">No matching visitors</h3>
              <p className="text-xs sm:text-sm text-sec">
                Try adjusting your search or filter selections.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 rounded-xl border border-subtle bg-subtle hover:bg-surface-hover text-main text-xs font-semibold cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Cards (small screens) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredVisitors.map(v => {
                  const firstVisit = getFirstVisitDate(v.visits);
                  const visitCount = v.visits?.length || 0;

                  return (
                    <div
                      key={v.id}
                      className="rounded-2xl border border-subtle bg-surface shadow-card p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-main truncate">{v.name}</h3>
                          <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-sec">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-mut" />
                              First: {firstVisit ? formatDate(firstVisit) : '—'}
                            </span>
                            {v.age !== undefined && v.age !== null && (
                              <span>· Age {v.age}</span>
                            )}
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-tint text-accent shrink-0">
                          Visited {visitCount} {visitCount === 1 ? 'time' : 'times'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5 text-xs text-sec">
                        {v.barangay && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-mut shrink-0" />
                            <span>Brgy. {v.barangay}</span>
                          </div>
                        )}
                        {v.contact && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-mut shrink-0" />
                            <span>{v.contact}</span>
                          </div>
                        )}
                        {v.invitedBy && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-mut shrink-0" />
                            <span>Invited by {v.invitedBy}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-subtle">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getFollowUpBadgeClass(
                            v.followUpStatus
                          )}`}
                        >
                          {v.followUpStatus}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenReturnVisit(v)}
                            className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>Add return visit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(v)}
                            className="p-1.5 rounded-lg border border-subtle bg-subtle hover:bg-surface-hover text-sec hover:text-main cursor-pointer"
                            title="Edit visitor"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(v)}
                            className="p-1.5 rounded-lg border border-subtle bg-subtle hover:bg-red-50 dark:hover:bg-red-950/40 text-sec hover:text-red-600 cursor-pointer"
                            title="Delete visitor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block rounded-2xl border border-subtle bg-surface shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-subtle bg-subtle/60 text-[11px] font-bold uppercase tracking-wider text-sec">
                        <th className="py-3 px-4">Visitor</th>
                        <th className="py-3 px-3">First Visit</th>
                        <th className="py-3 px-3">Age</th>
                        <th className="py-3 px-3">Barangay</th>
                        <th className="py-3 px-3">Contact</th>
                        <th className="py-3 px-3">Invited By</th>
                        <th className="py-3 px-3">Visits</th>
                        <th className="py-3 px-3">Follow-up</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle text-sm">
                      {filteredVisitors.map(v => {
                        const firstVisit = getFirstVisitDate(v.visits);
                        const visitCount = v.visits?.length || 0;

                        return (
                          <tr
                            key={v.id}
                            className="hover:bg-surface-hover/60 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-main">{v.name}</div>
                              {v.serviceName && (
                                <div className="text-[11px] text-mut">{v.serviceName}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-xs text-sec whitespace-nowrap">
                              {firstVisit ? formatDate(firstVisit) : '—'}
                            </td>
                            <td className="py-3 px-3 text-xs text-sec tabular-nums">
                              {v.age !== undefined && v.age !== null ? v.age : '—'}
                            </td>
                            <td className="py-3 px-3 text-xs text-sec">
                              {v.barangay || '—'}
                            </td>
                            <td className="py-3 px-3 text-xs text-sec whitespace-nowrap">
                              {v.contact || '—'}
                            </td>
                            <td className="py-3 px-3 text-xs text-sec">
                              {v.invitedBy || '—'}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-tint text-accent">
                                Visited {visitCount} {visitCount === 1 ? 'time' : 'times'}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getFollowUpBadgeClass(
                                  v.followUpStatus
                                )}`}
                              >
                                {v.followUpStatus}
                              </span>
                              {v.followUpNote && (
                                <div className="text-[11px] text-mut max-w-[160px] truncate mt-0.5" title={v.followUpNote}>
                                  {v.followUpNote}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenReturnVisit(v)}
                                  className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Add return visit"
                                >
                                  <CalendarPlus className="w-3.5 h-3.5" />
                                  <span>Add return visit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(v)}
                                  className="p-1.5 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main cursor-pointer transition-colors"
                                  title="Edit visitor"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(v)}
                                  className="p-1.5 rounded-lg border border-subtle bg-surface hover:bg-red-50 dark:hover:bg-red-950/40 text-sec hover:text-red-600 cursor-pointer transition-colors"
                                  title="Delete visitor"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* TAB 2: ANALYTICS */}
      {activeTab === 'analytics' && (
        <VisitorAnalyticsTab
          visitors={visitors}
          visitorSettings={visitorSettings}
          onUpdateVisitorSettings={updateVisitorSettings}
        />
      )}
        </>
      )}

      {/* Add / Edit Visitor Modal */}
      <VisitorFormModal
        isOpen={isFormModalOpen}
        editingVisitor={editingVisitor}
        visitors={visitors}
        people={people}
        regularServices={regularServices}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingVisitor(null);
        }}
        onSaveNew={addVisitor}
        onUpdateExisting={updateVisitor}
        onAddReturnVisit={addVisitorReturnVisit}
      />

      {/* Add Return Visit Modal */}
      {returnVisitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
          <form
            onSubmit={handleConfirmReturnVisit}
            className="w-full max-w-sm rounded-2xl bg-surface border border-subtle shadow-2xl p-5 space-y-4 text-main motion-popup-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-main">Add Return Visit</h3>
                <p className="text-xs text-sec mt-0.5">{returnVisitTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setReturnVisitTarget(null)}
                className="p-1 rounded-lg text-mut hover:text-main hover:bg-surface-hover cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Visit Date
              </label>
              <input
                type="date"
                value={returnVisitDate}
                onChange={(e) => setReturnVisitDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReturnVisitTarget(null)}
                disabled={isSavingReturnVisit}
                className="px-3.5 py-2 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingReturnVisit || !returnVisitDate}
                className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingReturnVisit ? (
                  <>
                    <Spinner size="xs" variant="contrast" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Visit</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Visitor"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}" and all recorded visits? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        isDestructive
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteVisitor(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
