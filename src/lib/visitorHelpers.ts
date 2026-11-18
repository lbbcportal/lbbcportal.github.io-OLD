import { Visitor, VisitorAgeGroupRule } from '../types';
import { parseDateString, toDateString } from './dateTime';

export type VisitorDateRangePreset = 'this_month' | 'last_3_months' | 'since' | 'all';

/**
 * Returns the most recent Sunday on or before referenceDate in YYYY-MM-DD format.
 * If referenceDate is a Sunday, returns referenceDate.
 */
export function getMostRecentSunday(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return toDateString(d);
}

/**
 * Returns the Sunday (YYYY-MM-DD) of the week containing a given YYYY-MM-DD date.
 */
export function getSundayForDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDateString(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - d.getDay());
  return toDateString(d);
}

/**
 * Sort visit dates chronologically ascending while preserving uniqueness.
 */
export function normalizeVisitDates(visits: string[]): string[] {
  const cleaned = Array.from(new Set(visits.map(v => v.trim()).filter(Boolean)));
  cleaned.sort((a, b) => a.localeCompare(b));
  return cleaned;
}

/**
 * Get the first visit date (earliest visit date, or visits[0] if unsorted).
 */
export function getFirstVisitDate(visits: string[] | undefined): string {
  if (!visits || visits.length === 0) return '';
  const sorted = [...visits].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return sorted[0] || visits[0] || '';
}

/**
 * Get the most recent visit date.
 */
export function getLatestVisitDate(visits: string[] | undefined): string {
  if (!visits || visits.length === 0) return '';
  const sorted = [...visits].filter(Boolean).sort((a, b) => b.localeCompare(a));
  return sorted[0] || visits[0] || '';
}

/**
 * Format an age group rule label with its age range, e.g. "Children (0-12)" or "Seniors (60+)"
 */
export function formatAgeGroupLabel(rule: VisitorAgeGroupRule): string {
  if (rule.maxAge === undefined || rule.maxAge === null) {
    return `${rule.label} (${rule.minAge}+)`;
  }
  return `${rule.label} (${rule.minAge}-${rule.maxAge})`;
}

/**
 * Classify a visitor's age into a configured age group rule ID, or 'unknown'.
 */
export function getVisitorAgeGroupId(age: number | undefined | null, rules: VisitorAgeGroupRule[]): string {
  if (age === undefined || age === null || Number.isNaN(age)) return 'unknown';
  for (const rule of rules) {
    const meetsMin = age >= rule.minAge;
    const meetsMax = rule.maxAge === undefined || rule.maxAge === null || age <= rule.maxAge;
    if (meetsMin && meetsMax) {
      return rule.id;
    }
  }
  return 'unknown';
}

/**
 * Compute start/end YYYY-MM-DD bounds for a date preset.
 * Empty string means unbounded.
 */
export function getVisitorDateRangeBounds(
  preset: VisitorDateRangePreset,
  customSinceDate: string = '',
  referenceDate: Date = new Date()
): { start: string; end: string } {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (preset === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: toDateString(start), end: toDateString(end) };
  }
  if (preset === 'last_3_months') {
    const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    return { start: toDateString(start), end: toDateString(today) };
  }
  if (preset === 'since') {
    return { start: customSinceDate || '', end: '' };
  }
  return { start: '', end: '' };
}

/**
 * Check if a YYYY-MM-DD date falls within [start, end] (inclusive, open-ended when empty).
 */
export function isDateInRange(dateStr: string, start: string, end: string): boolean {
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

/**
 * Check whether a visitor has at least one visit inside the selected range.
 */
export function visitorHasVisitInRange(visitor: Visitor, start: string, end: string): boolean {
  if (!start && !end) return true;
  const visits = visitor.visits || [];
  return visits.some(d => isDateInRange(d, start, end));
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export a filtered list of visitors to a downloadable CSV file.
 */
export function exportVisitorsToCsv(visitors: Visitor[]): void {
  const headers = [
    'Name',
    'First Visit Date',
    'Latest Visit Date',
    'Total Visits',
    'All Visit Dates',
    'Service Attended',
    'Age',
    'Civil Status',
    'Address',
    'Barangay',
    'Contact Number',
    'Invited By',
    'Follow-up Status',
    'Follow-up Note',
    'Notes'
  ];

  const rows = visitors.map(v => [
    v.name,
    getFirstVisitDate(v.visits),
    getLatestVisitDate(v.visits),
    v.visits?.length || 0,
    (v.visits || []).join('; '),
    v.serviceName || '',
    v.age !== undefined && v.age !== null ? v.age : '',
    v.civilStatus || '',
    v.address || '',
    v.barangay || '',
    v.contact || '',
    v.invitedBy || '',
    v.followUpStatus,
    v.followUpNote || '',
    v.notes || ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `visitors-${toDateString(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
