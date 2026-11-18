import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { toDateString } from './dateTime';
import {
  getBackupCollectionSpecs,
  getExcludedCollectionSpecs,
} from './backupRegistry';

export const LAST_BACKUP_STORAGE_KEY = 'lbbc_last_backup_at';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const TIMESTAMP_FIELD_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'sentAt',
  'exportedAt',
  'snoozedUntil',
]);

export interface BackupSummaryItem {
  key: string;
  label: string;
  count: number;
  skipped?: boolean;
}

export interface SkippedBackupCollection {
  id: string;
  label: string;
  reason: string;
}

export interface BackupExportResult {
  fileName: string;
  backupDateReadable: string;
  backupDateIso: string;
  totalItems: number;
  summaryItems: BackupSummaryItem[];
  skippedCollections: SkippedBackupCollection[];
}

export function getLastBackupTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
    if (!raw) return null;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function recordLastBackupTimestamp(isoString: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_BACKUP_STORAGE_KEY, isoString);
  } catch {
    // Ignore private browsing or storage quota errors
  }
}

export function isLastBackupOlderThanDays(days = 30): boolean {
  const lastIso = getLastBackupTimestamp();
  if (!lastIso) return false;
  const lastMs = Date.parse(lastIso);
  if (!Number.isFinite(lastMs)) return false;
  const thresholdMs = days === 30 ? THIRTY_DAYS_MS : days * 24 * 60 * 60 * 1000;
  return Date.now() - lastMs > thresholdMs;
}

export function formatBackupDateTime(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (Number.isNaN(d.getTime())) return String(dateOrIso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatReadableFullTimestamp(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function isFirestoreTimestampLike(val: unknown): val is { toDate?: () => Date; seconds?: number; nanoseconds?: number } {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.toDate === 'function') return true;
  if (
    typeof obj.seconds === 'number' &&
    typeof obj.nanoseconds === 'number' &&
    Object.keys(obj).every((k) => k === 'seconds' || k === 'nanoseconds')
  ) {
    return true;
  }
  return false;
}

export function normalizeBackupValue(val: unknown, fieldKey?: string): unknown {
  if (val === null || val === undefined) return val;

  if (val instanceof Date) {
    return val.toISOString();
  }

  if (isFirestoreTimestampLike(val)) {
    const d = typeof val.toDate === 'function'
      ? val.toDate()
      : new Date((val.seconds || 0) * 1000);
    return Number.isNaN(d.getTime()) ? val : d.toISOString();
  }

  if (
    typeof val === 'number' &&
    fieldKey &&
    TIMESTAMP_FIELD_NAMES.has(fieldKey) &&
    val > 1_000_000_000_000 &&
    val < 9_999_999_999_999
  ) {
    return new Date(val).toISOString();
  }

  if (Array.isArray(val)) {
    return val.map((item) => normalizeBackupValue(item));
  }

  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = normalizeBackupValue(v, k);
      }
    }
    return out;
  }

  return val;
}

export async function exportFullChurchBackup(churchName?: string): Promise<BackupExportResult> {
  const backupSpecs = getBackupCollectionSpecs();
  const excludedSpecs = getExcludedCollectionSpecs();

  const collections: Record<string, Record<string, unknown>[]> = {};
  const skippedCollections: SkippedBackupCollection[] = [];
  const summaryItems: BackupSummaryItem[] = [];
  let totalItems = 0;

  for (const spec of backupSpecs) {
    try {
      const snap = await getDocs(collection(db, spec.id));
      const docs = snap.docs.map((d) =>
        normalizeBackupValue({ id: d.id, ...d.data() }) as Record<string, unknown>
      );
      collections[spec.id] = docs;
      totalItems += docs.length;

      if (spec.id === 'events') {
        const calendarEventsCount = docs.filter((item) => !item.isTemplate).length;
        const eventTemplatesCount = docs.filter((item) => Boolean(item.isTemplate)).length;
        summaryItems.push({
          key: 'events',
          label: 'Calendar Events',
          count: calendarEventsCount,
        });
        summaryItems.push({
          key: 'event_templates',
          label: 'Event Templates',
          count: eventTemplatesCount,
        });
      } else {
        summaryItems.push({
          key: spec.id,
          label: spec.label,
          count: docs.length,
        });
      }
    } catch (err: any) {
      const reason = err?.code
        ? `[${err.code}] ${err?.message || 'Could not read collection'}`
        : (err?.message || 'Could not read collection');
      skippedCollections.push({
        id: spec.id,
        label: spec.label,
        reason,
      });
      summaryItems.push({
        key: spec.id,
        label: spec.label,
        count: 0,
        skipped: true,
      });
    }
  }

  const now = new Date();
  const dateStr = toDateString(now);
  const backupDateReadable = formatReadableFullTimestamp(now);
  const backupDateIso = now.toISOString();

  const summaryMap: Record<string, number> = {};
  for (const item of summaryItems) {
    if (!item.skipped) {
      summaryMap[item.key] = item.count;
    }
  }

  const backupPayload = {
    appName: 'Church Secretary Companion',
    appVersion: '1.0.0',
    churchName: churchName || 'Our Church',
    backupDate: backupDateReadable,
    backupDateIso,
    backupDateLocal: dateStr,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    includedCollections: Object.keys(collections),
    excludedCollections: excludedSpecs.map((s) => s.id),
    skippedCollections,
    summary: summaryMap,
    collections,
  };

  const fileName = `church-backup-${dateStr}.json`;
  const jsonString = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = objectUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  recordLastBackupTimestamp(backupDateIso);

  return {
    fileName,
    backupDateReadable: formatBackupDateTime(now),
    backupDateIso,
    totalItems,
    summaryItems,
    skippedCollections,
  };
}
