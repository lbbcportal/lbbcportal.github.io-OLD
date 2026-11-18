import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Repeat,
  PhoneCall,
  Sliders,
  Plus,
  Trash2,
  X,
  RotateCcw,
  Calendar,
  BarChart3
} from 'lucide-react';
import {
  Visitor,
  VisitorAgeGroupRule,
  VisitorSettings,
  DEFAULT_VISITOR_AGE_GROUPS
} from '../types';
import { formatDate } from '../lib/dateTime';
import {
  VisitorDateRangePreset,
  getVisitorDateRangeBounds,
  visitorHasVisitInRange,
  getFirstVisitDate,
  isDateInRange,
  formatAgeGroupLabel,
  getVisitorAgeGroupId,
  getSundayForDate
} from '../lib/visitorHelpers';
import { Spinner } from './LoadingIndicator';

interface VisitorAnalyticsTabProps {
  visitors: Visitor[];
  visitorSettings: VisitorSettings;
  onUpdateVisitorSettings: (updates: Partial<VisitorSettings>) => Promise<void>;
}

interface BarDatum {
  label: string;
  count: number;
}

const HorizontalBarList: React.FC<{
  title: string;
  items: BarDatum[];
  emptyText: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
}> = ({ title, items, emptyText, subtitle, headerAction }) => {
  const maxVal = Math.max(1, ...items.map(i => i.count));
  const totalVal = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="rounded-2xl border border-subtle bg-surface shadow-card p-5 space-y-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-subtle">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-main">{title}</h3>
          {subtitle && <p className="text-xs text-sec mt-0.5">{subtitle}</p>}
        </div>
        {headerAction}
      </div>

      {items.length === 0 || totalVal === 0 ? (
        <div className="py-6 text-center text-xs text-mut">{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const pct = Math.round((item.count / maxVal) * 100);
            const share = totalVal > 0 ? Math.round((item.count / totalVal) * 100) : 0;
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-main truncate">{item.label}</span>
                  <span className="text-sec font-semibold shrink-0 tabular-nums">
                    {item.count} <span className="text-mut font-normal">({share}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-subtle overflow-hidden border border-subtle/60">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${item.count > 0 ? Math.max(pct, 4) : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const VisitorAnalyticsTab: React.FC<VisitorAnalyticsTabProps> = ({
  visitors,
  visitorSettings,
  onUpdateVisitorSettings
}) => {
  const [rangePreset, setRangePreset] = useState<VisitorDateRangePreset>('last_3_months');
  const [customSince, setCustomSince] = useState<string>('');
  const [isAgeModalOpen, setIsAgeModalOpen] = useState<boolean>(false);
  const [draftAgeGroups, setDraftAgeGroups] = useState<VisitorAgeGroupRule[]>(visitorSettings.ageGroups);
  const [ageError, setAgeError] = useState<string>('');
  const [isSavingAges, setIsSavingAges] = useState<boolean>(false);

  const bounds = useMemo(
    () => getVisitorDateRangeBounds(rangePreset, customSince),
    [rangePreset, customSince]
  );

  const visitorsInRange = useMemo(() => {
    return visitors.filter(v => visitorHasVisitInRange(v, bounds.start, bounds.end));
  }, [visitors, bounds]);

  // KPI metrics
  const kpis = useMemo(() => {
    const total = visitorsInRange.length;
    const newVisitors = visitorsInRange.filter(v => {
      const firstDate = getFirstVisitDate(v.visits);
      const isFirstInRange = !bounds.start && !bounds.end
        ? true
        : isDateInRange(firstDate, bounds.start, bounds.end);
      return isFirstInRange && (v.visits?.length || 0) <= 1;
    }).length;
    const returningVisitors = visitorsInRange.filter(v => (v.visits?.length || 0) > 1).length;
    const stillToFollowUp = visitorsInRange.filter(v => v.followUpStatus === 'To follow up').length;
    return { total, newVisitors, returningVisitors, stillToFollowUp };
  }, [visitorsInRange, bounds]);

  // Age groups breakdown
  const ageGroupData = useMemo((): BarDatum[] => {
    const counts = new Map<string, number>();
    visitorSettings.ageGroups.forEach(rule => counts.set(rule.id, 0));
    counts.set('unknown', 0);

    visitorsInRange.forEach(v => {
      const groupId = getVisitorAgeGroupId(v.age, visitorSettings.ageGroups);
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    });

    const result: BarDatum[] = visitorSettings.ageGroups.map(rule => ({
      label: formatAgeGroupLabel(rule),
      count: counts.get(rule.id) || 0
    }));
    result.push({
      label: 'Unknown',
      count: counts.get('unknown') || 0
    });
    return result;
  }, [visitorsInRange, visitorSettings.ageGroups]);

  // Top barangays (Top 10)
  const topBarangays = useMemo((): BarDatum[] => {
    const counts = new Map<string, number>();
    visitorsInRange.forEach(v => {
      const label = v.barangay?.trim() || 'Unspecified';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 10);
  }, [visitorsInRange]);

  // Civil status breakdown
  const civilStatusData = useMemo((): BarDatum[] => {
    const order = ['Single', 'Married', 'Widowed', 'Separated', 'Other', 'Unspecified'];
    const counts = new Map<string, number>();
    visitorsInRange.forEach(v => {
      const label = v.civilStatus || 'Unspecified';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return order
      .map(label => ({ label, count: counts.get(label) || 0 }))
      .filter(d => d.count > 0);
  }, [visitorsInRange]);

  // Service attended breakdown
  const serviceBreakdown = useMemo((): BarDatum[] => {
    const counts = new Map<string, number>();
    visitorsInRange.forEach(v => {
      const label = v.serviceName?.trim() || 'Unspecified';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [visitorsInRange]);

  // Top inviters (Top 10)
  const topInviters = useMemo((): BarDatum[] => {
    const counts = new Map<string, number>();
    visitorsInRange.forEach(v => {
      const inv = v.invitedBy?.trim();
      if (!inv) return;
      counts.set(inv, (counts.get(inv) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 10);
  }, [visitorsInRange]);

  // Visitors per Sunday trend (unique visitors per Sunday week within range)
  const sundaySeries = useMemo(() => {
    const sundayVisitors = new Map<string, Set<string>>();
    visitorsInRange.forEach(v => {
      (v.visits || []).forEach(visitDate => {
        if (bounds.start || bounds.end) {
          if (!isDateInRange(visitDate, bounds.start, bounds.end)) return;
        }
        const sunday = getSundayForDate(visitDate);
        if (!sunday) return;
        if (!sundayVisitors.has(sunday)) {
          sundayVisitors.set(sunday, new Set());
        }
        sundayVisitors.get(sunday)!.add(v.id);
      });
    });

    return Array.from(sundayVisitors.entries())
      .map(([date, set]) => ({
        date,
        shortLabel: formatDate(date, { month: 'short', day: 'numeric' }),
        count: set.size
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [visitorsInRange, bounds]);

  const openAgeSettingsModal = () => {
    setDraftAgeGroups(visitorSettings.ageGroups.map(g => ({ ...g })));
    setAgeError('');
    setIsAgeModalOpen(true);
  };

  const handleSaveAgeGroups = async () => {
    setAgeError('');
    if (draftAgeGroups.length === 0) {
      setAgeError('Add at least one age group.');
      return;
    }
    for (const g of draftAgeGroups) {
      if (!g.label.trim()) {
        setAgeError('Every age group must have a name.');
        return;
      }
      if (Number.isNaN(g.minAge) || g.minAge < 0) {
        setAgeError(`Invalid minimum age for "${g.label}".`);
        return;
      }
      if (g.maxAge !== undefined && (Number.isNaN(g.maxAge) || g.maxAge < g.minAge)) {
        setAgeError(`Maximum age must be greater than or equal to minimum age for "${g.label}".`);
        return;
      }
    }

    const sorted = [...draftAgeGroups]
      .map(g => ({
        ...g,
        label: g.label.trim()
      }))
      .sort((a, b) => a.minAge - b.minAge);

    setIsSavingAges(true);
    try {
      await onUpdateVisitorSettings({ ageGroups: sorted });
      setIsAgeModalOpen(false);
    } catch {
      setAgeError('Could not save age group settings. Please try again.');
    } finally {
      setIsSavingAges(false);
    }
  };

  const maxSundayCount = Math.max(1, ...sundaySeries.map(s => s.count));

  return (
    <div className="space-y-6">
      {/* Date Range Controls */}
      <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-sec">
          <Calendar className="w-4 h-4 text-accent" />
          <span>Date Range</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'this_month', label: 'This month' },
              { key: 'last_3_months', label: 'Last 3 months' },
              { key: 'since', label: 'Since a date I pick' },
              { key: 'all', label: 'All time' }
            ] as { key: VisitorDateRangePreset; label: string }[]
          ).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRangePreset(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                rangePreset === opt.key
                  ? 'bg-accent text-accent-contrast shadow-xs'
                  : 'bg-subtle text-sec hover:text-main hover:bg-surface-hover border border-subtle'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {rangePreset === 'since' && (
            <input
              type="date"
              value={customSince}
              onChange={(e) => setCustomSince(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
              aria-label="Since date"
            />
          )}
        </div>
      </div>

      {/* Empty Database Friendly State */}
      {visitors.length === 0 ? (
        <div className="rounded-2xl border border-subtle bg-surface shadow-card p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-accent-tint text-accent flex items-center justify-center mx-auto">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-main">No visitor data yet</h3>
          <p className="text-xs sm:text-sm text-sec max-w-md mx-auto">
            Analytics will appear here automatically as soon as you record your first visitors on the Visitor List tab.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sec">Total Visitors</span>
                <div className="p-2 rounded-lg bg-accent-tint text-accent">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold text-main tabular-nums">
                {kpis.total}
              </div>
              <p className="text-[11px] text-mut mt-1">Visited in selected range</p>
            </div>

            <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sec">New Visitors</span>
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <UserPlus className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold text-main tabular-nums">
                {kpis.newVisitors}
              </div>
              <p className="text-[11px] text-mut mt-1">Single visit starting in range</p>
            </div>

            <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sec">Returning Visitors</span>
                <div className="p-2 rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
                  <Repeat className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold text-main tabular-nums">
                {kpis.returningVisitors}
              </div>
              <p className="text-[11px] text-mut mt-1">More than 1 recorded visit</p>
            </div>

            <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sec">To Follow Up</span>
                <div className="p-2 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  <PhoneCall className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold text-main tabular-nums">
                {kpis.stillToFollowUp}
              </div>
              <p className="text-[11px] text-mut mt-1">In range needing follow-up</p>
            </div>
          </div>

          {/* Visitors per Sunday Chart */}
          <div className="rounded-2xl border border-subtle bg-surface shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-subtle">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-main">Visitors per Sunday</h3>
                <p className="text-xs text-sec mt-0.5">
                  Weekly visitor headcount grouped by Sunday week in selected range
                </p>
              </div>
              <span className="text-xs font-semibold text-sec">
                {sundaySeries.length} {sundaySeries.length === 1 ? 'Sunday' : 'Sundays'}
              </span>
            </div>

            {sundaySeries.length === 0 ? (
              <div className="py-8 text-center text-xs text-mut">
                No visits recorded in the selected date range.
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[420px]">
                  <div className="h-44 flex items-end gap-2 sm:gap-3 pt-6 px-2 border-b border-subtle">
                    {sundaySeries.map((pt) => {
                      const heightPct = Math.round((pt.count / maxSundayCount) * 100);
                      return (
                        <div
                          key={pt.date}
                          className="flex-1 min-w-[38px] max-w-[76px] h-full flex flex-col items-center justify-end group"
                          title={`${formatDate(pt.date)}: ${pt.count} visitor${pt.count === 1 ? '' : 's'}`}
                        >
                          <span className="text-[11px] font-bold text-main mb-1 tabular-nums">
                            {pt.count}
                          </span>
                          <div
                            className="w-full max-w-[34px] rounded-t-lg bg-accent group-hover:bg-accent-hover transition-all duration-300"
                            style={{ height: `${Math.max(heightPct, 6)}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3 pt-2 px-2">
                    {sundaySeries.map((pt) => (
                      <div
                        key={pt.date}
                        className="flex-1 min-w-[38px] max-w-[76px] text-center text-[10px] font-medium text-sec truncate"
                      >
                        {pt.shortLabel}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Age Groups */}
            <HorizontalBarList
              title="Visitors by Age Group"
              subtitle="Uses customizable age brackets"
              items={ageGroupData}
              emptyText="No visitors in selected date range."
              headerAction={
                <button
                  type="button"
                  onClick={openAgeSettingsModal}
                  className="px-2.5 py-1.5 rounded-lg border border-subtle bg-subtle hover:bg-surface-hover text-xs font-semibold text-main flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Sliders className="w-3.5 h-3.5 text-accent" />
                  <span>Edit age groups</span>
                </button>
              }
            />

            {/* Top Barangays */}
            <HorizontalBarList
              title="Top Barangays"
              subtitle="Top 10 barangays in selected range"
              items={topBarangays}
              emptyText="No barangays recorded in selected date range."
            />

            {/* Civil Status */}
            <HorizontalBarList
              title="Civil Status Breakdown"
              items={civilStatusData}
              emptyText="No visitors in selected date range."
            />

            {/* Service Attended */}
            <HorizontalBarList
              title="Service Attended"
              items={serviceBreakdown}
              emptyText="No visitors in selected date range."
            />
          </div>

          {/* Top Inviters */}
          <HorizontalBarList
            title="Top Inviters"
            subtitle="Top 10 people who invited visitors in selected range"
            items={topInviters}
            emptyText="No inviters recorded in selected date range."
          />
        </>
      )}

      {/* Edit Age Groups Modal */}
      {isAgeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
          <div
            className="w-full max-w-lg rounded-2xl bg-surface border border-subtle shadow-2xl text-main overflow-hidden flex flex-col max-h-[90vh] motion-popup-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-3.5 border-b border-subtle flex items-center justify-between bg-subtle/40">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-main">Edit Age Groups</h3>
                <p className="text-xs text-sec">Customize age boundaries used in visitor analytics</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAgeModalOpen(false)}
                className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-surface-hover cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {ageError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                  {ageError}
                </div>
              )}

              {draftAgeGroups.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="p-3 rounded-xl border border-subtle bg-subtle/40 grid grid-cols-12 gap-2 items-end"
                >
                  <div className="col-span-5">
                    <label className="block text-[11px] font-semibold text-sec mb-1">Group Name</label>
                    <input
                      type="text"
                      value={rule.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftAgeGroups(prev => prev.map((r, i) => i === idx ? { ...r, label: val } : r));
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[11px] font-semibold text-sec mb-1">Min Age</label>
                    <input
                      type="number"
                      min={0}
                      value={rule.minAge}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDraftAgeGroups(prev => prev.map((r, i) => i === idx ? { ...r, minAge: val } : r));
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[11px] font-semibold text-sec mb-1">Max (or blank)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="+"
                      value={rule.maxAge === undefined ? '' : rule.maxAge}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val = raw === '' ? undefined : Number(raw);
                        setDraftAgeGroups(prev => prev.map((r, i) => i === idx ? { ...r, maxAge: val } : r));
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end pb-1">
                    {draftAgeGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDraftAgeGroups(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg text-mut hover:text-red-600 cursor-pointer"
                        title="Remove group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setDraftAgeGroups(prev => [
                      ...prev,
                      {
                        id: 'age_' + Math.random().toString(36).substring(2, 8),
                        label: 'New Group',
                        minAge: 0,
                        maxAge: undefined
                      }
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-xs font-semibold text-main flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-accent" />
                  <span>Add group</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDraftAgeGroups(DEFAULT_VISITOR_AGE_GROUPS.map(g => ({ ...g })))}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-sec hover:text-main flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset defaults</span>
                </button>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-subtle bg-subtle/40 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsAgeModalOpen(false)}
                disabled={isSavingAges}
                className="px-4 py-2 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAgeGroups}
                disabled={isSavingAges}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isSavingAges ? (
                  <>
                    <Spinner size="xs" variant="contrast" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
