/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  Calendar,
  Sparkles,
  Download,
  Check,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Edit2,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Image as ImageIcon,
  BookOpen,
  HelpCircle,
  X,
  RefreshCw
} from 'lucide-react';
import { Spinner } from './LoadingIndicator';
import { useData } from '../context/DataContext';
import {
  ForerunnerBulletin,
  ForerunnerBulletinStatus,
  BulletinEventEntry,
  BirthdayCelebratorEntry
} from '../types';
import { formatDate, toDateString } from '../lib/dateTime';
import {
  formatSundayBulletinDate,
  fetchKjvVersesForPassage,
  computeUpcomingEvents,
  computeBirthdayCelebrators,
  processBackgroundImageFile,
  calcPastorMessageLayout,
  countWords,
  getWordTargetRange,
  stripHtmlToPlainText,
  parsePastorStyleSamples,
  KjvVerseItem
} from '../lib/bulletinHelpers';
import { BulletinPage2Overlay } from './BulletinPage2Overlay';
import { DocxSourcePanel, WordFileSourceMode } from './DocxSourcePanel';
import { generateForerunnerDocx } from '../lib/docxGenerator';
import { formatAndSplitLesson } from '../lib/lessonFormatter';
import {
  DocxUpdateFlags,
  ParsedUploadedDocx,
  patchUploadedDocx
} from '../lib/docxPatcher';

interface ForerunnerBulletinMakerProps {
  onOpenFormatSettings: () => void;
  wordFileSource: WordFileSourceMode;
  onChangeWordFileSource: (mode: WordFileSourceMode) => void;
  uploadedDocx: ParsedUploadedDocx | null;
  isInspectingDocx: boolean;
  onUploadDocxFile: (file: File) => void;
  updateFlags: DocxUpdateFlags;
  onChangeUpdateFlags: React.Dispatch<React.SetStateAction<DocxUpdateFlags>>;
  downloadError: string | null;
  onSetDownloadError: (msg: string | null) => void;
  onClearDownloadError: () => void;
  onSelectedDateChange?: (dateStr: string) => void;
}

function getNextSundayDate(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (7 - day) % 7;
  const nextSunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (diff === 0 ? 0 : diff));
  return toDateString(nextSunday);
}

export const ForerunnerBulletinMaker: React.FC<ForerunnerBulletinMakerProps> = ({
  onOpenFormatSettings,
  wordFileSource,
  onChangeWordFileSource,
  uploadedDocx,
  isInspectingDocx,
  onUploadDocxFile,
  updateFlags,
  onChangeUpdateFlags,
  downloadError,
  onSetDownloadError,
  onClearDownloadError,
  onSelectedDateChange
}) => {
  const {
    forerunnerBulletins,
    forerunnerAsset,
    forerunnerLessons,
    forerunnerSettings,
    events,
    people,
    saveForerunnerAsset,
    saveForerunnerBulletin,
    deleteForerunnerBulletin,
    trackBusyOperation
  } = useData();

  // Initial Sunday Date: Most recent lesson date or next Sunday
  const initialSunday = useMemo(() => {
    if (forerunnerLessons.length > 0 && forerunnerLessons[0].lessonDate) {
      return forerunnerLessons[0].lessonDate;
    }
    return getNextSundayDate();
  }, [forerunnerLessons]);

  const [selectedDate, setSelectedDate] = useState<string>(initialSunday);

  // Active bulletin state for selected date
  const [status, setStatus] = useState<ForerunnerBulletinStatus>('draft');
  const [customDateText, setCustomDateText] = useState<string>('');
  const [passageInput, setPassageInput] = useState<string>('');
  const [availableVerses, setAvailableVerses] = useState<KjvVerseItem[]>([]);
  const [selectedVerseRef, setSelectedVerseRef] = useState<string>('');
  const [selectedVerseText, setSelectedVerseText] = useState<string>('');
  const [pastorHeartText, setPastorHeartText] = useState<string>('');
  const [upcomingEvents, setUpcomingEvents] = useState<BulletinEventEntry[]>([]);
  const [birthdayCelebrators, setBirthdayCelebrators] = useState<BirthdayCelebratorEntry[]>([]);

  // UI state
  const [savingAction, setSavingAction] = useState<'draft' | 'done' | 'autofill' | null>(null);
  const isSaving = savingAction !== null;
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingVerses, setIsLoadingVerses] = useState(false);
  const [verseError, setVerseError] = useState<string | null>(null);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);

  // Modal edit states for clicking preview boxes
  const [activeEditBox, setActiveEditBox] = useState<'date' | 'verse' | 'pastor' | 'events' | 'birthdays' | null>(null);

  // Pastor's Heart AI writing state (draft-only until user clicks Save Draft / Mark as Done)
  const [topicHint, setTopicHint] = useState<string>('');
  const [lessonMainPoint, setLessonMainPoint] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasAiResult, setHasAiResult] = useState<boolean>(false);
  const [showAiDraftNote, setShowAiDraftNote] = useState<boolean>(false);
  const [previousPastorText, setPreviousPastorText] = useState<string | null>(null);
  const [pendingAiDraft, setPendingAiDraft] = useState<string | null>(null);

  // Selected YYYY-MM key and saved birthday list for the same month
  const selectedMonthKey = useMemo(() => (selectedDate || '').slice(0, 7), [selectedDate]);
  const sameMonthSavedBulletin = useMemo(() => {
    if (!selectedMonthKey || selectedMonthKey.length < 7) return null;
    const matches = forerunnerBulletins.filter(
      b =>
        (b.bulletinDate || b.id || '').startsWith(selectedMonthKey) &&
        Array.isArray(b.birthdayCelebrators) &&
        b.birthdayCelebrators.length > 0
    );
    if (matches.length === 0) return null;
    return [...matches].sort((a, b) =>
      (b.bulletinDate || b.id).localeCompare(a.bulletinDate || a.id)
    )[0];
  }, [forerunnerBulletins, selectedMonthKey]);

  const [keepMonthBirthdays, setKeepMonthBirthdays] = useState<boolean>(
    Boolean(sameMonthSavedBulletin)
  );

  // Sync selected date back to parent studio page
  useEffect(() => {
    onSelectedDateChange?.(selectedDate);
  }, [selectedDate, onSelectedDateChange]);

  // Reset "Keep this month's saved list" default when switching to a different month
  useEffect(() => {
    setKeepMonthBirthdays(Boolean(sameMonthSavedBulletin));
  }, [selectedMonthKey]); // intentionally only when month changes

  // Find matching lesson for this Sunday if available
  const matchingLesson = useMemo(() => {
    return forerunnerLessons.find(l => l.lessonDate === selectedDate) || null;
  }, [forerunnerLessons, selectedDate]);

  // Load existing bulletin for selected date, or initialize defaults
  useEffect(() => {
    const existing = forerunnerBulletins.find(b => b.id === selectedDate || b.bulletinDate === selectedDate);
    if (existing) {
      setStatus(existing.status || 'draft');
      setCustomDateText(existing.customDateText || '');
      setSelectedVerseRef(existing.verseReference || '');
      setSelectedVerseText(existing.verseText || '');
      setPastorHeartText(existing.pastorHeartText || '');
      setUpcomingEvents(existing.upcomingEvents || []);
      if (
        (!existing.birthdayCelebrators || existing.birthdayCelebrators.length === 0) &&
        keepMonthBirthdays &&
        sameMonthSavedBulletin
      ) {
        setBirthdayCelebrators(sameMonthSavedBulletin.birthdayCelebrators);
      } else {
        setBirthdayCelebrators(existing.birthdayCelebrators || []);
      }
      setPassageInput(matchingLesson?.passage || '');
    } else {
      // New Sunday bulletin: default empty state (reusing month's saved birthdays if Keep is ON)
      setStatus('draft');
      setCustomDateText(formatSundayBulletinDate(selectedDate));
      setSelectedVerseRef('');
      setSelectedVerseText('');
      setPastorHeartText('');
      setUpcomingEvents([]);
      setBirthdayCelebrators(
        keepMonthBirthdays && sameMonthSavedBulletin
          ? sameMonthSavedBulletin.birthdayCelebrators
          : []
      );
      setPassageInput(matchingLesson?.passage || '');
    }
    // Clear transient AI confirmation/undo/error state when changing Sundays
    setPendingAiDraft(null);
    setPreviousPastorText(null);
    setShowAiDraftNote(false);
    setHasAiResult(false);
    setAiError(null);
  }, [selectedDate, forerunnerBulletins, matchingLesson, keepMonthBirthdays, sameMonthSavedBulletin]);

  // Handle uploading background picture
  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBg(true);
    setBgUploadError(null);
    try {
      const processed = await processBackgroundImageFile(file);
      await saveForerunnerAsset({
        type: processed.type,
        imageData: processed.imageData,
        width: processed.width,
        height: processed.height
      });
    } catch (err: any) {
      console.error('Failed to upload background picture', err);
      setBgUploadError(err?.message || 'Failed to process background image file.');
    } finally {
      setIsUploadingBg(false);
      e.target.value = '';
    }
  };

  // Helper to load pre-uploaded background asset
  const handleLoadSampleBackground = async () => {
    setIsUploadingBg(true);
    setBgUploadError(null);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}assets/aistudio/Forerunner-bulletin-background_015a5393.jpg`);
      if (!resp.ok) throw new Error('Could not find sample background asset.');
      const blob = await resp.blob();
      const file = new File([blob], 'Forerunner-bulletin-background.jpg', { type: 'image/jpeg' });
      const processed = await processBackgroundImageFile(file);
      await saveForerunnerAsset({
        type: processed.type,
        imageData: processed.imageData,
        width: processed.width,
        height: processed.height
      });
    } catch (err: any) {
      console.error('Failed to load sample background', err);
      setBgUploadError(err?.message || 'Could not load sample background.');
    } finally {
      setIsUploadingBg(false);
    }
  };

  // Auto-Fill This Week button (Date, Verse, Upcoming Events, Birthdays)
  const handleAutoFill = async () => {
    setSavingAction('autofill');
    setVerseError(null);
    try {
      // 1. Date
      const dateStr = formatSundayBulletinDate(selectedDate);
      setCustomDateText(dateStr);

      // 2. Upcoming Events from Calendar (one-time only, on or after Sunday)
      const evs = computeUpcomingEvents(events, selectedDate);
      setUpcomingEvents(evs);

      // 3. Birthday Celebrators for this month (reuse saved month list if Keep is ON and non-empty)
      if (keepMonthBirthdays && sameMonthSavedBulletin && sameMonthSavedBulletin.birthdayCelebrators.length > 0) {
        setBirthdayCelebrators(sameMonthSavedBulletin.birthdayCelebrators);
      } else {
        const bdays = computeBirthdayCelebrators(people, selectedDate);
        setBirthdayCelebrators(bdays);
      }

      // 4. Verse of the Week: derived from lesson passage or typed passage
      const targetPassage = (matchingLesson?.passage || passageInput || '').trim();
      if (targetPassage) {
        try {
          setIsLoadingVerses(true);
          const verses = await fetchKjvVersesForPassage(targetPassage);
          setAvailableVerses(verses);
          if (verses.length > 0) {
            // Default to the LAST verse of the passage
            const lastVerse = verses[verses.length - 1];
            setSelectedVerseRef(lastVerse.reference);
            setSelectedVerseText(lastVerse.text);
          }
        } catch (vErr: any) {
          console.warn('Could not auto-fetch KJV verses', vErr);
          setVerseError(vErr?.message || 'Could not fetch KJV verse. You can type a passage and search.');
        } finally {
          setIsLoadingVerses(false);
        }
      }
    } finally {
      setSavingAction(null);
    }
  };

  // Fetch KJV verses for passage manually
  const handleFetchVerses = async () => {
    if (!passageInput.trim()) return;
    setIsLoadingVerses(true);
    setVerseError(null);
    try {
      const verses = await fetchKjvVersesForPassage(passageInput.trim());
      setAvailableVerses(verses);
      if (verses.length > 0) {
        // Default to the last verse
        const lastVerse = verses[verses.length - 1];
        setSelectedVerseRef(lastVerse.reference);
        setSelectedVerseText(lastVerse.text);
      }
    } catch (err: any) {
      setVerseError(err?.message || 'Failed to fetch KJV verses.');
    } finally {
      setIsLoadingVerses(false);
    }
  };

  // Save current bulletin state (Draft or Done)
  const handleSaveBulletin = async (newStatus: ForerunnerBulletinStatus) => {
    setSavingAction(newStatus);
    try {
      const bulletinData: ForerunnerBulletin = {
        id: selectedDate,
        bulletinDate: selectedDate,
        status: newStatus,
        customDateText: customDateText.trim() || formatSundayBulletinDate(selectedDate),
        verseReference: selectedVerseRef.trim(),
        verseText: selectedVerseText.trim(),
        pastorHeartText: pastorHeartText.trim(),
        upcomingEvents,
        birthdayCelebrators,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveForerunnerBulletin(bulletinData);
      setStatus(newStatus);
    } catch (err) {
      console.error('Failed to save bulletin', err);
    } finally {
      setSavingAction(null);
    }
  };

  // Word (.docx) export for this Sunday
  const handleDownloadDocx = async () => {
    setIsDownloading(true);
    onClearDownloadError();
    try {
      await trackBusyOperation(async () => {
      // Calculate lesson paragraphs for left box if lesson exists
      let p1Paras: any[] = [];
      let p2Paras: any[] = [];
      let lessonFont = 13;
      let lessonBlankLine = 10;
      let sTitle = forerunnerSettings.lastUsedSeriesTitle || 'SUNDAY SCHOOL LESSON';
      let pass = matchingLesson?.passage || passageInput.trim() || 'Passage Reference';

      if (matchingLesson) {
        sTitle = matchingLesson.seriesTitle || sTitle;
        pass = matchingLesson.passage || pass;
        const split = formatAndSplitLesson(
          matchingLesson.contentHtml,
          forerunnerSettings,
          matchingLesson.fontSize,
          matchingLesson.page1BreakIndex ? matchingLesson.page1BreakIndex - 56 : 0
        );
        p1Paras = split.page1Paragraphs;
        p2Paras = split.page2Paragraphs;
        lessonFont = split.optimalFontSize;
        lessonBlankLine = split.blankLineSize;
      } else {
        p1Paras = [{ runs: [{ text: 'Sunday School Lesson' }] }];
        p2Paras = [{ runs: [{ text: 'Lesson continues here.' }] }];
      }

      const activeBulletin: ForerunnerBulletin = {
        id: selectedDate,
        bulletinDate: selectedDate,
        status,
        customDateText: customDateText.trim() || formatSundayBulletinDate(selectedDate),
        verseReference: selectedVerseRef.trim(),
        verseText: selectedVerseText.trim(),
        pastorHeartText: pastorHeartText.trim(),
        upcomingEvents,
        birthdayCelebrators,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      let blob: Blob;

      if (wordFileSource === 'uploaded') {
        if (!uploadedDocx) {
          onSetDownloadError('Please upload last Sunday\'s .docx file first, or switch to "Create new from scratch".');
          return;
        }
        if (uploadedDocx.parseError) {
          onSetDownloadError(uploadedDocx.parseError);
          return;
        }
        blob = await patchUploadedDocx({
          uploadedArrayBuffer: uploadedDocx.arrayBuffer,
          updateFlags,
          seriesTitle: sTitle,
          passage: pass,
          lessonDate: selectedDate,
          page1Paragraphs: p1Paras,
          page2Paragraphs: p2Paras,
          fontSize: lessonFont,
          blankLineSize: lessonBlankLine,
          settings: forerunnerSettings,
          bulletin: activeBulletin
        });
      } else {
        blob = await generateForerunnerDocx({
          seriesTitle: sTitle,
          passage: pass,
          page1Paragraphs: p1Paras,
          page2Paragraphs: p2Paras,
          fontSize: lessonFont,
          blankLineSize: lessonBlankLine,
          settings: forerunnerSettings,
          bulletin: activeBulletin,
          backgroundImageData: forerunnerAsset?.imageData || null
        });
      }

      const formattedDate = formatDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' }) || 'Sunday';
      const cleanPassage = pass.replace(/[/\\?%*:|"<>]/g, '_').trim();
      const filename = `${formattedDate} - ${cleanPassage}.docx`;

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
      console.error('Failed to export Word file', err);
      onSetDownloadError(err?.message || 'Failed to generate Word (.docx) file.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Stripped plain text of the matching lesson (if one exists for selectedDate)
  const lessonPlainText = useMemo(() => {
    if (!matchingLesson?.contentHtml) return '';
    return stripHtmlToPlainText(matchingLesson.contentHtml);
  }, [matchingLesson]);

  const hasLessonSource = Boolean(matchingLesson && lessonPlainText.trim().length > 0);

  // Target words & acceptable range from Format Settings (default 117, range 105-125)
  const wordTargetRange = useMemo(
    () => getWordTargetRange(forerunnerSettings.pastorTargetWords),
    [forerunnerSettings.pastorTargetWords]
  );

  // Live word count for Pastor's Heart
  const pastorWordCount = useMemo(() => countWords(pastorHeartText), [pastorHeartText]);
  const isWordCountOutOfRange =
    pastorWordCount > 0 &&
    (pastorWordCount < wordTargetRange.min || pastorWordCount > wordTargetRange.max);

  // Live auto-fit layout & overflow check for Pastor's Heart message
  const pastorLayoutInfo = useMemo(() => {
    return calcPastorMessageLayout(
      pastorHeartText,
      forerunnerSettings.bulletinPositions?.pastor?.w,
      forerunnerSettings.bulletinPositions?.pastor?.h
    );
  }, [pastorHeartText, forerunnerSettings.bulletinPositions]);

  // Call Gemini backend to draft From the Pastor's Heart
  const handleGeneratePastorHeart = async () => {
    setAiError(null);
    setPendingAiDraft(null);

    if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
      setAiError('Available only in the AI Studio version');
      return;
    }

    const sourceText = hasLessonSource ? lessonPlainText : lessonMainPoint.trim();
    if (!sourceText) {
      setAiError("Please write a sentence or two in \"Lesson's main point\" first.");
      return;
    }

    setIsGeneratingAi(true);
    try {
      await trackBusyOperation(async () => {
        const styleSamples = parsePastorStyleSamples(forerunnerSettings.pastorStyleSamples, 4);
        const res = await fetch('/api/generate-pastor-heart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passage: matchingLesson?.passage || passageInput.trim() || '',
            lessonText: sourceText,
            isMainPointFallback: !hasLessonSource,
            topicHint: topicHint.trim(),
            styleSamples,
            targetWords: wordTargetRange.target
          })
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
          throw new Error('Available only in the AI Studio version');
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data?.error || 'Could not generate a draft right now. Your existing message was kept safe.'
          );
        }

        const generatedText = typeof data?.text === 'string' ? data.text.trim() : '';
        if (!generatedText) {
          throw new Error('The AI returned an empty draft. Your existing message was kept safe.');
        }

        setHasAiResult(true);
        if (pastorHeartText.trim().length > 0) {
          setPendingAiDraft(generatedText);
        } else {
          setPreviousPastorText('');
          setPastorHeartText(generatedText);
          setShowAiDraftNote(true);
        }
      });
    } catch (err: any) {
      setAiError(
        err?.message || 'Could not generate a draft right now. Your existing message was kept safe.'
      );
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Current active bulletin object for live preview
  const liveBulletinObj: ForerunnerBulletin = useMemo(() => ({
    id: selectedDate,
    bulletinDate: selectedDate,
    status,
    customDateText: customDateText.trim() || formatSundayBulletinDate(selectedDate),
    verseReference: selectedVerseRef,
    verseText: selectedVerseText,
    pastorHeartText,
    upcomingEvents,
    birthdayCelebrators,
    createdAt: '',
    updatedAt: ''
  }), [selectedDate, status, customDateText, selectedVerseRef, selectedVerseText, pastorHeartText, upcomingEvents, birthdayCelebrators]);

  return (
    <div className="space-y-6">
      {/* Top Controls & Sunday Date Picker */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-subtle shadow-card flex flex-wrap items-center justify-between gap-4">
        {/* Sunday Date & Matching Lesson Badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            <label className="text-xs font-bold uppercase tracking-wider text-main">
              Sunday Date:
            </label>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-subtle bg-field text-main font-semibold text-xs focus:ring-1 focus:ring-accent"
          />

          {matchingLesson ? (
            <span className="px-2.5 py-1 rounded-lg bg-accent-tint text-accent text-xs font-semibold flex items-center gap-1.5 border border-accent/20">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Lesson: {matchingLesson.passage || 'Saved'}</span>
            </span>
          ) : (
            <span className="text-xs text-mut italic">
              (No lesson for this Sunday yet)
            </span>
          )}
        </div>

        {/* Action Buttons: Auto-fill, Save Draft, Done, Download */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={isSaving}
            className="px-3.5 py-1.5 rounded-xl bg-accent hover:opacity-95 text-accent-contrast text-xs font-semibold shadow-xs transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Auto-fill Date, Verse, Upcoming Events, and Birthdays"
          >
            {savingAction === 'autofill' ? (
              <>
                <Spinner size="xs" variant="contrast" />
                <span>Filling...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-fill this week</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSaveBulletin('draft')}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {savingAction === 'draft' && <Spinner size="xs" variant="accent" />}
            <span>{savingAction === 'draft' ? 'Saving...' : 'Save Draft'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveBulletin('done')}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {savingAction === 'done' ? (
              <>
                <Spinner size="xs" variant="contrast" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Mark as Done</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={isDownloading}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
        onChangeSource={onChangeWordFileSource}
        uploadedDocx={uploadedDocx}
        isInspectingDocx={isInspectingDocx}
        onUploadDocxFile={onUploadDocxFile}
        updateFlags={updateFlags}
        onChangeUpdateFlags={onChangeUpdateFlags}
        targetDate={selectedDate}
        hasBulletinForDate={true}
        downloadError={downloadError}
        onClearDownloadError={onClearDownloadError}
      />

      {/* Background Picture Management Section */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-subtle shadow-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-tint text-accent flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-main">
                Background Picture (Page 2, 13" × 8.5")
              </h3>
              <p className="text-[11px] text-mut">
                {forerunnerAsset
                  ? 'Active background image loaded. It will be printed behind the bulletin text boxes in Word.'
                  : 'No background picture saved yet. Upload your 2860 × 1870 JPEG (13" × 8.5") or load the sample image.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="px-3 py-1.5 rounded-xl bg-accent-tint text-accent hover:opacity-90 font-semibold text-xs transition-opacity flex items-center gap-1.5 cursor-pointer border border-accent/20">
              <Upload className="w-3.5 h-3.5" />
              <span>{forerunnerAsset ? 'Replace Image' : 'Upload Image'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleUploadBg}
                disabled={isUploadingBg}
                className="hidden"
              />
            </label>

            {!forerunnerAsset && (
              <button
                type="button"
                onClick={handleLoadSampleBackground}
                disabled={isUploadingBg}
                className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main text-xs font-semibold transition-colors cursor-pointer"
              >
                Use Sample Background
              </button>
            )}

            <button
              type="button"
              onClick={onOpenFormatSettings}
              className="text-xs text-accent hover:underline font-semibold ml-2 cursor-pointer"
            >
              Nudge Box Positions →
            </button>
          </div>
        </div>

        {bgUploadError && (
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{bgUploadError}</span>
          </div>
        )}
      </div>

      {/* Scaled Page 2 Live Preview with Interactive Edit Overlays */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-subtle shadow-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-main flex items-center gap-1.5">
              <span>Page 2 Live Preview (13" × 8.5" Landscape)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                status === 'done'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
              }`}>
                {status === 'done' ? 'Done' : 'Draft'}
              </span>
            </h3>
            <p className="text-[11px] text-mut">
              Click any of the 5 text boxes to open its edit window. All 5 are real movable text boxes in the exported Word file.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveEditBox('date')}
              className="px-2.5 py-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main text-[11px] font-semibold cursor-pointer"
            >
              1. Date
            </button>
            <button
              type="button"
              onClick={() => setActiveEditBox('verse')}
              className="px-2.5 py-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main text-[11px] font-semibold cursor-pointer"
            >
              2. Verse
            </button>
            <button
              type="button"
              onClick={() => setActiveEditBox('pastor')}
              className="px-2.5 py-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main text-[11px] font-semibold cursor-pointer"
            >
              3. Pastor
            </button>
            <button
              type="button"
              onClick={() => setActiveEditBox('events')}
              className="px-2.5 py-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main text-[11px] font-semibold cursor-pointer"
            >
              4. Events
            </button>
            <button
              type="button"
              onClick={() => setActiveEditBox('birthdays')}
              className="px-2.5 py-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main text-[11px] font-semibold cursor-pointer"
            >
              5. Birthdays
            </button>
          </div>
        </div>

        {/* Scaled Page 2 Canvas Container */}
        <div
          data-no-motion="true"
          className="w-full flex justify-center py-4 px-2 bg-zinc-200/60 dark:bg-zinc-950/60 rounded-2xl border border-subtle overflow-hidden"
        >
          <div
            className="aspect-[13/8.5] bg-white text-black shadow-2xl border border-zinc-400 rounded-sm relative flex select-none overflow-hidden max-w-full"
            style={{ width: '840px' }}
          >
            {forerunnerAsset?.imageData ? (
              <>
                <BulletinPage2Overlay
                  bulletin={liveBulletinObj}
                  backgroundImageUrl={forerunnerAsset.imageData}
                  settings={forerunnerSettings}
                  scale={1.4}
                  onBoxClick={(boxKey) => setActiveEditBox(boxKey)}
                  interactive={true}
                />

                {/* Left Half: Lesson Box overlay */}
                <div
                  className={`absolute p-2.5 overflow-hidden flex flex-col justify-start bg-transparent ${
                    forerunnerSettings.border !== false ? 'border border-black' : ''
                  }`}
                  style={{
                    left: `${(0.12 / 13) * 100}%`,
                    top: `${(0.12 / 8.5) * 100}%`,
                    width: `${(6.19 / 13) * 100}%`,
                    height: `${(8.14 / 8.5) * 100}%`,
                    fontSize: '11px',
                    lineHeight: 1.18,
                    zIndex: 10
                  }}
                >
                  <div className="space-y-1 overflow-hidden flex-1 opacity-90">
                    <p className="font-bold underline text-center text-xs">
                      {matchingLesson?.seriesTitle || 'SUNDAY SCHOOL LESSON'}
                    </p>
                    <p className="text-center text-[10px] text-zinc-700">
                      {matchingLesson?.passage || 'Passage Reference'} (Continued from Page 1)
                    </p>
                    <div className="pt-2 text-justify text-[10px] text-zinc-600 line-clamp-12">
                      {matchingLesson ? (
                        <span>Lesson content will print in this left box.</span>
                      ) : (
                        <span className="italic">
                          No lesson created for this Sunday yet. Create a lesson in Lesson Maker to preview continuation here.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
                <ImageIcon className="w-8 h-8 text-zinc-400" />
                <p className="font-bold text-sm text-zinc-700">No Background Picture Uploaded</p>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Please upload your 2860 × 1870 JPEG background or click "Use Sample Background" above to enable live Page 2 preview and Word export.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= EDIT MODAL 1: SUNDAY DATE ================= */}
      {activeEditBox === 'date' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="relative w-full max-w-md bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-main">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <h3 className="font-bold text-sm text-main uppercase tracking-wider">
                1. Edit Sunday Date Text
              </h3>
              <button
                type="button"
                onClick={() => setActiveEditBox(null)}
                className="p-1 rounded-lg text-sec hover:text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-sec font-medium mb-1">
                  Custom Date Display Text (Franklin Gothic Medium 14pt white bold)
                </label>
                <input
                  type="text"
                  value={customDateText}
                  onChange={(e) => setCustomDateText(e.target.value)}
                  placeholder="e.g. November 08, 2026"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main font-semibold text-sm focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCustomDateText(formatSundayBulletinDate(selectedDate))}
                  className="text-xs text-accent hover:underline font-semibold cursor-pointer"
                >
                  Reset to {formatSundayBulletinDate(selectedDate)}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveEditBox(null)}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-contrast font-semibold shadow-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT MODAL 2: VERSE OF THE WEEK (KJV ONLY) ================= */}
      {activeEditBox === 'verse' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="relative w-full max-w-lg bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-main max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <div>
                <h3 className="font-bold text-sm text-main uppercase tracking-wider">
                  2. Verse of the Week (KJV Only)
                </h3>
                <p className="text-[11px] text-mut">
                  Chosen ONLY from the lesson's passage using the King James Version.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveEditBox(null)}
                className="p-1 rounded-lg text-sec hover:text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Passage Reference Input */}
              <div>
                <label className="block text-sec font-medium mb-1">
                  Lesson Passage Reference
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={passageInput}
                    onChange={(e) => setPassageInput(e.target.value)}
                    placeholder="e.g. Revelation 20:1-6"
                    className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-field text-main font-semibold focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={handleFetchVerses}
                    disabled={isLoadingVerses || !passageInput.trim()}
                    className="px-3 py-2 rounded-xl bg-accent-tint text-accent hover:opacity-90 font-semibold border border-accent/20 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingVerses ? 'Fetching...' : 'Load KJV Verses'}
                  </button>
                </div>
              </div>

              {verseError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{verseError}</span>
                </div>
              )}

              {/* Verses Dropdown Selection */}
              {availableVerses.length > 0 && (
                <div>
                  <label className="block text-sec font-medium mb-1">
                    Select Verse (Default: Last Verse)
                  </label>
                  <select
                    value={selectedVerseRef}
                    onChange={(e) => {
                      const ref = e.target.value;
                      setSelectedVerseRef(ref);
                      const found = availableVerses.find(v => v.reference === ref);
                      if (found) setSelectedVerseText(found.text);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                  >
                    {availableVerses.map(v => (
                      <option key={v.reference} value={v.reference}>
                        {v.reference}: {v.text.substring(0, 75)}...
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Verse Preview / Manual Edit */}
              <div className="space-y-2">
                <label className="block text-sec font-medium">Selected KJV Verse Text</label>
                <textarea
                  rows={3}
                  value={selectedVerseText}
                  onChange={(e) => setSelectedVerseText(e.target.value)}
                  placeholder="KJV verse text..."
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-mut">
                  Font: Mongolian Baiti ~11pt (centered, with quotation marks and bold reference).
                </span>
                <button
                  type="button"
                  onClick={() => setActiveEditBox(null)}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-contrast font-semibold shadow-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT MODAL 3: FROM THE PASTOR'S HEART ================= */}
      {activeEditBox === 'pastor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="relative w-full max-w-lg bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-main max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <div>
                <h3 className="font-bold text-sm text-main uppercase tracking-wider">
                  3. From the Pastor's Heart Message
                </h3>
                <p className="text-[11px] text-mut">
                  Body only: Franklin Gothic Book (justified, ~0.3" paragraph indent, auto-fit 8pt-12pt)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveEditBox(null)}
                className="p-1 rounded-lg text-sec hover:text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Source indicator or fallback Lesson's main point input */}
              {hasLessonSource ? (
                <div className="px-3 py-2 rounded-xl bg-accent-tint/50 border border-accent/20 text-[11px] text-main flex items-center justify-between gap-2">
                  <span>
                    Source lesson: <strong>{matchingLesson?.passage || 'Saved lesson'}</strong>
                  </span>
                  <span className="text-mut">Formatting stripped for AI</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block text-sec font-medium" htmlFor="lesson-main-point">
                    Lesson&apos;s main point (a sentence or two)
                  </label>
                  <textarea
                    id="lesson-main-point"
                    rows={2}
                    value={lessonMainPoint}
                    onChange={(e) => setLessonMainPoint(e.target.value)}
                    placeholder="No lesson saved for this Sunday yet. Briefly type the lesson's main point..."
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}

              {/* Optional Topic Hint */}
              <div className="space-y-1">
                <label className="block text-sec font-medium" htmlFor="pastor-topic-hint">
                  Topic hint (optional)
                </label>
                <input
                  id="pastor-topic-hint"
                  type="text"
                  value={topicHint}
                  onChange={(e) => setTopicHint(e.target.value)}
                  placeholder="Optional: a few words to steer the topic (e.g. faithfulness in small things)"
                  className="w-full px-3 py-1.5 rounded-xl border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Word counter and AI buttons */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-bold text-xs ${
                      isWordCountOutOfRange
                        ? 'text-red-600 dark:text-red-400'
                        : pastorWordCount >= wordTargetRange.min && pastorWordCount <= wordTargetRange.max
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-main'
                    }`}
                  >
                    Word count: {pastorWordCount} / {wordTargetRange.target}
                  </span>
                  <span
                    className={`text-[11px] ${
                      isWordCountOutOfRange
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : 'text-sec'
                    }`}
                  >
                    (Range: {wordTargetRange.min}–{wordTargetRange.max})
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {previousPastorText !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setPastorHeartText(previousPastorText);
                        setPreviousPastorText(null);
                        setPendingAiDraft(null);
                        setShowAiDraftNote(false);
                      }}
                      disabled={isGeneratingAi}
                      className="px-2.5 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main font-semibold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Restore previous text before AI edit"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Undo</span>
                    </button>
                  )}

                  {hasAiResult && (
                    <button
                      type="button"
                      onClick={handleGeneratePastorHeart}
                      disabled={isGeneratingAi}
                      className="px-2.5 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isGeneratingAi ? (
                        <>
                          <Spinner size="xs" variant="accent" />
                          <span>Writing...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>Regenerate</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleGeneratePastorHeart}
                    disabled={isGeneratingAi}
                    className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-95 text-accent-contrast font-semibold shadow-2xs transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isGeneratingAi ? (
                      <Spinner size="xs" variant="contrast" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isGeneratingAi ? 'Writing...' : 'Write with AI'}</span>
                  </button>
                </div>
              </div>

              {/* Plain AI Error Banner */}
              {aiError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Replace Existing Message Confirmation */}
              {pendingAiDraft !== null && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-100 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    Replace the current message?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingAiDraft(null)}
                      className="px-3 py-1 rounded-lg border border-subtle bg-surface text-sec hover:text-main font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviousPastorText(pastorHeartText);
                        setPastorHeartText(pendingAiDraft);
                        setPendingAiDraft(null);
                        setShowAiDraftNote(true);
                      }}
                      className="px-3 py-1 rounded-lg bg-accent text-accent-contrast font-semibold shadow-2xs cursor-pointer"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              )}

              {/* Overflow warning banner */}
              {pastorLayoutInfo.overflows && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Text exceeds available space</span>
                    <span>Approximately {pastorLayoutInfo.maxWords} words maximum fit at 8pt. Please shorten slightly to prevent overflow.</span>
                  </div>
                </div>
              )}

              {/* Text Area */}
              <div className="space-y-1.5">
                <textarea
                  rows={8}
                  value={pastorHeartText}
                  onChange={(e) => setPastorHeartText(e.target.value)}
                  placeholder="Type the message for From the Pastor's Heart here..."
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main leading-relaxed focus:ring-1 focus:ring-accent"
                />
                {showAiDraftNote && (
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    AI draft - please read before printing.
                  </p>
                )}
              </div>

              {/* Permanent Header & Signature Elements */}
              <div className="p-3 rounded-xl bg-subtle/50 border border-subtle space-y-1 text-[11px]">
                <div className="font-semibold text-main">Permanent Layout Elements:</div>
                <div className="text-sec">
                  • Header: <span className="font-serif italic font-medium">Welcome!</span> (Times New Roman 22pt italic)
                </div>
                <div className="text-sec">
                  • Closing: <span className="font-semibold italic">Have a wonderful Lord's Day!</span> (Franklin Gothic Medium 10pt bold italic)
                </div>
                <div className="text-sec">
                  • Signature: <span className="font-bold italic">Ptr. Claus P. Esden</span> • <span className="italic">Pastor of LBBC Ministries</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveEditBox(null)}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-contrast font-semibold shadow-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT MODAL 4: UPCOMING EVENTS ================= */}
      {activeEditBox === 'events' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="relative w-full max-w-lg bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-main max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <div>
                <h3 className="font-bold text-sm text-main uppercase tracking-wider">
                  4. Upcoming Events (Max 3 Entries)
                </h3>
                <p className="text-[11px] text-mut">
                  Only one-time calendar events on or after {formatSundayBulletinDate(selectedDate)}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveEditBox(null)}
                className="p-1 rounded-lg text-sec hover:text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sec">
                  {upcomingEvents.filter(e => !e.hidden).length} / 3 slots filled
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const evs = computeUpcomingEvents(events, selectedDate);
                    setUpcomingEvents(evs);
                  }}
                  className="text-xs text-accent hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh from Calendar</span>
                </button>
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="p-6 text-center text-mut border border-dashed border-subtle rounded-xl">
                  No upcoming calendar events found on or after this Sunday.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingEvents.map((ev, idx) => (
                    <div
                      key={ev.id || idx}
                      className={`p-3 rounded-xl border border-subtle ${
                        ev.hidden ? 'opacity-40 bg-subtle/30' : 'bg-surface'
                      } space-y-2`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-main">Entry #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const copy = [...upcomingEvents];
                            copy[idx] = { ...copy[idx], hidden: !copy[idx].hidden };
                            setUpcomingEvents(copy);
                          }}
                          className="px-2 py-1 rounded text-[11px] font-semibold text-sec hover:text-main flex items-center gap-1 cursor-pointer"
                        >
                          {ev.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          <span>{ev.hidden ? 'Show' : 'Hide'}</span>
                        </button>
                      </div>

                      <div>
                        <label className="block text-sec font-medium mb-0.5">Event Title</label>
                        <input
                          type="text"
                          value={ev.title}
                          onChange={(e) => {
                            const copy = [...upcomingEvents];
                            copy[idx] = { ...copy[idx], title: e.target.value };
                            setUpcomingEvents(copy);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main font-semibold"
                        />
                      </div>

                      {!ev.isGrouped ? (
                        <div>
                          <label className="block text-sec font-medium mb-0.5">Date Line</label>
                          <input
                            type="text"
                            value={ev.dateStr || ''}
                            onChange={(e) => {
                              const copy = [...upcomingEvents];
                              copy[idx] = { ...copy[idx], dateStr: e.target.value };
                              setUpcomingEvents(copy);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="block text-sec font-medium mb-0.5">Grouped Dates</label>
                          {ev.subLines?.map((sub, sIdx) => (
                            <div key={sIdx} className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={`${sub.dateStr} (${sub.weekdayStr})`}
                                onChange={(e) => {
                                  const copy = [...upcomingEvents];
                                  if (copy[idx].subLines) {
                                    copy[idx].subLines![sIdx].dateStr = e.target.value;
                                  }
                                  setUpcomingEvents(copy);
                                }}
                                className="px-2 py-1 rounded border border-subtle bg-field text-main"
                              />
                              <input
                                type="text"
                                value={sub.location || ''}
                                placeholder="Location..."
                                onChange={(e) => {
                                  const copy = [...upcomingEvents];
                                  if (copy[idx].subLines) {
                                    copy[idx].subLines![sIdx].location = e.target.value;
                                  }
                                  setUpcomingEvents(copy);
                                }}
                                className="px-2 py-1 rounded border border-subtle bg-field text-main"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveEditBox(null)}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-contrast font-semibold shadow-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT MODAL 5: BIRTHDAY CELEBRATORS ================= */}
      {activeEditBox === 'birthdays' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="relative w-full max-w-xl bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-main max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <div>
                <h3 className="font-bold text-sm text-main uppercase tracking-wider">
                  5. Birthday Celebrators
                </h3>
                <p className="text-[11px] text-mut">
                  Celebrators for {formatDate(selectedDate, { month: 'long', year: 'numeric' })}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveEditBox(null)}
                className="p-1 rounded-lg text-sec hover:text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Keep this month's saved list switch */}
              <div className="p-3 rounded-xl bg-canvas border border-subtle flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-main">Keep this month&apos;s saved list</div>
                  <div className="text-[11px] text-mut">
                    {sameMonthSavedBulletin
                      ? 'Reuses your saved birthday list for this month across Sundays until turned off or refreshed.'
                      : 'Turn on once this month has a saved list to reuse it across Sundays.'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={keepMonthBirthdays}
                  onClick={() => {
                    const next = !keepMonthBirthdays;
                    setKeepMonthBirthdays(next);
                    if (next && sameMonthSavedBulletin) {
                      setBirthdayCelebrators(sameMonthSavedBulletin.birthdayCelebrators);
                    }
                  }}
                  className="shrink-0 cursor-pointer"
                >
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      keepMonthBirthdays ? 'bg-accent' : 'bg-subtle border border-subtle'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        keepMonthBirthdays ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-sec">
                  Total celebrators: {birthdayCelebrators.length}
                </span>
                <button
                  type="button"
                  disabled={isRefreshingMembers}
                  onClick={async () => {
                    if (isRefreshingMembers) return;
                    setIsRefreshingMembers(true);
                    try {
                      await new Promise(resolve => setTimeout(resolve, 120));
                      setKeepMonthBirthdays(false);
                      const bdays = computeBirthdayCelebrators(people, selectedDate);
                      setBirthdayCelebrators(bdays);
                    } finally {
                      setIsRefreshingMembers(false);
                    }
                  }}
                  className="text-xs text-accent hover:underline font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isRefreshingMembers ? (
                    <>
                      <Spinner size="xs" variant="accent" />
                      <span>Refreshing...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      <span>Refresh from members</span>
                    </>
                  )}
                </button>
              </div>

              {/* Table of Celebrators */}
              <div className="border border-subtle rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-subtle/60 text-sec font-semibold text-[11px]">
                    <tr>
                      <th className="p-2 border-b border-subtle w-16 text-center">Day</th>
                      <th className="p-2 border-b border-subtle">Full Name (with Prefix)</th>
                      <th className="p-2 border-b border-subtle text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {birthdayCelebrators.map((entry, idx) => (
                      <tr key={entry.id || idx} className="hover:bg-subtle/30">
                        <td className="p-2 text-center font-bold">
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={entry.day}
                            onChange={(e) => {
                              const copy = [...birthdayCelebrators];
                              copy[idx] = { ...copy[idx], day: Number(e.target.value) || 1 };
                              copy.sort((a, b) => a.day - b.day);
                              setBirthdayCelebrators(copy);
                            }}
                            className="w-12 text-center py-1 rounded border border-subtle bg-field text-main font-bold"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={entry.name}
                              onChange={(e) => {
                                const copy = [...birthdayCelebrators];
                                copy[idx] = { ...copy[idx], name: e.target.value };
                                setBirthdayCelebrators(copy);
                              }}
                              className="w-full px-2 py-1 rounded border border-subtle bg-field text-main font-medium"
                            />
                            {entry.titleGuessed && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold shrink-0"
                                title="Prefix was auto-guessed from Department. You can edit it."
                              >
                                Guessed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setBirthdayCelebrators(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1 rounded text-mut hover:text-red-500 cursor-pointer"
                            title="Remove Celebrator"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Manual Celebrator */}
              <button
                type="button"
                onClick={() => {
                  const newEntry: BirthdayCelebratorEntry = {
                    id: 'bday_' + Math.random().toString(36).substring(2, 9),
                    day: 1,
                    name: 'Bro. New Member'
                  };
                  setBirthdayCelebrators(prev => [...prev, newEntry].sort((a, b) => a.day - b.day));
                }}
                className="px-3 py-1.5 rounded-xl border border-subtle hover:bg-subtle text-sec hover:text-main text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span>Add Celebrator</span>
              </button>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveEditBox(null)}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-contrast font-semibold shadow-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
