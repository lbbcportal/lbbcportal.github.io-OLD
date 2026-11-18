/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, X, RotateCcw, Check, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { ForerunnerFormatSettings, BulletinPositions, DEFAULT_BULLETIN_POSITIONS } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { Spinner } from './LoadingIndicator';

interface ForerunnerSettingsModalProps {
  isOpen: boolean;
  settings: ForerunnerFormatSettings;
  onClose: () => void;
  onSave: (settings: Partial<ForerunnerFormatSettings>) => Promise<void>;
  onReset: () => Promise<void>;
}

export const ForerunnerSettingsModal: React.FC<ForerunnerSettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
  onReset
}) => {
  if (!isOpen) return null;

  const [fontName, setFontName] = useState(settings.fontName || 'Abadi');
  const [startingFontSize, setStartingFontSize] = useState(settings.startingFontSize || 13);
  const [minFontSize, setMinFontSize] = useState(settings.minFontSize || 12);
  const [maxFontSize, setMaxFontSize] = useState(settings.maxFontSize || 16);
  const [autoFitFontSize, setAutoFitFontSize] = useState(settings.autoFitFontSize !== false);
  const [page1Width, setPage1Width] = useState(settings.page1Width || 8.23);
  const [page1Height, setPage1Height] = useState(settings.page1Height || 12.73);
  const [page2Width, setPage2Width] = useState(settings.page2Width || 6.19);
  const [page2Height, setPage2Height] = useState(settings.page2Height || 8.14);
  const [margins, setMargins] = useState(settings.margins || 0.12);
  const [border, setBorder] = useState(settings.border !== false);
  const [blankLineSize, setBlankLineSize] = useState(settings.blankLineSize || 10);
  const [defaultAlignment, setDefaultAlignment] = useState<'justified' | 'left' | 'center' | 'right'>(
    settings.defaultAlignment || 'justified'
  );

  // Bulletin positions
  const [bulletinPositions, setBulletinPositions] = useState<BulletinPositions>(
    settings.bulletinPositions || DEFAULT_BULLETIN_POSITIONS
  );

  // Pastor's Heart style samples & target words
  const [pastorStyleSamples, setPastorStyleSamples] = useState(
    settings.pastorStyleSamples || ''
  );
  const [pastorTargetWords, setPastorTargetWords] = useState<number>(
    settings.pastorTargetWords || 117
  );

  const detectedSampleCount = pastorStyleSamples.trim()
    ? pastorStyleSamples
        .split(/^\s*---\s*$/m)
        .map(s => s.trim())
        .filter(Boolean).length
    : 0;

  const nudgeBox = (boxKey: keyof BulletinPositions, dx: number, dy: number) => {
    setBulletinPositions(prev => {
      const current = prev[boxKey];
      return {
        ...prev,
        [boxKey]: {
          ...current,
          x: Math.round((current.x + dx) * 100) / 100,
          y: Math.round((current.y + dy) * 100) / 100
        }
      };
    });
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        fontName: fontName.trim() || 'Abadi',
        startingFontSize: Number(startingFontSize) || 13,
        minFontSize: Math.max(12, Number(minFontSize) || 12),
        maxFontSize: Number(maxFontSize) || 16,
        autoFitFontSize,
        page1Width: Number(page1Width) || 8.23,
        page1Height: Number(page1Height) || 12.73,
        page2Width: Number(page2Width) || 6.19,
        page2Height: Number(page2Height) || 8.14,
        margins: Number(margins) || 0.12,
        border,
        blankLineSize: Number(blankLineSize) || 10,
        defaultAlignment,
        bulletinPositions,
        pastorStyleSamples,
        pastorTargetWords: Math.max(50, Math.min(250, Number(pastorTargetWords) || 117))
      });
      onClose();
    } catch (err) {
      console.error('Failed to save format settings', err);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleConfirmReset = async () => {
    setIsSubmitting(true);
    try {
      await onReset();
      setIsResetConfirmOpen(false);
      onClose();
    } catch (err) {
      console.error('Failed to reset format settings', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
        <div
          className="relative w-full max-w-xl bg-surface border border-subtle rounded-2xl shadow-2xl p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-150 text-main max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-main leading-tight">Format Settings</h3>
                <p className="text-xs text-mut">1.5-page layout, typography, and Word (.docx) specifications</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            {/* Typography */}
            <div className="space-y-2.5 p-3.5 rounded-xl bg-subtle/40 border border-subtle">
              <h4 className="font-bold text-main uppercase tracking-wider text-[11px]">Typography & Sizes</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sec font-medium mb-1">Font Family</label>
                  <input
                    type="text"
                    value={fontName}
                    onChange={(e) => setFontName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                    placeholder="e.g. Abadi"
                  />
                  <span className="text-[10px] text-mut">Default: Abadi</span>
                </div>

                <div>
                  <label className="block text-sec font-medium mb-1">Body Text Alignment</label>
                  <select
                    value={defaultAlignment}
                    onChange={(e) => setDefaultAlignment(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    <option value="justified">Justified (Standard)</option>
                    <option value="left">Left Aligned</option>
                    <option value="center">Centered</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sec font-medium mb-1">Standard Font Size (pt)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="12"
                    max="18"
                    value={startingFontSize}
                    onChange={(e) => setStartingFontSize(parseFloat(e.target.value) || 13)}
                    className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-[10px] text-mut">Default: 13pt</span>
                </div>

                <div>
                  <label className="block text-sec font-medium mb-1">Minimum Font Size (pt)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="12"
                    max="14"
                    value={minFontSize}
                    onChange={(e) => setMinFontSize(parseFloat(e.target.value) || 12)}
                    className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-[10px] text-mut">Fixed minimum: 12pt</span>
                </div>

                <div>
                  <label className="block text-sec font-medium mb-1">Maximum Font Size (pt)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="12"
                    max="24"
                    value={maxFontSize}
                    onChange={(e) => setMaxFontSize(parseFloat(e.target.value) || 16)}
                    className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-[10px] text-mut">Default: 16pt (for auto-fit)</span>
                </div>

                <div>
                  <label className="block text-sec font-medium mb-1">Blank Line Height (pt)</label>
                  <input
                    type="number"
                    step="1"
                    min="4"
                    max="16"
                    value={blankLineSize}
                    onChange={(e) => setBlankLineSize(parseInt(e.target.value, 10) || 10)}
                    className="w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-[10px] text-mut">Between sections (Default: 10pt)</span>
                </div>

                <div className="sm:col-span-2 pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none p-2.5 rounded-xl bg-surface border border-subtle hover:bg-subtle/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={autoFitFontSize}
                      onChange={(e) => setAutoFitFontSize(e.target.checked)}
                      className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 mt-0.5 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-sec font-medium text-main text-xs">Auto-fit font size to fill both boxes</span>
                      <span className="text-[11px] text-mut">Automatically chooses the largest font size (in 0.5pt steps up to {maxFontSize}pt) so short lessons fill both boxes.</span>
                    </div>
                  </label>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={border}
                      onChange={(e) => setBorder(e.target.checked)}
                      className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sec font-medium">Draw 0.5pt black box border</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Box Dimensions */}
            <div className="space-y-2.5 p-3.5 rounded-xl bg-subtle/40 border border-subtle">
              <h4 className="font-bold text-main uppercase tracking-wider text-[11px]">Box Dimensions (Inches)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sec font-medium mb-1">Page 1 Width</label>
                  <input
                    type="number"
                    step="0.01"
                    value={page1Width}
                    onChange={(e) => setPage1Width(parseFloat(e.target.value) || 8.23)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sec font-medium mb-1">Page 1 Height</label>
                  <input
                    type="number"
                    step="0.01"
                    value={page1Height}
                    onChange={(e) => setPage1Height(parseFloat(e.target.value) || 12.73)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sec font-medium mb-1">Page 2 Width</label>
                  <input
                    type="number"
                    step="0.01"
                    value={page2Width}
                    onChange={(e) => setPage2Width(parseFloat(e.target.value) || 6.19)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sec font-medium mb-1">Page 2 Height</label>
                  <input
                    type="number"
                    step="0.01"
                    value={page2Height}
                    onChange={(e) => setPage2Height(parseFloat(e.target.value) || 8.14)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-mut">
                Page 1 is centered on 8.5" x 13" portrait. Page 2 is placed at top-left of 13" x 8.5" landscape with 0.12" margin.
              </p>
            </div>

            {/* Bulletin Box Positions with Nudge Buttons (0.02" steps) */}
            <div className="space-y-3 pt-3 border-t border-subtle">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-xs text-main uppercase tracking-wider">
                    Bulletin Box Positions (Nudge in 0.02" steps)
                  </h4>
                  <p className="text-[10px] text-mut">
                    Fine-tune the 5 Word text box positions on Page 2 relative to the 13" x 8.5" page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBulletinPositions(DEFAULT_BULLETIN_POSITIONS)}
                  className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                >
                  Reset Boxes
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { key: 'date' as const, label: '1. Sunday Date', coords: bulletinPositions.date },
                  { key: 'verse' as const, label: '2. Verse of the Week', coords: bulletinPositions.verse },
                  { key: 'pastor' as const, label: "3. Pastor's Heart Message (Body)", coords: bulletinPositions.pastor },
                  { key: 'events' as const, label: '4. Upcoming Events', coords: bulletinPositions.events },
                  { key: 'birthdays' as const, label: '5. Birthday Celebrators', coords: bulletinPositions.birthdays }
                ].map(({ key, label, coords }) => (
                  <div
                    key={key}
                    className="p-2.5 rounded-xl border border-subtle bg-subtle/40 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-[140px]">
                      <span className="font-semibold text-main block">{label}</span>
                      <span className="text-[11px] text-sec font-mono">
                        X: {coords.x.toFixed(2)}" | Y: {coords.y.toFixed(2)}" | {coords.w.toFixed(2)}" × {coords.h.toFixed(2)}"
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => nudgeBox(key, -0.02, 0)}
                        className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer"
                        title="Nudge Left (-0.02 inch)"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeBox(key, 0.02, 0)}
                        className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer"
                        title="Nudge Right (+0.02 inch)"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeBox(key, 0, -0.02)}
                        className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer"
                        title="Nudge Up (-0.02 inch)"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeBox(key, 0, 0.02)}
                        className="p-1 rounded-lg border border-subtle hover:bg-subtle text-sec hover:text-main cursor-pointer"
                        title="Nudge Down (+0.02 inch)"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pastor's Heart style samples */}
            <div className="space-y-3 pt-3 border-t border-subtle">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-semibold text-xs text-main uppercase tracking-wider">
                    Pastor&apos;s Heart style samples
                  </h4>
                  <p className="text-[10px] text-mut">
                    Paste past messages separated by a line containing only <code className="px-1 py-0.5 rounded bg-subtle font-mono">---</code>. Up to 4 shortest samples are sent to the AI as style examples.
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-sec">
                  {detectedSampleCount} {detectedSampleCount === 1 ? 'sample' : 'samples'} detected
                </span>
              </div>

              <textarea
                rows={6}
                value={pastorStyleSamples}
                onChange={(e) => setPastorStyleSamples(e.target.value)}
                placeholder={'Paste past Pastor\'s Heart messages here, separated by a line with only ---\n\n---\n\nSecond sample message...'}
                className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs leading-relaxed focus:ring-1 focus:ring-accent"
              />

              <div className="flex items-center gap-3">
                <label className="text-sec font-medium" htmlFor="pastor-target-words">
                  Target words:
                </label>
                <input
                  id="pastor-target-words"
                  type="number"
                  min={60}
                  max={200}
                  step={1}
                  value={pastorTargetWords}
                  onChange={(e) => setPastorTargetWords(parseInt(e.target.value, 10) || 117)}
                  className="w-24 px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs font-semibold focus:ring-1 focus:ring-accent"
                />
                <span className="text-[10px] text-mut">
                  Default: 117 words
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-subtle gap-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-xl border border-subtle text-sec hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to defaults</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-contrast font-semibold hover:opacity-95 transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size="xs" variant="contrast" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Settings</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Reset Format Settings?"
        message="Are you sure you want to reset all format settings back to default dimensions and font size 13pt?"
        confirmLabel="Reset"
        cancelLabel="Cancel"
        isDestructive={false}
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </>
  );
};
