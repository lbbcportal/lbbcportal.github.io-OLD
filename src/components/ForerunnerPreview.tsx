/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { ForerunnerFormatSettings, ForerunnerBulletin } from '../types';
import { LessonParagraph } from '../lib/docxGenerator';
import { ArrowUp, ArrowDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BulletinPage2Overlay } from './BulletinPage2Overlay';

interface ForerunnerPreviewProps {
  seriesTitle: string;
  passage: string;
  page1Paragraphs: LessonParagraph[];
  page2Paragraphs: LessonParagraph[];
  fontSize: number;
  blankLineSize: number;
  settings: ForerunnerFormatSettings;
  isOverflowing: boolean;
  overflowLines: number;
  breakLineIndex: number;
  onMoveBreakUp: () => void;
  onMoveBreakDown: () => void;
  bulletin?: ForerunnerBulletin | null;
  backgroundImageUrl?: string | null;
  onBoxClick?: (boxKey: 'date' | 'verse' | 'pastor' | 'events' | 'birthdays') => void;
  interactiveBulletin?: boolean;
}


export const ForerunnerPreview: React.FC<ForerunnerPreviewProps> = ({
  seriesTitle,
  passage,
  page1Paragraphs,
  page2Paragraphs,
  fontSize,
  blankLineSize,
  settings,
  isOverflowing,
  overflowLines,
  onMoveBreakUp,
  onMoveBreakDown,
  bulletin,
  backgroundImageUrl,
  onBoxClick,
  interactiveBulletin
}) => {
  const fontName = settings.fontName || 'Abadi, sans-serif';
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const availWidth = Math.max(260, containerWidth - 32);
  const isWideScreen = availWidth >= 980;

  // In Side-by-Side mode, scale Page 1 and Page 2 to fit available column width with no horizontal scrollbar
  const scale = isWideScreen
    ? 1
    : Math.max(0.42, Math.min(1, availWidth / 580));

  const p1Width = Math.round(380 * scale);
  const p2Width = Math.round(580 * scale);
  const previewFontSize = Math.max(7.5, fontSize * 0.72 * scale);
  const previewBlankLine = Math.max(2, blankLineSize * 0.72 * scale);

  return (
    <div ref={containerRef} data-no-motion="true" className="space-y-4 w-full overflow-hidden">
      {/* Break position and status toolbar */}
      <div className="p-3 rounded-xl bg-surface border border-subtle shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-main">Page Break Position:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMoveBreakUp}
              className="px-2 py-1 rounded-lg border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main flex items-center gap-1 font-medium transition-colors cursor-pointer"
              title="Shift 1 line to page 2"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Shift Up</span>
            </button>
            <button
              type="button"
              onClick={onMoveBreakDown}
              className="px-2 py-1 rounded-lg border border-subtle bg-surface hover:bg-subtle text-sec hover:text-main flex items-center gap-1 font-medium transition-colors cursor-pointer"
              title="Pull 1 line onto page 1"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Shift Down</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOverflowing ? (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Overflow: ~{overflowLines} lines over box limit</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Fits within 1.5 pages</span>
            </div>
          )}
        </div>
      </div>

      {/* Pages Preview Container: Scaled cleanly without horizontal scrollbars */}
      <div className={`flex ${isWideScreen ? 'flex-row items-start' : 'flex-col items-center'} justify-center gap-6 overflow-hidden p-3 sm:p-4 bg-zinc-200/60 dark:bg-zinc-950/60 rounded-2xl border border-subtle w-full`}>
        {/* PAGE 1: Portrait 8.5" x 13" */}
        <div className="flex flex-col items-center">
          <div className="text-[11px] font-bold text-sec uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <span>Page 1 (Portrait 8.5" x 13")</span>
          </div>

          <div
            className="aspect-[8.5/13] bg-white text-black p-2.5 sm:p-3.5 shadow-xl border border-zinc-300 rounded-sm relative flex flex-col select-none overflow-hidden max-w-full"
            style={{ width: `${p1Width}px`, fontFamily: fontName }}
          >
            {/* Centered Text Box on Page 1 */}
            <div
              className={`w-full h-full p-2 sm:p-2.5 overflow-hidden flex flex-col justify-start relative ${
                settings.border !== false ? 'border border-black' : ''
              }`}
              style={{
                fontSize: `${previewFontSize}px`,
                lineHeight: 1.18
              }}
            >
              {/* Header block */}
              <div className="text-center mb-1">
                <div className="font-bold underline uppercase tracking-tight text-[1.05em]">
                  {seriesTitle || 'SERIES TITLE'}
                </div>
                <div className="text-[0.98em] font-normal mt-0.5">
                  {passage || 'Passage Reference'}
                </div>
              </div>

              {/* Blank line */}
              <div style={{ height: `${previewBlankLine}px` }} />

              {/* Lesson body paragraphs on Page 1 */}
              <div className="space-y-1 overflow-hidden flex-1">
                {page1Paragraphs.map((p, idx) => (
                  <div
                    key={idx}
                    className="leading-[1.18]"
                    style={{
                      textAlign: p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'justify',
                      textIndent: p.isFirstLineIndent ? '1.5em' : '0'
                    }}
                  >
                    {p.isList && p.listNumber && <b>{p.listNumber}</b>}
                    {p.runs.map((r, rIdx) => (
                      <span
                        key={rIdx}
                        className={`${r.bold ? 'font-bold' : ''} ${r.italic ? 'italic' : ''} ${
                          r.underline ? 'underline' : ''
                        }`}
                      >
                        {r.text}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {/* Break Indicator Line */}
              <div className="absolute bottom-1 left-2 right-2 border-b-2 border-dashed border-accent flex items-center justify-between pointer-events-none opacity-80">
                <span className="text-[9px] font-bold bg-accent text-white px-1.5 py-0.2 rounded-t">
                  Page 1 End
                </span>
                <span className="text-[9px] text-accent font-semibold">Continues on Page 2 →</span>
              </div>
            </div>
          </div>
        </div>

        {/* PAGE 2: Landscape 13" x 8.5" */}
        <div className="flex flex-col items-center">
          <div className="text-[11px] font-bold text-sec uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <span>Page 2 (Landscape 13" x 8.5")</span>
          </div>

          <div
            className="aspect-[13/8.5] bg-white text-black shadow-xl border border-zinc-300 rounded-sm relative flex select-none overflow-hidden max-w-full"
            style={{ width: `${p2Width}px`, fontFamily: fontName }}
          >
            {backgroundImageUrl ? (
              <>
                <BulletinPage2Overlay
                  bulletin={bulletin || null}
                  backgroundImageUrl={backgroundImageUrl}
                  settings={settings}
                  scale={scale}
                  onBoxClick={onBoxClick}
                  interactive={interactiveBulletin}
                />

                {/* Left Box: Lesson Continuation on top of background */}
                <div
                  className={`absolute p-2 sm:p-2.5 overflow-hidden flex flex-col justify-start bg-transparent ${
                    settings.border !== false ? 'border border-black' : ''
                  }`}
                  style={{
                    left: `${(0.12 / 13) * 100}%`,
                    top: `${(0.12 / 8.5) * 100}%`,
                    width: `${(6.19 / 13) * 100}%`,
                    height: `${(8.14 / 8.5) * 100}%`,
                    fontSize: `${previewFontSize}px`,
                    lineHeight: 1.18,
                    zIndex: 10
                  }}
                >
                  <div className="space-y-1 overflow-hidden flex-1">
                    {page2Paragraphs.map((p, idx) => (
                      <div
                        key={idx}
                        className="leading-[1.18]"
                        style={{
                          textAlign: p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'justify',
                          textIndent: p.isFirstLineIndent && idx !== 0 ? '1.5em' : '0'
                        }}
                      >
                        {p.isList && p.listNumber && <b>{p.listNumber}</b>}
                        {p.runs.map((r, rIdx) => (
                          <span
                            key={rIdx}
                            className={`${r.bold ? 'font-bold' : ''} ${r.italic ? 'italic' : ''} ${
                              r.underline ? 'underline' : ''
                            }`}
                          >
                            {r.text}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex p-2.5 sm:p-3.5">
                {/* Left Box: Lesson Continuation */}
                <div
                  className={`w-[48%] h-full p-2 sm:p-2.5 overflow-hidden flex flex-col justify-start ${
                    settings.border !== false ? 'border border-black' : ''
                  }`}
                  style={{
                    fontSize: `${previewFontSize}px`,
                    lineHeight: 1.18
                  }}
                >
                  <div className="space-y-1 overflow-hidden flex-1">
                    {page2Paragraphs.map((p, idx) => (
                      <div
                        key={idx}
                        className="leading-[1.18]"
                        style={{
                          textAlign: p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'justify',
                          textIndent: p.isFirstLineIndent && idx !== 0 ? '1.5em' : '0'
                        }}
                      >
                        {p.isList && p.listNumber && <b>{p.listNumber}</b>}
                        {p.runs.map((r, rIdx) => (
                          <span
                            key={rIdx}
                            className={`${r.bold ? 'font-bold' : ''} ${r.italic ? 'italic' : ''} ${
                              r.underline ? 'underline' : ''
                            }`}
                          >
                            {r.text}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Half: Gray "Bulletin Area" Placeholder */}
                <div className="w-[52%] h-full pl-3 flex flex-col items-center justify-center">
                  <div className="w-full h-full rounded border-2 border-dashed border-zinc-300 bg-zinc-100 dark:bg-zinc-200 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                    <span className="font-bold text-xs uppercase tracking-wider text-zinc-700">
                      Bulletin Area
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-1">
                      Upload a background picture in Bulletin Maker to see the full bulletin preview here.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
