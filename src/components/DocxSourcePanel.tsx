/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
  FilePlus2,
  ShieldCheck
} from 'lucide-react';
import {
  BOX_LABELS,
  DocxUpdateFlags,
  ParsedUploadedDocx
} from '../lib/docxPatcher';
import { formatDate } from '../lib/dateTime';
import { Spinner } from './LoadingIndicator';

export type WordFileSourceMode = 'uploaded' | 'scratch';

interface DocxSourcePanelProps {
  wordFileSource: WordFileSourceMode;
  onChangeSource: (mode: WordFileSourceMode) => void;
  uploadedDocx: ParsedUploadedDocx | null;
  isInspectingDocx: boolean;
  onUploadDocxFile: (file: File) => void;
  updateFlags: DocxUpdateFlags;
  onChangeUpdateFlags: React.Dispatch<React.SetStateAction<DocxUpdateFlags>>;
  targetDate: string;
  hasBulletinForDate: boolean;
  downloadError?: string | null;
  onClearDownloadError?: () => void;
}

const SECTION_TOGGLES: Array<{
  key: keyof DocxUpdateFlags;
  label: string;
  hint?: string;
}> = [
  {
    key: 'seriesTitle',
    label: 'Series title (top of page 1)',
    hint: 'Kept untouched by default'
  },
  {
    key: 'date',
    label: 'Date',
    hint: 'Updates the Sunday date box'
  },
  {
    key: 'verse',
    label: 'Verse of the Week',
    hint: 'Updates verse & reference'
  },
  {
    key: 'pastor',
    label: "Pastor's Heart message",
    hint: 'Welcome & closing stay untouched'
  },
  {
    key: 'events',
    label: 'Upcoming Events',
    hint: 'Updates events list'
  },
  {
    key: 'birthdays',
    label: 'Birthdays',
    hint: 'Kept untouched in same month by default'
  }
];

export const DocxSourcePanel: React.FC<DocxSourcePanelProps> = ({
  wordFileSource,
  onChangeSource,
  uploadedDocx,
  isInspectingDocx,
  onUploadDocxFile,
  updateFlags,
  onChangeUpdateFlags,
  targetDate,
  hasBulletinForDate,
  downloadError,
  onClearDownloadError
}) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onClearDownloadError?.();
      onUploadDocxFile(file);
    }
    e.target.value = '';
  };

  // Determine whether targetDate month matches uploadedDocx.detectedMonth
  const targetMonthNum = useMemo(() => {
    if (!targetDate) return null;
    const parts = targetDate.split('-');
    if (parts.length < 2) return null;
    const m = parseInt(parts[1], 10);
    return isNaN(m) ? null : m;
  }, [targetDate]);

  const isSameMonthAsUploaded = Boolean(
    uploadedDocx?.detectedMonth &&
      targetMonthNum &&
      uploadedDocx.detectedMonth === targetMonthNum
  );

  // Summary line: Updating vs Keeping
  const { updatingLabels, keepingLabels } = useMemo(() => {
    const updating: string[] = ['Lesson text', 'Passage'];
    const keeping: string[] = [];

    const mapLabels: Array<{ key: keyof DocxUpdateFlags; short: string }> = [
      { key: 'seriesTitle', short: 'Series title' },
      { key: 'date', short: 'Date' },
      { key: 'verse', short: 'Verse' },
      { key: 'pastor', short: "Pastor's Heart" },
      { key: 'events', short: 'Upcoming Events' },
      { key: 'birthdays', short: 'Birthdays' }
    ];

    for (const item of mapLabels) {
      if (updateFlags[item.key]) {
        updating.push(item.short);
      } else {
        keeping.push(item.short);
      }
    }
    keeping.push('Welcome & Closing', 'Background & Layout');
    return { updatingLabels: updating, keepingLabels: keeping };
  }, [updateFlags]);

  const missingLabels = useMemo(() => {
    if (!uploadedDocx) return [];
    return uploadedDocx.missingUpdatableBoxes.map(k => BOX_LABELS[k]);
  }, [uploadedDocx]);

  const needsBulletinWarning =
    !hasBulletinForDate &&
    (updateFlags.verse || updateFlags.pastor || updateFlags.events || updateFlags.birthdays);

  const formattedTargetDate = formatDate(targetDate, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-subtle shadow-card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-main flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            <span>Word File</span>
          </h3>
          <p className="text-[11px] text-mut mt-0.5">
            Start from last Sunday&apos;s .docx to keep your exact layout, or build a fresh file from scratch. Processed in browser only — never saved to Firebase.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-subtle/80 border border-subtle self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              onClearDownloadError?.();
              onChangeSource('uploaded');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              wordFileSource === 'uploaded'
                ? 'bg-surface text-accent font-bold shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            Start from last Sunday&apos;s .docx (recommended)
          </button>
          <button
            type="button"
            onClick={() => {
              onClearDownloadError?.();
              onChangeSource('scratch');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              wordFileSource === 'scratch'
                ? 'bg-surface text-accent font-bold shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            Create new from scratch
          </button>
        </div>
      </div>

      {/* Download Error Banner */}
      {downloadError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{downloadError}</span>
          </div>
          {wordFileSource === 'uploaded' && (
            <button
              type="button"
              onClick={() => {
                onClearDownloadError?.();
                onChangeSource('scratch');
              }}
              className="px-3 py-1 rounded-lg bg-surface border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer"
            >
              Create new from scratch instead
            </button>
          )}
        </div>
      )}

      {wordFileSource === 'uploaded' && (
        <div className="space-y-4">
          {/* Upload Row */}
          <div className="p-3.5 rounded-xl bg-canvas border border-subtle flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                uploadedDocx && !uploadedDocx.parseError
                  ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-accent-tint text-accent'
              }`}>
                {uploadedDocx && !uploadedDocx.parseError ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                {uploadedDocx ? (
                  <>
                    <div className="text-xs font-bold text-main truncate">
                      {uploadedDocx.fileName}
                    </div>
                    <div className="text-[11px] text-sec">
                      {uploadedDocx.detectedDateText
                        ? `Detected file date: ${uploadedDocx.detectedDateText}`
                        : 'File loaded in browser memory'}
                      {uploadedDocx.detectedSeriesTitle
                        ? ` • Series: ${uploadedDocx.detectedSeriesTitle}`
                        : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-bold text-main">
                      Upload last Sunday&apos;s .docx file
                    </div>
                    <div className="text-[11px] text-mut">
                      Only the boxes you choose below will be replaced; everything else stays identical.
                    </div>
                  </>
                )}
              </div>
            </div>

            <label className="px-3.5 py-2 rounded-xl bg-accent hover:opacity-95 text-accent-contrast text-xs font-semibold transition-opacity flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0">
              {isInspectingDocx ? (
                <Spinner size="xs" variant="contrast" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>
                {isInspectingDocx
                  ? 'Reading .docx...'
                  : uploadedDocx
                  ? 'Choose Different .docx'
                  : 'Upload Last Sunday .docx'}
              </span>
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                disabled={isInspectingDocx}
                className="hidden"
              />
            </label>
          </div>

          {/* Parse error or missing boxes warning */}
          {uploadedDocx?.parseError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Could not use this .docx file</p>
                  <p className="mt-0.5">{uploadedDocx.parseError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangeSource('scratch')}
                className="px-3 py-1.5 rounded-xl bg-surface border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Create new from scratch</span>
              </button>
            </div>
          )}

          {uploadedDocx && !uploadedDocx.parseError && missingLabels.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-bold">
                    Some text boxes could not be identified in this file:
                  </p>
                  <p className="mt-0.5">
                    Missing: {missingLabels.join(', ')}. You can keep any missing bulletin boxes untouched or create a new file from scratch instead.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangeSource('scratch')}
                className="px-3 py-1.5 rounded-xl bg-surface border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Create new from scratch</span>
              </button>
            </div>
          )}

          {/* What to update this week panel */}
          {uploadedDocx && !uploadedDocx.parseError && (
            <div className="p-4 rounded-xl bg-canvas border border-subtle space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-main">
                  What to update this week
                </h4>
                <span className="text-[11px] text-mut">
                  Welcome &amp; Closing boxes always stay untouched
                </span>
              </div>

              {/* Fixed always-updated rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="px-3 py-2 rounded-xl bg-surface border border-subtle flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-main font-medium">
                    <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Lesson text (Page 1 &amp; Page 2)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
                    Always updated
                  </span>
                </div>

                <div className="px-3 py-2 rounded-xl bg-surface border border-subtle flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-main font-medium">
                    <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Passage line under series title</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
                    Updated
                  </span>
                </div>

                {/* Toggleable sections */}
                {SECTION_TOGGLES.map(item => {
                  const isUpdating = updateFlags[item.key];
                  return (
                    <div
                      key={item.key}
                      className="px-3 py-2 rounded-xl bg-surface border border-subtle flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-main font-medium truncate">{item.label}</div>
                        {item.key === 'birthdays' ? (
                          <div className="text-[10px] text-mut truncate">
                            {isSameMonthAsUploaded
                              ? 'Same month as last Sunday — kept untouched by default'
                              : 'New month detected — updates by default'}
                          </div>
                        ) : item.hint ? (
                          <div className="text-[10px] text-mut truncate">{item.hint}</div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-subtle border border-subtle shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onChangeUpdateFlags(prev => ({ ...prev, [item.key]: true }))
                          }
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                            isUpdating
                              ? 'bg-accent text-accent-contrast shadow-2xs'
                              : 'text-sec hover:text-main'
                          }`}
                        >
                          Update
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeUpdateFlags(prev => ({ ...prev, [item.key]: false }))
                          }
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                            !isUpdating
                              ? 'bg-surface text-main shadow-2xs'
                              : 'text-sec hover:text-main'
                          }`}
                        >
                          Keep untouched
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Optional reminder if downloading from Lesson Maker before Bulletin exists */}
              {needsBulletinWarning && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    No saved bulletin data was found for {formattedTargetDate || 'this Sunday'} yet, so Verse, Pastor&apos;s Heart, Events, and Birthdays from last Sunday&apos;s file will remain unchanged until you fill them in the Bulletin Maker tab (or switch them to Keep untouched).
                  </span>
                </div>
              )}

              {/* Pre-download Clear Summary Line */}
              <div className="p-3 rounded-xl bg-accent-tint/50 border border-accent/20 text-xs text-main flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold">
                    Uploaded file is for {uploadedDocx.detectedDateText || 'previous Sunday'}.
                  </span>{' '}
                  <span>
                    <strong className="text-emerald-700 dark:text-emerald-300">Updating:</strong>{' '}
                    {updatingLabels.join(', ')}.
                  </span>{' '}
                  <span>
                    <strong className="text-sec">Keeping:</strong>{' '}
                    {keepingLabels.join(', ')}.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
