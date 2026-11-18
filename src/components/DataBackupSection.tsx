import React, { useEffect, useState } from 'react';
import {
  Database,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Clock,
  X,
  FileJson,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Spinner } from './LoadingIndicator';
import {
  BackupExportResult,
  exportFullChurchBackup,
  formatBackupDateTime,
  getLastBackupTimestamp,
} from '../lib/backupExport';

export const DataBackupSection: React.FC = () => {
  const { settings, trackBusyOperation } = useData();
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => getLastBackupTimestamp());
  const [backupResult, setBackupResult] = useState<BackupExportResult | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    if (!summaryOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSummaryOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [summaryOpen]);

  const handleDownloadBackup = async () => {
    if (isExportingBackup) return;
    setIsExportingBackup(true);
    setBackupError(null);

    try {
      const result = await trackBusyOperation(() =>
        exportFullChurchBackup(settings.churchName)
      );
      setBackupResult(result);
      setLastBackupAt(result.backupDateIso);
      setSummaryOpen(true);
    } catch (err: any) {
      setBackupError(err?.message || 'Could not create backup file. Please try again.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  return (
    <>
      {/* Data Management & Backup */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-main flex items-center gap-2">
            <Database className="w-4 h-4 text-accent" />
            <span>Data Management & Backup</span>
          </h2>
          {backupResult && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 motion-notice-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Backup file downloaded</span>
            </span>
          )}
        </div>

        <p className="text-xs text-sec leading-relaxed max-w-2xl">
          Export a complete offline JSON backup of everything the app stores—members, ministries outline, regular services and activities, service overrides, calendar events, event templates, categories, schedules, roster assignments, church settings, tasks, task categories, quick notes, message templates, sent reminders, visitors, visitor settings, Forerunner lessons/settings/assets/bulletins, viewer access settings, and viewer notes.
        </p>

        {/* Last backup on this device */}
        <div className="flex items-center gap-2 text-xs text-sec">
          <Clock className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>
            <strong>Last backup:</strong>{' '}
            {lastBackupAt ? formatBackupDateTime(lastBackupAt) : 'Not backed up yet on this device'}
          </span>
        </div>

        {/* Privacy Warning */}
        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>
            This file contains personal information (contact numbers, visitors, the viewer passcode). Keep it private.
          </span>
        </div>

        {backupError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{backupError}</span>
          </div>
        )}

        {backupResult && backupResult.skippedCollections.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Some collections could not be read and were skipped:</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
              {backupResult.skippedCollections.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong> ({item.id}): {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isExportingBackup}
            onClick={handleDownloadBackup}
            className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold text-xs shadow-xs transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isExportingBackup ? (
              <>
                <Spinner size="xs" variant="contrast" />
                <span>Preparing backup...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download backup</span>
              </>
            )}
          </button>

          {backupResult && !summaryOpen && (
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-xs font-semibold text-sec hover:text-main transition-colors cursor-pointer"
            >
              View summary
            </button>
          )}
        </div>
      </div>

      {/* Backup Summary Popup */}
      {summaryOpen && backupResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSummaryOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface border border-subtle shadow-xl text-main overflow-hidden motion-popup-in flex flex-col max-h-[88vh]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-summary-title"
          >
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <FileJson className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 id="backup-summary-title" className="text-base font-bold text-main truncate">
                    Backup Summary
                  </h3>
                  <p className="text-[11px] text-mut truncate">
                    {backupResult.fileName} · {backupResult.backupDateReadable}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-surface-hover transition-colors cursor-pointer"
                aria-label="Close summary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {backupResult.skippedCollections.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Created backup for the remaining collections. Skipped ({backupResult.skippedCollections.length}):
                    </span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {backupResult.skippedCollections.map((item) => (
                      <li key={item.id}>
                        <strong>{item.label}</strong> ({item.id})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-sec">
                <span>
                  Included <strong>{backupResult.summaryItems.filter((i) => !i.skipped).length}</strong> data groups
                </span>
                <span className="font-semibold text-main tabular-nums">
                  {backupResult.totalItems} total {backupResult.totalItems === 1 ? 'record' : 'records'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {backupResult.summaryItems.map((item) => (
                  <div
                    key={item.key}
                    className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      item.skipped
                        ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300'
                        : 'border-subtle bg-subtle/40 text-main'
                    }`}
                  >
                    <span className="truncate font-medium text-sec">{item.label}</span>
                    <span className="font-bold tabular-nums shrink-0">
                      {item.skipped ? 'Skipped' : item.count}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-mut leading-relaxed">
                This file contains personal information (contact numbers, visitors, the viewer passcode). Keep it private.
              </p>
            </div>

            <div className="px-5 py-3.5 border-t border-subtle bg-subtle/20 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
