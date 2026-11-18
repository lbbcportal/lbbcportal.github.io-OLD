/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChurchEvent,
  Person,
  BulletinEventEntry,
  BirthdayCelebratorEntry,
  BulletinPositions,
  DEFAULT_BULLETIN_POSITIONS
} from '../types';
import { formatDate } from './dateTime';

/**
 * Returns formatted Sunday date string like "November 15, 2026"
 */
export function formatSundayBulletinDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
  return `${monthName} ${d}, ${y}`;
}

export interface KjvVerseItem {
  reference: string;
  text: string;
}

/**
 * Fetches KJV verses for a passage using KJV bible-api.com
 * Never guesses or quotes from AI memory.
 */
export async function fetchKjvVersesForPassage(passage: string): Promise<KjvVerseItem[]> {
  const cleanPassage = passage.trim();
  if (!cleanPassage) return [];

  const url = `https://bible-api.com/${encodeURIComponent(cleanPassage)}?translation=kjv`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`KJV Bible source returned status ${response.status}. Please check passage spelling (e.g. Revelation 20:1-6).`);
  }

  const data = await response.json();
  if (!data || !data.verses || data.verses.length === 0) {
    throw new Error(`No KJV verses found for "${cleanPassage}".`);
  }

  return data.verses.map((v: any) => ({
    reference: `${v.book_name} ${v.chapter}:${v.verse}`,
    text: (v.text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  }));
}

/**
 * Computes upcoming events for the bulletin:
 * - One-time events from Calendar on or after bulletin Sunday
 * - Maximum 3 entries
 * - Group same-title events into one entry with sublines
 */
export function computeUpcomingEvents(events: ChurchEvent[], sundayDate: string): BulletinEventEntry[] {
  if (!events || events.length === 0 || !sundayDate) return [];

  // Filter only one-time events on or after sundayDate
  const futureEvents = events.filter(e => !e.isTemplate && (e.startDate >= sundayDate));
  futureEvents.sort((a, b) => a.startDate.localeCompare(b.startDate));

  const entries: BulletinEventEntry[] = [];
  const titleMap = new Map<string, ChurchEvent[]>();

  for (const ev of futureEvents) {
    const key = (ev.title || 'Untitled Event').trim();
    if (!titleMap.has(key)) {
      titleMap.set(key, []);
    }
    titleMap.get(key)!.push(ev);
  }

  // Iterate in chronological order of first occurrence
  for (const [title, group] of titleMap.entries()) {
    if (entries.length >= 3) break;

    if (group.length === 1) {
      const single = group[0];
      const [y, m, d] = single.startDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const weekdayStr = dt.toLocaleDateString('en-US', { weekday: 'long' });
      const monthDayYear = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      entries.push({
        id: single.id,
        title,
        isGrouped: false,
        dateStr: `${monthDayYear} (${weekdayStr})`,
        weekdayStr,
        location: single.location || ''
      });
    } else {
      // Grouped multi-date event
      const subLines = group.map(g => {
        const [y, m, d] = g.startDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        const shortMonthDay = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const shortWeekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
        return {
          dateStr: shortMonthDay,
          weekdayStr: shortWeekday,
          location: g.location || ''
        };
      });

      entries.push({
        id: group[0].id + '_group',
        title,
        isGrouped: true,
        subLines
      });
    }
  }

  return entries;
}

/**
 * Computes birthday celebrators for the bulletin month
 */
export function computeBirthdayCelebrators(people: Person[], sundayDate: string): BirthdayCelebratorEntry[] {
  if (!people || people.length === 0 || !sundayDate) return [];

  const [y, m] = sundayDate.split('-').map(Number);
  const targetMonth = m; // 1-12

  const celebrators = people.filter(p => p.birthdayMonth === targetMonth && p.birthdayDay);

  // Prefix resolver
  const entries: BirthdayCelebratorEntry[] = celebrators.map(p => {
    let prefix = '';
    let titleGuessed = false;

    if (p.title === 'Bro.') {
      prefix = 'Bro.';
    } else if (p.title === 'Sis.') {
      prefix = 'Sis.';
    } else if (p.title === 'none') {
      prefix = '';
    } else {
      // Guess from department
      const dept = (p.department || '').toLowerCase();
      if (dept.includes('men')) {
        prefix = 'Bro.';
        titleGuessed = true;
      } else if (dept.includes('ladies') || dept.includes('women')) {
        prefix = 'Sis.';
        titleGuessed = true;
      }
    }

    const fullName = prefix ? `${prefix} ${p.name}` : p.name;

    return {
      id: p.id,
      personId: p.id,
      day: p.birthdayDay!,
      name: fullName,
      titleGuessed
    };
  });

  // Sort by day ascending, then name
  entries.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export interface BirthdayDayGroup {
  day: number;
  names: string[];
}

/**
 * Groups birthday entries by day and divides into left and right columns
 * Left column filled first, then right column.
 */
export function groupBirthdaysForColumns(entries: BirthdayCelebratorEntry[]): {
  leftGroups: BirthdayDayGroup[];
  rightGroups: BirthdayDayGroup[];
  maxRows: number;
} {
  const map = new Map<number, string[]>();
  for (const item of entries) {
    if (!map.has(item.day)) {
      map.set(item.day, []);
    }
    map.get(item.day)!.push(item.name);
  }

  const sortedDays = Array.from(map.entries())
    .map(([day, names]) => ({ day, names }))
    .sort((a, b) => a.day - b.day);

  const mid = Math.ceil(sortedDays.length / 2);
  const leftGroups = sortedDays.slice(0, mid);
  const rightGroups = sortedDays.slice(mid);
  const maxRows = Math.max(leftGroups.length, rightGroups.length);

  return { leftGroups, rightGroups, maxRows };
}

/**
 * Reads and optionally compresses an uploaded background image file
 * Max file target ~700KB while preserving full width.
 */
export async function processBackgroundImageFile(
  file: File
): Promise<{ imageData: string; type: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image file.'));
      img.onload = () => {
        const width = img.naturalWidth || 2860;
        const height = img.naturalHeight || 1870;

        // If file is already <= 700KB, use directly
        if (file.size <= 700 * 1024) {
          resolve({
            imageData: dataUrl,
            type: file.type || 'image/jpeg',
            width,
            height
          });
          return;
        }

        // Compress on canvas keeping full resolution
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            imageData: dataUrl,
            type: file.type || 'image/jpeg',
            width,
            height
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({
          imageData: compressedDataUrl,
          type: 'image/jpeg',
          width,
          height
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Wraps verse text in curly quotes “...”, stripping existing outer quotes
 */
export function formatVerseWithCurlyQuotes(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  // Strip straight and curly quotes from ends
  const cleaned = trimmed.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return `“${cleaned}”`;
}

/**
 * Wraps text into lines using character-width approximation
 */
function wrapTextToLines(text: string, maxWidthInches: number, charWidthFactor: number, fontSizePt: number): string[] {
  if (!text) return [];
  const charWidthInches = (fontSizePt / 72) * charWidthFactor;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthInches / charWidthInches));

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * 1. Sunday Date auto-fit:
 * Franklin Gothic Medium, bold, white, centered horizontally and vertically
 * Auto-fit up to 14pt (steps of 0.25pt)
 * Insets: 0.1" left/right, 0.05" top/bottom
 */
export function calcDateFontSize(text: string, boxW = 2.12, boxH = 0.35): number {
  const availW = Math.max(0.5, boxW - 0.20);
  const availH = Math.max(0.1, boxH - 0.10);
  const clean = text.trim() || 'November 15, 2026';

  for (let pt = 14.0; pt >= 8.0; pt -= 0.25) {
    const charWidthIn = (pt / 72) * 0.54;
    const textWidth = clean.length * charWidthIn;
    const lineHeightIn = (pt * 1.25) / 72;
    if (textWidth <= availW && lineHeightIn <= availH) {
      return pt;
    }
  }
  return 8.0;
}

/**
 * 2. Verse of the Week auto-fit:
 * Mongolian Baiti, centered horizontally and vertically
 * Verse in curly quotes, reference in bold on its own line (reference never cut off)
 * Auto-fit between 9pt and 13pt (steps of 0.25pt)
 * Insets: 0.1" left/right, 0.05" top/bottom
 */
export function calcVerseFontSize(
  verseText: string,
  reference: string,
  boxW = 4.00,
  boxH = 0.94
): { fontSize: number; verseFormatted: string } {
  const availW = Math.max(1.0, boxW - 0.20); // default 3.80"
  const availH = Math.max(0.3, boxH - 0.10); // default 0.84"
  const verseFormatted = formatVerseWithCurlyQuotes(verseText);

  for (let pt = 13.0; pt >= 9.0; pt -= 0.25) {
    const lines = wrapTextToLines(verseFormatted, availW, 0.47, pt);
    const verseHeightIn = lines.length * ((pt * 1.22) / 72);
    const gapIn = 0.04;
    const refHeightIn = (pt * 1.25) / 72; // Reference on its own line
    const totalHeight = verseHeightIn + gapIn + refHeightIn;

    if (totalHeight <= availH) {
      return { fontSize: pt, verseFormatted };
    }
  }

  return { fontSize: 9.0, verseFormatted };
}

/**
 * 3. Upcoming Events auto-fit:
 * Leelawadee, centered horizontally and vertically as one block
 * Scale together: date/title up to 12pt, detail ~9pt, down to min 7pt; grow up to 1.25x if few entries
 * Insets: 0.1" left/right, 0.05" top/bottom
 */
export function calcEventsLayout(
  events: BulletinEventEntry[],
  boxW = 4.01,
  boxH = 1.69
): {
  scale: number;
  titleFontSize: number;
  detailFontSize: number;
  eventSpacingInches: number;
  totalBlockHeightInches: number;
} {
  const availW = Math.max(1.0, boxW - 0.20); // default 3.81"
  const availH = Math.max(0.5, boxH - 0.10); // default 1.59"
  const visible = (events || []).filter(e => !e.hidden).slice(0, 3);

  if (visible.length === 0) {
    return {
      scale: 1.0,
      titleFontSize: 12.0,
      detailFontSize: 9.0,
      eventSpacingInches: 0.08,
      totalBlockHeightInches: 0.3
    };
  }

  // Scale ranges from 1.25 (grow up to 1.25x if few entries) down to ~0.77 (min 7pt detail)
  for (let s = 1.25; s >= 0.77; s -= 0.02) {
    const titlePt = Math.round(12 * s * 4) / 4;
    const detailPt = Math.round(9 * s * 4) / 4;
    const eventGapIn = 0.06 * s;

    let height = 0;
    for (let i = 0; i < visible.length; i++) {
      const ev = visible[i];
      if (i > 0) height += eventGapIn;

      if (ev.isGrouped && ev.subLines && ev.subLines.length > 0) {
        // Title line
        height += (titlePt * 1.22) / 72;
        // Sublines
        height += ev.subLines.length * ((detailPt * 1.20) / 72);
      } else {
        // Date line (bold)
        height += (titlePt * 1.22) / 72;
        // Title line
        height += (detailPt * 1.22) / 72;
      }
    }

    if (height <= availH) {
      return {
        scale: s,
        titleFontSize: titlePt,
        detailFontSize: detailPt,
        eventSpacingInches: eventGapIn,
        totalBlockHeightInches: height
      };
    }
  }

  return {
    scale: 0.778,
    titleFontSize: 9.25,
    detailFontSize: 7.0,
    eventSpacingInches: 0.04,
    totalBlockHeightInches: availH
  };
}

/**
 * 4. Birthday Celebrators auto-fit:
 * Month in capitals (Arial Narrow 16pt bold centered)
 * Table fills whole width and available height of box
 * 2 column groups ([day] [name] [day] [name]), thin black borders, cell padding, vertically centered text
 * If several people share a day, show day once and stack names one per line in the same cell (no commas)
 * Center month + table vertically if shorter than box
 * Auto-fit font from 8pt to 12pt and row height
 */
export function calcBirthdayTableLayout(
  entries: BirthdayCelebratorEntry[],
  boxW = 4.01,
  boxH = 1.73
): {
  fontSize: number;
  tableHeightInches: number;
  totalBlockHeightInches: number;
  leftGroups: BirthdayDayGroup[];
  rightGroups: BirthdayDayGroup[];
  maxRows: number;
  isVerticallyCentered: boolean;
  rowHeightsInches: number[];
} {
  const availW = Math.max(1.0, boxW - 0.20); // 3.81"
  const availH = Math.max(0.5, boxH - 0.10); // 1.63"

  const { leftGroups, rightGroups, maxRows: rawMaxRows } = groupBirthdaysForColumns(entries || []);
  const maxRows = Math.max(1, rawMaxRows);

  const monthHeadingHeightIn = (16 * 1.25) / 72; // ~0.278"
  const monthGapIn = 0.04;
  const availTableH = Math.max(0.4, availH - monthHeadingHeightIn - monthGapIn); // ~1.312"

  // Find font size between 12pt and 8pt (step 0.25)
  for (let pt = 12.0; pt >= 8.0; pt -= 0.25) {
    const lineHeightIn = (pt * 1.18) / 72;
    const rowPadIn = 0.03; // top + bottom padding

    const rowHeights: number[] = [];
    let sumHeight = 0;

    for (let r = 0; r < maxRows; r++) {
      const leftCount = leftGroups[r]?.names?.length || 1;
      const rightCount = rightGroups[r]?.names?.length || 1;
      const linesInRow = Math.max(leftCount, rightCount, 1);
      const rH = linesInRow * lineHeightIn + rowPadIn;
      rowHeights.push(rH);
      sumHeight += rH;
    }

    if (sumHeight <= availTableH) {
      // If table has available remaining height and multiple rows, expand rows slightly to fill
      const extraH = availTableH - sumHeight;
      const distributedRowHeights = rowHeights.map(rh => rh + (extraH > 0 && maxRows > 2 ? extraH / maxRows : 0));
      const finalTableH = distributedRowHeights.reduce((a, b) => a + b, 0);
      const totalBlockH = monthHeadingHeightIn + monthGapIn + finalTableH;

      return {
        fontSize: pt,
        tableHeightInches: finalTableH,
        totalBlockHeightInches: totalBlockH,
        leftGroups,
        rightGroups,
        maxRows,
        isVerticallyCentered: totalBlockH < availH - 0.05,
        rowHeightsInches: distributedRowHeights
      };
    }
  }

  // Fallback to 8pt
  const minLineH = (8.0 * 1.18) / 72;
  const rowHeights = Array.from({ length: maxRows }, () => minLineH + 0.02);
  const tableH = rowHeights.reduce((a, b) => a + b, 0);
  const totalBlockH = monthHeadingHeightIn + monthGapIn + tableH;

  return {
    fontSize: 8.0,
    tableHeightInches: tableH,
    totalBlockHeightInches: totalBlockH,
    leftGroups,
    rightGroups,
    maxRows,
    isVerticallyCentered: totalBlockH < availH - 0.05,
    rowHeightsInches: rowHeights
  };
}

/**
 * 5. Pastor's Heart Message (body only) auto-fit:
 * Franklin Gothic Book, justified
 * Blank lines = paragraph breaks with ~0.3" first-line indent
 * Small gap between paragraphs
 * Auto-fit 8pt to 12pt (0.25pt steps)
 * If does not fit at 8pt, show warning with approx max word count (~120 words)
 * Insets: 0.1" left/right, 0.05" top/bottom
 */
export function calcPastorMessageLayout(
  text: string,
  boxW = 2.25,
  boxH = 4.38
): {
  fontSize: number;
  overflows: boolean;
  maxWords: number;
  estimatedHeightInches: number;
  paragraphs: string[];
} {
  const availW = Math.max(1.0, boxW - 0.20); // 2.05"
  const availH = Math.max(1.0, boxH - 0.10); // 4.28"
  const paragraphs = (text || '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return {
      fontSize: 10.0,
      overflows: false,
      maxWords: 120,
      estimatedHeightInches: 0.5,
      paragraphs: []
    };
  }

  const pGapIn = 0.055; // paragraph spacing
  const indentIn = 0.30; // first line indent ~0.3"

  for (let pt = 12.0; pt >= 8.0; pt -= 0.25) {
    const lineHeightIn = (pt * 1.22) / 72;
    const charWidthIn = (pt / 72) * 0.49; // Franklin Gothic Book avg char width factor
    let totalHeight = 0;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const p = paragraphs[pIdx];
      const words = p.split(/\s+/).filter(Boolean);
      let lineNum = 0;
      let currentLineWidthIn = 0;

      for (const w of words) {
        const wordWidthIn = w.length * charWidthIn;
        const lineMaxW = lineNum === 0 ? Math.max(0.8, availW - indentIn) : availW;

        if (currentLineWidthIn === 0) {
          currentLineWidthIn = wordWidthIn;
          lineNum++;
        } else if (currentLineWidthIn + (charWidthIn * 0.8) + wordWidthIn <= lineMaxW) {
          currentLineWidthIn += (charWidthIn * 0.8) + wordWidthIn;
        } else {
          lineNum++;
          currentLineWidthIn = wordWidthIn;
        }
      }

      totalHeight += lineNum * lineHeightIn;
      if (pIdx > 0) totalHeight += pGapIn;
    }

    if (totalHeight <= availH) {
      return {
        fontSize: pt,
        overflows: false,
        maxWords: 120,
        estimatedHeightInches: totalHeight,
        paragraphs
      };
    }
  }

  return {
    fontSize: 8.0,
    overflows: true,
    maxWords: 120,
    estimatedHeightInches: availH + 0.3,
    paragraphs
  };
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function getWordTargetRange(targetWords?: number): {
  target: number;
  min: number;
  max: number;
} {
  const target =
    typeof targetWords === 'number' && !isNaN(targetWords) && targetWords >= 40
      ? Math.round(targetWords)
      : 117;
  if (target === 117) {
    return { target: 117, min: 105, max: 125 };
  }
  return {
    target,
    min: Math.max(40, target - 12),
    max: target + 8
  };
}

/**
 * Strips HTML formatting from Lesson Maker contentHtml into clean plain text.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  const doc = new DOMParser().parseFromString(`<div>${normalized}</div>`, 'text/html');
  return (doc.body.textContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Splits style samples on lines containing only "---", trims, and returns the shortest samples first (up to maxCount).
 */
export function parsePastorStyleSamples(raw?: string, maxCount: number = 4): string[] {
  if (!raw || !raw.trim()) return [];
  const all = raw
    .split(/^\s*---\s*$/m)
    .map(s => s.trim())
    .filter(Boolean);
  if (all.length === 0) return [];
  return [...all]
    .sort((a, b) => countWords(a) - countWords(b) || a.length - b.length)
    .slice(0, maxCount);
}

