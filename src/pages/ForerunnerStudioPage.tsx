/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Settings as SettingsIcon,
  Upload,
  Camera,
  Trash2,
  ArrowLeft,
  ArrowRight,
  FileText,
  Download,
  Check,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Sparkles,
  Edit2,
  Newspaper,
  Minus
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { ForerunnerLesson, ForerunnerLessonStatus } from '../types';
import { formatDate, toDateString } from '../lib/dateTime';
import { ConfirmModal } from '../components/ConfirmModal';
import { ForerunnerSettingsModal } from '../components/ForerunnerSettingsModal';
import { ForerunnerEditor } from '../components/ForerunnerEditor';
import { ForerunnerPreview } from '../components/ForerunnerPreview';
import { ForerunnerBulletinMaker } from '../components/ForerunnerBulletinMaker';
import { DocxSourcePanel, WordFileSourceMode } from '../components/DocxSourcePanel';
import { formatAndSplitLesson } from '../lib/lessonFormatter';
import { generateForerunnerDocx } from '../lib/docxGenerator';
import {
  DocxUpdateFlags,
  ParsedUploadedDocx,
  inspectUploadedDocx,
  patchUploadedDocx
} from '../lib/docxPatcher';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

interface ForerunnerStudioPageProps {
  onNavigate?: (tab: string) => void;
}

interface PhotoItem {
  id: string;
  url: string;
  file?: File;
  name: string;
}

function getNextSundayDate(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (7 - day) % 7;
  const nextSunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (diff === 0 ? 0 : diff));
  return toDateString(nextSunday);
}

function sanitizeDocxFilename(dateStr: string, passage: string): string {
  const formattedDate = formatDate(dateStr, { month: 'long', day: 'numeric', year: 'numeric' }) || 'Sunday Lesson';
  const cleanPassage = (passage || 'Lesson').replace(/[/\\?%*:|"<>]/g, '_').trim();
  return `${formattedDate} - ${cleanPassage}.docx`;
}

export const ForerunnerStudioPage: React.FC<ForerunnerStudioPageProps> = () => {
  const {
    forerunnerLessons,
    forerunnerSettings,
    forerunnerBulletins,
    forerunnerAsset,
    addForerunnerLesson,
    updateForerunnerLesson,
    deleteForerunnerLesson,
    updateForerunnerSettings,
    resetForerunnerSettings,
    trackBusyOperation,
    dataLoading
  } = useData();

  // Top Tabs: "Lesson Maker" (built now) vs "Bulletin Maker" (placeholder)
  const [activeTab, setActiveTab] = useState<'lessons' | 'bulletin'>('lessons');

  // Format Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Lesson being edited or created; null when on list view
  const [activeLesson, setActiveLesson] = useState<ForerunnerLesson | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Step 1: Details
  const [seriesTitle, setSeriesTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [lessonDate, setLessonDate] = useState(getNextSundayDate());

  // Step 2: Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Step 3: Editor & Formatting
  const [contentHtml, setContentHtml] = useState('<p></p>');
  const [fontSizeOverride, setFontSizeOverride] = useState<number | undefined>(undefined);
  const [manualLineOffset, setManualLineOffset] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'both' | 'editor' | 'preview'>('both');

  // Delete modal
  const [lessonToDelete, setLessonToDelete] = useState<ForerunnerLesson | null>(null);
  const [savingMode, setSavingMode] = useState<ForerunnerLessonStatus | null>(null);
  const isSaving = savingMode !== null;
  const [isDownloading, setIsDownloading] = useState(false);

  // "Keep series title" switch (ON by default)
  const [keepSeriesTitle, setKeepSeriesTitle] = useState<boolean>(true);

  // Shared browser-only "Start from last Sunday's .docx" vs "Create new from scratch" state
  const [wordFileSource, setWordFileSource] = useState<WordFileSourceMode>('uploaded');
  const [uploadedDocx, setUploadedDocx] = useState<ParsedUploadedDocx | null>(null);
  const [isInspectingDocx, setIsInspectingDocx] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [bulletinSelectedDate, setBulletinSelectedDate] = useState<string>(getNextSundayDate());
  const [updateFlags, setUpdateFlags] = useState<DocxUpdateFlags>({
    seriesTitle: false, // Keep untouched by default
    date: true,
    verse: true,
    pastor: true,
    events: true,
    birthdays: true
  });

  // Determine the active target date based on the active studio tab
  const activeTargetDate = activeTab === 'bulletin' ? bulletinSelectedDate : lessonDate;

  // Auto-default Birthdays toggle: Keep untouched in same month as uploaded file, Update in new month
  useEffect(() => {
    if (!uploadedDocx || !uploadedDocx.detectedMonth || !activeTargetDate) return;
    const monthPart = parseInt(activeTargetDate.split('-')[1] || '', 10);
    if (!isNaN(monthPart)) {
      const isSameMonth = monthPart === uploadedDocx.detectedMonth;
      setUpdateFlags(prev => ({
        ...prev,
        birthdays: !isSameMonth
      }));
    }
  }, [uploadedDocx, activeTargetDate]);

  // Upload & inspect previous Sunday's .docx in browser memory only
  const handleUploadDocxFile = async (file: File) => {
    setIsInspectingDocx(true);
    setDownloadError(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await inspectUploadedDocx(file.name, buf);
      setUploadedDocx(parsed);
    } catch (err: any) {
      setDownloadError(err?.message || 'Could not read the uploaded .docx file.');
    } finally {
      setIsInspectingDocx(false);
    }
  };

  // Reset or pre-fill form when creating new lesson
  const startNewLesson = () => {
    setIsCreatingNew(true);
    setActiveLesson(null);
    setSeriesTitle(forerunnerSettings.lastUsedSeriesTitle || '');
    setKeepSeriesTitle(true);
    setPassage('');
    setLessonDate(getNextSundayDate());
    setPhotos([]);
    setContentHtml('<p></p>');
    setFontSizeOverride(undefined);
    setManualLineOffset(0);
    setTranscribeError(null);
    setDownloadError(null);
  };

  // Open existing lesson for editing
  const openLesson = (lesson: ForerunnerLesson) => {
    setActiveLesson(lesson);
    setIsCreatingNew(false);
    setSeriesTitle(lesson.seriesTitle || forerunnerSettings.lastUsedSeriesTitle || '');
    setKeepSeriesTitle(true);
    setPassage(lesson.passage || '');
    setLessonDate(lesson.lessonDate || getNextSundayDate());
    setPhotos([]); // photos are not stored permanently
    setContentHtml(lesson.contentHtml || '<p></p>');
    setFontSizeOverride(lesson.fontSize);
    setManualLineOffset(lesson.page1BreakIndex ? lesson.page1BreakIndex - 56 : 0);
    setTranscribeError(null);
    setDownloadError(null);
  };

  const closeLessonView = () => {
    setActiveLesson(null);
    setIsCreatingNew(false);
    setPhotos([]);
  };

  // Compute 1.5-page split and font fitting
  const splitResult = useMemo(() => {
    return formatAndSplitLesson(
      contentHtml,
      forerunnerSettings,
      fontSizeOverride,
      manualLineOffset
    );
  }, [contentHtml, forerunnerSettings, fontSizeOverride, manualLineOffset]);

  // Handle Photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotos: PhotoItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      newPhotos.push({
        id: 'p_' + Math.random().toString(36).substring(2, 9),
        url,
        file,
        name: file.name
      });
    }
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const movePhoto = (index: number, direction: 'left' | 'right') => {
    const newIdx = direction === 'left' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= photos.length) return;
    const copy = [...photos];
    const [moved] = copy.splice(index, 1);
    copy.splice(newIdx, 0, moved);
    setPhotos(copy);
  };

  // AI Transcription via Gemini API (Paused - Coming soon)
  const handleReadHandwriting = async () => {
    return; // Paused: nothing calls the Gemini API from this page
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
      setTranscribeError('Available only in the AI Studio version');
      return;
    }
    if (photos.length === 0) return;

    setIsTranscribing(true);
    setTranscribeError(null);

    try {
      await trackBusyOperation(async () => {
        // Convert photos to base64 data URLs
        const base64Images: string[] = [];
        for (const item of photos) {
          if (item.file) {
            const b64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(item.file!);
            });
            base64Images.push(b64);
          } else if (item.url.startsWith('data:')) {
            base64Images.push(item.url);
          }
        }

        const res = await fetch('/api/transcribe-handwriting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: base64Images,
            seriesTitle,
            passage
          })
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
          throw new Error('Available only in the AI Studio version');
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to transcribe handwriting from Gemini API.');
        }

        if (data.html) {
          setContentHtml(data.html);
        }
      });
    } catch (err: any) {
      console.error('Handwriting transcription failed:', err);
      setTranscribeError(err?.message || 'Handwriting transcription failed. Your photos and text are preserved so you can retry.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Save Lesson (Draft or Done)
  const handleSaveLesson = async (status: ForerunnerLessonStatus) => {
    setSavingMode(status);
    try {
      const lessonData = {
        seriesTitle: seriesTitle.trim(),
        passage: passage.trim(),
        lessonDate,
        status,
        contentHtml,
        fontSize: splitResult.optimalFontSize,
        blankLineSize: splitResult.blankLineSize,
        page1BreakIndex: splitResult.breakLineIndex
      };

      if (activeLesson) {
        await updateForerunnerLesson(activeLesson.id, lessonData);
        setActiveLesson({
          ...activeLesson,
          ...lessonData,
          updatedAt: new Date().toISOString()
        });
      } else {
        const newId = await addForerunnerLesson(lessonData);
        setActiveLesson({
          ...lessonData,
          id: newId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        setIsCreatingNew(false);
      }
    } catch (err) {
      console.error('Failed to save lesson', err);
    } finally {
      setSavingMode(null);
    }
  };

  // Download Word (.docx) file
  const handleDownloadDocx = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await trackBusyOperation(async () => {
        const matchingBulletin = forerunnerBulletins.find(
          b => b.id === lessonDate || b.bulletinDate === lessonDate
        ) || null;

        let blob: Blob;

        if (wordFileSource === 'uploaded') {
          if (!uploadedDocx) {
            setDownloadError('Please upload last Sunday\'s .docx file first, or switch to "Create new from scratch".');
            return;
          }
          if (uploadedDocx.parseError) {
            setDownloadError(uploadedDocx.parseError);
            return;
          }

          blob = await patchUploadedDocx({
            uploadedArrayBuffer: uploadedDocx.arrayBuffer,
            updateFlags,
            seriesTitle: seriesTitle.trim() || uploadedDocx.detectedSeriesTitle || 'SUNDAY SCHOOL LESSON',
            passage: passage.trim() || 'Scripture Passage',
            lessonDate,
            page1Paragraphs: splitResult.page1Paragraphs,
            page2Paragraphs: splitResult.page2Paragraphs,
            fontSize: splitResult.optimalFontSize,
            blankLineSize: splitResult.blankLineSize,
            settings: forerunnerSettings,
            bulletin: matchingBulletin
          });
        } else {
          blob = await generateForerunnerDocx({
            seriesTitle: seriesTitle.trim() || 'SUNDAY SCHOOL LESSON',
            passage: passage.trim() || 'Scripture Passage',
            page1Paragraphs: splitResult.page1Paragraphs,
            page2Paragraphs: splitResult.page2Paragraphs,
            fontSize: splitResult.optimalFontSize,
            blankLineSize: splitResult.blankLineSize,
            settings: forerunnerSettings,
            bulletin: matchingBulletin,
            backgroundImageData: forerunnerAsset?.imageData || null
          });
        }

        const filename = sanitizeDocxFilename(lessonDate, passage);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    } catch (err: any) {
      console.error('Failed to generate docx', err);
      setDownloadError(err?.message || 'Failed to generate Word (.docx) file.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 motion-page-enter">
      {/* Header and Studio Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent flex items-center justify-center shadow-xs">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main">
              Forerunner Studio
            </h1>
            <p className="text-xs sm:text-sm text-sec">
              Handwriting-to-text lesson maker and 1.5-page Word (.docx) publisher
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-subtle/80 border border-subtle self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('lessons')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'lessons'
                ? 'bg-surface text-accent font-bold shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Lesson Maker</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulletin')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bulletin'
                ? 'bg-surface text-accent font-bold shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            <span>Bulletin Maker</span>
          </button>
        </div>
      </div>

      {dataLoading.forerunner ? (
        <PageLoading />
      ) : (
        <>
      {/* ================= TAB 2: BULLETIN MAKER ================= */}
      {activeTab === 'bulletin' && (
        <ForerunnerBulletinMaker
          onOpenFormatSettings={() => setIsSettingsOpen(true)}
          wordFileSource={wordFileSource}
          onChangeWordFileSource={setWordFileSource}
          uploadedDocx={uploadedDocx}
          isInspectingDocx={isInspectingDocx}
          onUploadDocxFile={handleUploadDocxFile}
          updateFlags={updateFlags}
          onChangeUpdateFlags={setUpdateFlags}
          downloadError={downloadError}
          onSetDownloadError={setDownloadError}
          onClearDownloadError={() => setDownloadError(null)}
          onSelectedDateChange={setBulletinSelectedDate}
        />
      )}

      {/* ================= TAB 1: LESSON MAKER ================= */}
      {activeTab === 'lessons' && (
        <>
          {/* VIEW A: LIST OF LESSONS (When not editing or creating) */}
          {!activeLesson && !isCreatingNew && (
            <div className="space-y-5">
              {/* Action Bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <button
                  type="button"
                  onClick={startNewLesson}
                  className="px-4 py-2 rounded-xl bg-accent hover:opacity-95 text-accent-contrast text-xs sm:text-sm font-semibold transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-accent-contrast stroke-[2.5]" />
                  <span>New Lesson</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec hover:text-main text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <SettingsIcon className="w-4 h-4 text-accent" />
                  <span>Format Settings</span>
                </button>
              </div>

              {/* Lessons Grid */}
              {forerunnerLessons.length === 0 ? (
                <div className="p-12 sm:p-16 text-center rounded-2xl border-2 border-dashed border-subtle bg-surface/50 max-w-lg mx-auto my-6 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent flex items-center justify-center mx-auto shadow-2xs">
                    <BookOpen className="w-7 h-7 text-accent" />
                  </div>
                  <h3 className="text-base font-bold text-main">
                    No lessons created yet
                  </h3>
                  <p className="text-xs text-sec max-w-sm mx-auto">
                    Click "New Lesson" to upload handwritten notes, transcribe with Gemini AI, and export a ready-to-print 1.5-page Word document.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 motion-list-enter">
                  {forerunnerLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      onClick={() => openLesson(lesson)}
                      className="rounded-2xl border border-subtle bg-surface hover:border-accent/40 shadow-card hover:shadow-md p-5 motion-card flex flex-col justify-between gap-3 cursor-pointer group text-main"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            lesson.status === 'done'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}>
                            {lesson.status === 'done' ? 'Done' : 'Draft'}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLessonToDelete(lesson);
                            }}
                            className="p-1.5 rounded-lg text-mut hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Delete lesson"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div>
                          <h3 className="font-bold text-base text-main group-hover:text-accent transition-colors line-clamp-1">
                            {lesson.passage || 'Untitled Passage'}
                          </h3>
                          {lesson.seriesTitle && (
                            <p className="text-xs text-sec line-clamp-1 mt-0.5">
                              {lesson.seriesTitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-subtle flex items-center justify-between text-xs text-mut">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(lesson.lessonDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <span className="font-semibold text-accent group-hover:underline text-[11px]">
                          Open Lesson →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW B: NEW / EDIT LESSON WORKBENCH */}
          {(activeLesson || isCreatingNew) && (
            <div className="space-y-6">
              {/* Back and Status Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-subtle shadow-card">
                <button
                  type="button"
                  onClick={closeLessonView}
                  className="px-3 py-1.5 rounded-xl border border-subtle hover:bg-subtle text-sec hover:text-main text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Lessons</span>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* View Mode Toggle */}
                  <div className="hidden lg:flex items-center gap-1 p-1 bg-subtle rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setViewMode('both')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        viewMode === 'both' ? 'bg-surface font-bold text-accent shadow-2xs' : 'text-sec'
                      }`}
                    >
                      Side by Side
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('editor')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        viewMode === 'editor' ? 'bg-surface font-bold text-accent shadow-2xs' : 'text-sec'
                      }`}
                    >
                      Editor Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        viewMode === 'preview' ? 'bg-surface font-bold text-accent shadow-2xs' : 'text-sec'
                      }`}
                    >
                      Preview Only
                    </button>
                  </div>

                  {/* Save Draft */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveLesson('draft')}
                    className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingMode === 'draft' && <Spinner size="xs" variant="accent" />}
                    <span>{savingMode === 'draft' ? 'Saving...' : 'Save Draft'}</span>
                  </button>

                  {/* Mark Done */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveLesson('done')}
                    className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-95 text-accent-contrast text-xs font-semibold shadow-2xs transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingMode === 'done' ? (
                      <>
                        <Spinner size="xs" variant="contrast" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-accent-contrast" />
                        <span>Mark as Done</span>
                      </>
                    )}
                  </button>

                  {/* Download Word */}
                  <button
                    type="button"
                    disabled={isDownloading}
                    onClick={handleDownloadDocx}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <>
                        <Spinner size="xs" variant="contrast" />
                        <span>Preparing file...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 text-white" />
                        <span>Download Word (.docx)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Word File Source & What to Update Panel */}
              <DocxSourcePanel
                wordFileSource={wordFileSource}
                onChangeSource={setWordFileSource}
                uploadedDocx={uploadedDocx}
                isInspectingDocx={isInspectingDocx}
                onUploadDocxFile={handleUploadDocxFile}
                updateFlags={updateFlags}
                onChangeUpdateFlags={setUpdateFlags}
                targetDate={lessonDate}
                hasBulletinForDate={Boolean(
                  forerunnerBulletins.find(b => b.id === lessonDate || b.bulletinDate === lessonDate)
                )}
                downloadError={downloadError}
                onClearDownloadError={() => setDownloadError(null)}
              />

              {/* STEP 1: Details */}
              <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-subtle shadow-card space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-accent-tint text-accent text-xs font-bold flex items-center justify-center">1</span>
                  <h3 className="font-bold text-sm text-main uppercase tracking-wider">Lesson Details</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-sec font-medium">
                        Series Title (centered at top of Page 1)
                      </label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={keepSeriesTitle}
                        onClick={() => {
                          const next = !keepSeriesTitle;
                          setKeepSeriesTitle(next);
                          if (next && !seriesTitle.trim() && forerunnerSettings.lastUsedSeriesTitle) {
                            setSeriesTitle(forerunnerSettings.lastUsedSeriesTitle);
                          }
                        }}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-sec hover:text-main cursor-pointer"
                      >
                        <span
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                            keepSeriesTitle ? 'bg-accent' : 'bg-subtle border border-subtle'
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              keepSeriesTitle ? 'translate-x-3.5' : 'translate-x-0.5'
                            }`}
                          />
                        </span>
                        <span>Keep series title</span>
                      </button>
                    </div>
                    {keepSeriesTitle && seriesTitle.trim() ? (
                      <div className="w-full px-3 py-2 rounded-xl border border-subtle bg-subtle/40 text-main flex items-center justify-between gap-2">
                        <span className="font-semibold uppercase truncate">{seriesTitle}</span>
                        <button
                          type="button"
                          onClick={() => setKeepSeriesTitle(false)}
                          className="text-[11px] text-accent font-semibold hover:underline shrink-0 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.target.value)}
                        placeholder='e.g. THE BOOK OF REVELATION "THE REVELATION OF JESUS CHRIST"'
                        className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main focus:ring-1 focus:ring-accent uppercase"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sec font-medium mb-1">
                      Passage Reference
                    </label>
                    <input
                      type="text"
                      value={passage}
                      onChange={(e) => setPassage(e.target.value)}
                      placeholder="e.g. Revelation 20:1-6"
                      className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-sec font-medium mb-1">
                      Sunday Lesson Date
                    </label>
                    <input
                      type="date"
                      value={lessonDate}
                      onChange={(e) => setLessonDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-3 pt-4 text-mut text-[11px]">
                    <span>The passage and date will also be used by the Sunday Bulletin generator.</span>
                  </div>
                </div>
              </div>

              {/* STEP 2: Handwriting Reading (Paused - Coming Soon) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-surface/70 border border-subtle shadow-card space-y-3 opacity-80">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-subtle text-mut text-xs font-bold flex items-center justify-center">2</span>
                    <h3 className="font-bold text-sm text-main uppercase tracking-wider">Handwriting reading - Coming soon</h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 rounded-xl border border-subtle bg-subtle text-mut font-semibold text-xs flex items-center gap-2 cursor-not-allowed opacity-60"
                  >
                    <Upload className="w-4 h-4 text-mut" />
                    <span>Upload Photos</span>
                  </button>

                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 rounded-xl bg-subtle text-mut font-semibold text-xs border border-subtle flex items-center gap-2 cursor-not-allowed opacity-60"
                  >
                    <Sparkles className="w-4 h-4 text-mut" />
                    <span>Read Handwriting</span>
                  </button>
                </div>

                {/* Uploaded Photos Thumbnails */}
                {photos.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[11px] text-mut mb-2">
                      Circled numbers at the top of pages order the transcription. You can also reorder manually:
                    </div>
                    <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                      {photos.map((item, idx) => (
                        <div
                          key={item.id}
                          className="relative group w-24 h-28 rounded-xl border border-subtle bg-black/10 overflow-hidden flex flex-col justify-between shrink-0 shadow-xs"
                        >
                          <img src={item.url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                            #{idx + 1}
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => movePhoto(idx, 'left')}
                                className="p-1 rounded bg-white text-black hover:bg-zinc-200 cursor-pointer"
                                title="Move left"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removePhoto(item.id)}
                              className="p-1 rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                              title="Remove photo"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            {idx < photos.length - 1 && (
                              <button
                                type="button"
                                onClick={() => movePhoto(idx, 'right')}
                                className="p-1 rounded bg-white text-black hover:bg-zinc-200 cursor-pointer"
                                title="Move right"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcription Error Banner */}
                {transcribeError && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold">Handwriting transcription encountered an issue:</p>
                      <p className="mt-0.5">{transcribeError}</p>
                      <p className="mt-1 text-[11px] opacity-85">
                        Your uploaded photos and any typed text are safely preserved on screen. You can retry clicking "Read Handwriting".
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 3: Review and Edit & Preview */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-subtle shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-accent-tint text-accent text-xs font-bold flex items-center justify-center">3</span>
                    <h3 className="font-bold text-sm text-main uppercase tracking-wider">Review, Edit & 1.5-Page Layout</h3>
                  </div>

                  {/* Font Size & Box Fitting Controls */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-sec font-medium">Font Size:</span>
                    <div className="flex items-center gap-1 bg-subtle px-2 py-1 rounded-lg border border-subtle font-bold text-main">
                      <span>{splitResult.optimalFontSize} pt</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFontSizeOverride(Math.max(12, splitResult.optimalFontSize - 0.5))}
                        className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer"
                        title="Decrease font size (-0.5pt, min 12pt)"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontSizeOverride(splitResult.optimalFontSize + 0.5)}
                        className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer"
                        title="Increase font size (+0.5pt)"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {fontSizeOverride && (
                        <button
                          type="button"
                          onClick={() => setFontSizeOverride(undefined)}
                          className="text-[10px] text-accent font-semibold hover:underline ml-1 cursor-pointer"
                          title="Reset to auto-calculated largest fitting size"
                        >
                          Auto
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Split Warning Banner if lesson still overflows at 12pt */}
                {splitResult.isOverflowing && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-bold">Text overflows 1.5 page limit by approximately {splitResult.overflowLines} lines</p>
                      <p className="mt-0.5 text-[11px]">
                        The font size is set to the minimum allowed (12pt) and blank lines are compressed. You can shorten wordings slightly or adjust line breaks before downloading.
                      </p>
                    </div>
                  </div>
                )}

                {/* Editor and Preview Grid */}
                <div className={`grid gap-6 ${viewMode === 'both' ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
                  {/* Editor Column */}
                  {(viewMode === 'both' || viewMode === 'editor') && (
                    <div className={viewMode === 'both' ? 'lg:col-span-6' : 'w-full'}>
                      <ForerunnerEditor
                        contentHtml={contentHtml}
                        onChange={setContentHtml}
                        photos={photos}
                        settings={forerunnerSettings}
                      />
                    </div>
                  )}

                  {/* Preview Column */}
                  {(viewMode === 'both' || viewMode === 'preview') && (
                    <div className={viewMode === 'both' ? 'lg:col-span-6' : 'w-full'}>
                      <ForerunnerPreview
                        seriesTitle={seriesTitle}
                        passage={passage}
                        page1Paragraphs={splitResult.page1Paragraphs}
                        page2Paragraphs={splitResult.page2Paragraphs}
                        fontSize={splitResult.optimalFontSize}
                        blankLineSize={splitResult.blankLineSize}
                        settings={forerunnerSettings}
                        isOverflowing={splitResult.isOverflowing}
                        overflowLines={splitResult.overflowLines}
                        breakLineIndex={splitResult.breakLineIndex}
                        onMoveBreakUp={() => setManualLineOffset(prev => prev - 1)}
                        onMoveBreakDown={() => setManualLineOffset(prev => prev + 1)}
                        bulletin={forerunnerBulletins.find(b => b.id === lessonDate || b.bulletinDate === lessonDate) || null}
                        backgroundImageUrl={forerunnerAsset?.imageData || null}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* Format Settings Modal */}
      {isSettingsOpen && (
        <ForerunnerSettingsModal
          isOpen={isSettingsOpen}
          settings={forerunnerSettings}
          onClose={() => setIsSettingsOpen(false)}
          onSave={updateForerunnerSettings}
          onReset={resetForerunnerSettings}
        />
      )}

      {/* Delete Lesson Confirmation Modal */}
      {lessonToDelete && (
        <ConfirmModal
          isOpen={!!lessonToDelete}
          title="Delete Lesson"
          message={`Are you sure you want to delete the lesson for "${lessonToDelete.passage || 'Untitled'}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={async () => {
            if (lessonToDelete) {
              await deleteForerunnerLesson(lessonToDelete.id);
              setLessonToDelete(null);
            }
          }}
          onCancel={() => setLessonToDelete(null)}
        />
      )}
    </div>
  );
};
