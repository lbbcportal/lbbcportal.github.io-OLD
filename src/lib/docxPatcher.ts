/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import {
  ForerunnerBulletin,
  ForerunnerFormatSettings
} from '../types';
import {
  LessonParagraph,
  escapeXml,
  buildWordParagraphXml,
  buildLessonHeaderXml,
  buildDateBoxContentXml,
  buildVerseBoxContentXml,
  buildPastorMessageBoxContentXml,
  buildEventsBoxContentXml,
  buildBirthdaysBoxContentXml
} from './docxGenerator';
import { formatSundayBulletinDate } from './bulletinHelpers';

export type DocxBoxKey =
  | 'lesson1'
  | 'lesson2'
  | 'date'
  | 'verse'
  | 'events'
  | 'birthdays'
  | 'pastor'
  | 'welcome'
  | 'closing';

export type UpdatableDocxBoxKey =
  | 'lesson1'
  | 'lesson2'
  | 'date'
  | 'verse'
  | 'events'
  | 'birthdays'
  | 'pastor';

export const BOX_LABELS: Record<DocxBoxKey, string> = {
  lesson1: 'Page 1 Lesson box',
  lesson2: 'Page 2 Lesson box',
  date: 'Date box',
  verse: 'Verse of the Week box',
  events: 'Upcoming Events box',
  birthdays: 'Birthdays box',
  pastor: "Pastor's Heart message box",
  welcome: 'Welcome box',
  closing: 'Closing & signature box'
};

export interface DocxUpdateFlags {
  seriesTitle: boolean; // default false (KEEP)
  date: boolean;        // default true (UPDATE)
  verse: boolean;       // default true (UPDATE)
  pastor: boolean;      // default true (UPDATE)
  events: boolean;      // default true (UPDATE)
  birthdays: boolean;   // default false when same month as uploaded file, else true
}

export interface MatchedBoxSummary {
  wInches: number;
  hInches: number;
  xInches: number | null;
  yInches: number | null;
  matchType: 'size' | 'content';
}

export interface ParsedUploadedDocx {
  fileName: string;
  arrayBuffer: ArrayBuffer;
  detectedDateText: string | null;
  detectedMonth: number | null; // 1-12
  detectedYear: number | null;
  detectedSeriesTitle: string | null;
  detectedPassage: string | null;
  matchedBoxes: Partial<Record<DocxBoxKey, MatchedBoxSummary>>;
  missingUpdatableBoxes: UpdatableDocxBoxKey[];
  parseError?: string;
}

interface BoxCandidate {
  id: number;
  sectionIndex: number;
  wInches: number;
  hInches: number;
  xInches: number | null;
  yInches: number | null;
  hasTable: boolean;
  paragraphsText: string[];
  fullText: string;
  txbxContentEl: Element;
  bodyPrEl: Element | null;
  altContentEl: Element | null;
  fallbackEl: Element | null;
}

const TARGET_DIMS: Record<DocxBoxKey, { w: number; h: number }> = {
  lesson1: { w: 8.23, h: 12.74 },
  lesson2: { w: 6.19, h: 8.14 },
  date: { w: 2.12, h: 0.35 },
  verse: { w: 4.00, h: 0.94 },
  events: { w: 4.01, h: 1.69 },
  birthdays: { w: 4.01, h: 1.73 },
  pastor: { w: 2.25, h: 4.38 },
  welcome: { w: 2.25, h: 0.47 },
  closing: { w: 2.25, h: 0.70 }
};

const SIZE_TOLERANCE_IN = 0.06;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

function localName(el: Element): string {
  return el.localName || el.tagName.split(':').pop() || '';
}

function getDescendantsByLocalName(root: Element, name: string): Element[] {
  const out: Element[] = [];
  const walk = (node: Element) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (localName(child) === name) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(root);
  return out;
}

function getDirectChildByLocalName(parent: Element, name: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    if (localName(parent.children[i]) === name) {
      return parent.children[i];
    }
  }
  return null;
}

function extractParagraphText(pEl: Element): string {
  const texts = getDescendantsByLocalName(pEl, 't');
  return texts.map(t => t.textContent || '').join('').trim();
}

function parseCssLengthToInches(val: string | undefined): number | null {
  if (!val) return null;
  const m = val.trim().match(/^([\d.]+)\s*(in|pt|cm|mm|px|emu)?$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const unit = (m[2] || 'pt').toLowerCase();
  if (unit === 'in') return num;
  if (unit === 'pt') return num / 72;
  if (unit === 'cm') return num / 2.54;
  if (unit === 'mm') return num / 25.4;
  if (unit === 'px') return num / 96;
  if (unit === 'emu') return num / 914400;
  return num / 72;
}

function parseVmlDimensions(shapeEl: Element): {
  wInches: number | null;
  hInches: number | null;
  xInches: number | null;
  yInches: number | null;
} {
  const style = shapeEl.getAttribute('style') || '';
  const map = new Map<string, string>();
  for (const part of style.split(';')) {
    const idx = part.indexOf(':');
    if (idx > 0) {
      map.set(part.slice(0, idx).trim().toLowerCase(), part.slice(idx + 1).trim());
    }
  }
  return {
    wInches: parseCssLengthToInches(map.get('width')),
    hInches: parseCssLengthToInches(map.get('height')),
    xInches: parseCssLengthToInches(map.get('margin-left') || map.get('left')),
    yInches: parseCssLengthToInches(map.get('margin-top') || map.get('top'))
  };
}

function extractDrawingDims(drawingEl: Element, wspEl: Element): {
  wInches: number;
  hInches: number;
  xInches: number | null;
  yInches: number | null;
} {
  let wEmu: number | null = null;
  let hEmu: number | null = null;
  let xEmu: number | null = null;
  let yEmu: number | null = null;

  const anchorOrInline =
    getDirectChildByLocalName(drawingEl, 'anchor') ||
    getDirectChildByLocalName(drawingEl, 'inline');

  if (anchorOrInline) {
    const extent = getDirectChildByLocalName(anchorOrInline, 'extent');
    if (extent) {
      const cx = Number(extent.getAttribute('cx'));
      const cy = Number(extent.getAttribute('cy'));
      if (!isNaN(cx) && cx > 0) wEmu = cx;
      if (!isNaN(cy) && cy > 0) hEmu = cy;
    }

    const posH = getDirectChildByLocalName(anchorOrInline, 'positionH');
    if (posH) {
      const posOffset = getDirectChildByLocalName(posH, 'posOffset');
      if (posOffset && posOffset.textContent) {
        const val = Number(posOffset.textContent.trim());
        if (!isNaN(val)) xEmu = val;
      }
    }

    const posV = getDirectChildByLocalName(anchorOrInline, 'positionV');
    if (posV) {
      const posOffset = getDirectChildByLocalName(posV, 'posOffset');
      if (posOffset && posOffset.textContent) {
        const val = Number(posOffset.textContent.trim());
        if (!isNaN(val)) yEmu = val;
      }
    }
  }

  // Fallback to wps:spPr -> a:xfrm -> a:ext
  if (wEmu === null || hEmu === null) {
    const spPr = getDirectChildByLocalName(wspEl, 'spPr');
    const xfrm = spPr ? getDirectChildByLocalName(spPr, 'xfrm') : null;
    const ext = xfrm ? getDirectChildByLocalName(xfrm, 'ext') : null;
    if (ext) {
      const cx = Number(ext.getAttribute('cx'));
      const cy = Number(ext.getAttribute('cy'));
      if (!isNaN(cx) && cx > 0) wEmu = wEmu ?? cx;
      if (!isNaN(cy) && cy > 0) hEmu = hEmu ?? cy;
    }
  }

  return {
    wInches: wEmu !== null ? wEmu / 914400 : 0,
    hInches: hEmu !== null ? hEmu / 914400 : 0,
    xInches: xEmu !== null ? xEmu / 914400 : null,
    yInches: yEmu !== null ? yEmu / 914400 : null
  };
}

/**
 * Collects all text boxes in word/document.xml cleanly, avoiding double-counting AlternateContent Choice + Fallback.
 */
function collectBoxCandidates(doc: Document): BoxCandidate[] {
  const body = getDescendantsByLocalName(doc.documentElement, 'body')[0];
  if (!body) return [];

  const candidates: BoxCandidate[] = [];
  let nextId = 1;
  let sectionIndex = 0;

  const inspectParagraph = (pEl: Element, secIdx: number) => {
    const visitNode = (node: Element) => {
      const ln = localName(node);

      if (ln === 'AlternateContent') {
        const choiceEl = getDirectChildByLocalName(node, 'Choice');
        const fallbackEl = getDirectChildByLocalName(node, 'Fallback');
        if (choiceEl) {
          const drawings = getDescendantsByLocalName(choiceEl, 'drawing');
          for (const dr of drawings) {
            const wsps = getDescendantsByLocalName(dr, 'wsp');
            for (const wsp of wsps) {
              const txbx = getDirectChildByLocalName(wsp, 'txbx');
              const txbxContent = txbx ? getDirectChildByLocalName(txbx, 'txbxContent') : null;
              if (!txbxContent) continue;

              const dims = extractDrawingDims(dr, wsp);
              const paras = Array.from(txbxContent.children).filter(c => localName(c) === 'p');
              const paragraphsText = paras.map(extractParagraphText);
              const hasTable = getDescendantsByLocalName(txbxContent, 'tbl').length > 0;
              const bodyPr = getDirectChildByLocalName(wsp, 'bodyPr');

              candidates.push({
                id: nextId++,
                sectionIndex: secIdx,
                ...dims,
                hasTable,
                paragraphsText,
                fullText: paragraphsText.filter(Boolean).join('\n'),
                txbxContentEl: txbxContent,
                bodyPrEl: bodyPr,
                altContentEl: node,
                fallbackEl
              });
            }
          }
          return;
        }
      }

      if (ln === 'drawing') {
        const wsps = getDescendantsByLocalName(node, 'wsp');
        for (const wsp of wsps) {
          const txbx = getDirectChildByLocalName(wsp, 'txbx');
          const txbxContent = txbx ? getDirectChildByLocalName(txbx, 'txbxContent') : null;
          if (!txbxContent) continue;

          const dims = extractDrawingDims(node, wsp);
          const paras = Array.from(txbxContent.children).filter(c => localName(c) === 'p');
          const paragraphsText = paras.map(extractParagraphText);
          const hasTable = getDescendantsByLocalName(txbxContent, 'tbl').length > 0;
          const bodyPr = getDirectChildByLocalName(wsp, 'bodyPr');

          candidates.push({
            id: nextId++,
            sectionIndex: secIdx,
            ...dims,
            hasTable,
            paragraphsText,
            fullText: paragraphsText.filter(Boolean).join('\n'),
            txbxContentEl: txbxContent,
            bodyPrEl: bodyPr,
            altContentEl: null,
            fallbackEl: null
          });
        }
        return;
      }

      if (ln === 'pict') {
        const textboxes = getDescendantsByLocalName(node, 'textbox');
        for (const tb of textboxes) {
          const txbxContent = getDirectChildByLocalName(tb, 'txbxContent');
          if (!txbxContent) continue;
          const shapeParent = tb.parentElement;
          const vDims = shapeParent ? parseVmlDimensions(shapeParent) : { wInches: null, hInches: null, xInches: null, yInches: null };
          const paras = Array.from(txbxContent.children).filter(c => localName(c) === 'p');
          const paragraphsText = paras.map(extractParagraphText);
          const hasTable = getDescendantsByLocalName(txbxContent, 'tbl').length > 0;

          candidates.push({
            id: nextId++,
            sectionIndex: secIdx,
            wInches: vDims.wInches ?? 0,
            hInches: vDims.hInches ?? 0,
            xInches: vDims.xInches,
            yInches: vDims.yInches,
            hasTable,
            paragraphsText,
            fullText: paragraphsText.filter(Boolean).join('\n'),
            txbxContentEl: txbxContent,
            bodyPrEl: null,
            altContentEl: null,
            fallbackEl: null
          });
        }
        return;
      }

      for (let i = 0; i < node.children.length; i++) {
        visitNode(node.children[i]);
      }
    };

    visitNode(pEl);
  };

  for (let i = 0; i < body.children.length; i++) {
    const child = body.children[i];
    if (localName(child) === 'p') {
      inspectParagraph(child, sectionIndex);
      const pPr = getDirectChildByLocalName(child, 'pPr');
      if (pPr && getDirectChildByLocalName(pPr, 'sectPr')) {
        sectionIndex++;
      }
    }
  }

  return candidates;
}

function parseDateFromText(text: string): { month: number | null; year: number | null; display: string | null } {
  if (!text) return { month: null, year: null, display: null };
  const clean = text.trim();
  const m = clean.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/i
  );
  if (m) {
    const monthIdx = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return {
      month: monthIdx > 0 ? monthIdx : null,
      year: parseInt(m[3], 10) || null,
      display: clean
    };
  }
  const upperMonthOnly = MONTHS.findIndex(mn => clean.toUpperCase().includes(mn.toUpperCase()));
  if (upperMonthOnly >= 0) {
    return { month: upperMonthOnly + 1, year: null, display: null };
  }
  return { month: null, year: null, display: clean || null };
}

/**
 * Identifies each box in the uploaded file by size (within ~0.05-0.06") and content/position backup.
 */
function matchCandidatesToBoxes(candidates: BoxCandidate[]): Map<DocxBoxKey, { candidate: BoxCandidate; matchType: 'size' | 'content' }> {
  const matched = new Map<DocxBoxKey, { candidate: BoxCandidate; matchType: 'size' | 'content' }>();
  const usedIds = new Set<number>();

  const keysOrder: DocxBoxKey[] = [
    'birthdays', // Check birthdays first so table heuristic prevents collision with events (4.01x1.73 vs 4.01x1.69)
    'events',
    'welcome',
    'closing',
    'date',
    'verse',
    'pastor',
    'lesson1',
    'lesson2'
  ];

  // Pass 1: Size matching within tolerance (with content & position tie-breakers)
  for (const key of keysOrder) {
    const target = TARGET_DIMS[key];
    let best: BoxCandidate | null = null;
    let bestScore = Infinity;

    for (const c of candidates) {
      if (usedIds.has(c.id)) continue;
      if (c.wInches <= 0 || c.hInches <= 0) continue;

      const dw = Math.abs(c.wInches - target.w);
      const dh = Math.abs(c.hInches - target.h);
      if (dw > SIZE_TOLERANCE_IN || dh > SIZE_TOLERANCE_IN) continue;

      let score = dw + dh;

      if (key === 'birthdays') {
        if (c.hasTable) score -= 5.0;
        else if (MONTHS.some(m => c.fullText.toUpperCase().includes(m.toUpperCase()))) score -= 2.0;
        else score += 5.0; // Avoid picking non-table events box if birthdays table is absent
      } else if (key === 'events') {
        if (!c.hasTable) score -= 2.0;
        else score += 10.0;
        if (c.yInches !== null && c.yInches < 4.2) score -= 0.5;
      } else if (key === 'welcome') {
        if (/welcome/i.test(c.fullText)) score -= 3.0;
      } else if (key === 'closing') {
        if (/wonderful|lord|claus|esden|lbbc/i.test(c.fullText)) score -= 3.0;
      } else if (key === 'date') {
        if (parseDateFromText(c.fullText).month !== null) score -= 3.0;
      } else if (key === 'verse') {
        if (/[“"']/.test(c.fullText) || /\d+:\d+/.test(c.fullText)) score -= 2.0;
      } else if (key === 'pastor') {
        if (/welcome/i.test(c.paragraphsText[0] || '') && c.hInches > 4.6) score += 20.0;
      } else if (key === 'lesson1') {
        if (c.sectionIndex === 0) score -= 2.0;
      } else if (key === 'lesson2') {
        if (c.sectionIndex >= 1) score -= 2.0;
      }

      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best && bestScore < 5.0) {
      matched.set(key, { candidate: best, matchType: 'size' });
      usedIds.add(best.id);
    }
  }

  // Pass 2: Content & rough geometry backup for any unmatched boxes
  for (const key of keysOrder) {
    if (matched.has(key)) continue;

    let best: BoxCandidate | null = null;
    for (const c of candidates) {
      if (usedIds.has(c.id)) continue;

      if (key === 'birthdays') {
        if (c.hasTable && c.wInches > 2.5 && c.hInches > 0.8) {
          best = c;
          break;
        }
      } else if (key === 'welcome') {
        if (/^\s*welcome!?\s*$/i.test(c.fullText) && c.wInches < 3.5 && c.hInches < 1.2) {
          best = c;
          break;
        }
      } else if (key === 'closing') {
        if (/have a wonderful lord|claus.*esden|lbbc ministries/i.test(c.fullText) && c.wInches < 3.5 && c.hInches < 1.5) {
          best = c;
          break;
        }
      } else if (key === 'date') {
        const parsed = parseDateFromText(c.fullText);
        if (parsed.month !== null && parsed.year !== null && c.hInches < 0.9 && c.wInches < 3.8) {
          best = c;
          break;
        }
      } else if (key === 'lesson1') {
        if (c.sectionIndex === 0 && c.wInches > 6.0 && c.hInches > 9.0) {
          best = c;
          break;
        }
      } else if (key === 'lesson2') {
        if (c.sectionIndex >= 1 && c.wInches > 4.5 && c.wInches < 7.5 && c.hInches > 6.5) {
          best = c;
          break;
        }
      } else if (key === 'verse') {
        if (
          c.sectionIndex >= 1 &&
          !c.hasTable &&
          c.wInches > 3.0 &&
          c.hInches < 1.5 &&
          (c.yInches === null || c.yInches < 2.6) &&
          (/[“"']/.test(c.fullText) || /\d+:\d+/.test(c.fullText))
        ) {
          best = c;
          break;
        }
      } else if (key === 'events') {
        if (
          c.sectionIndex >= 1 &&
          !c.hasTable &&
          c.wInches > 3.0 &&
          c.hInches > 1.0 &&
          c.hInches < 2.6 &&
          (c.yInches === null || (c.yInches >= 1.9 && c.yInches < 4.5))
        ) {
          best = c;
          break;
        }
      } else if (key === 'pastor') {
        const isOldCombinedPastorBox = /welcome/i.test(c.paragraphsText[0] || '') && c.hInches > 4.6;
        if (
          !isOldCombinedPastorBox &&
          c.sectionIndex >= 1 &&
          !c.hasTable &&
          c.wInches >= 1.8 &&
          c.wInches <= 3.0 &&
          c.hInches >= 3.0 &&
          c.hInches <= 4.8 &&
          (c.xInches === null || (c.xInches >= 5.5 && c.xInches <= 7.8))
        ) {
          best = c;
          break;
        }
      }
    }

    if (best) {
      matched.set(key, { candidate: best, matchType: 'content' });
      usedIds.add(best.id);
    }
  }

  return matched;
}

/**
 * Inspects an uploaded .docx file in memory and detects all boxes and previous date/title metadata.
 */
export async function inspectUploadedDocx(fileName: string, arrayBuffer: ArrayBuffer): Promise<ParsedUploadedDocx> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) {
      return {
        fileName,
        arrayBuffer,
        detectedDateText: null,
        detectedMonth: null,
        detectedYear: null,
        detectedSeriesTitle: null,
        detectedPassage: null,
        matchedBoxes: {},
        missingUpdatableBoxes: ['lesson1', 'lesson2', 'date', 'verse', 'pastor', 'events', 'birthdays'],
        parseError: 'This file is not a valid Word (.docx) document (missing word/document.xml).'
      };
    }

    const docXmlStr = await docFile.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(docXmlStr, 'application/xml');
    const parseErr = doc.getElementsByTagName('parsererror')[0];
    if (parseErr) {
      return {
        fileName,
        arrayBuffer,
        detectedDateText: null,
        detectedMonth: null,
        detectedYear: null,
        detectedSeriesTitle: null,
        detectedPassage: null,
        matchedBoxes: {},
        missingUpdatableBoxes: ['lesson1', 'lesson2', 'date', 'verse', 'pastor', 'events', 'birthdays'],
        parseError: 'Could not read document XML in this .docx file.'
      };
    }

    const candidates = collectBoxCandidates(doc);
    const matched = matchCandidatesToBoxes(candidates);

    const matchedBoxes: Partial<Record<DocxBoxKey, MatchedBoxSummary>> = {};
    for (const [k, v] of matched.entries()) {
      matchedBoxes[k] = {
        wInches: v.candidate.wInches,
        hInches: v.candidate.hInches,
        xInches: v.candidate.xInches,
        yInches: v.candidate.yInches,
        matchType: v.matchType
      };
    }

    const updatableKeys: UpdatableDocxBoxKey[] = [
      'lesson1',
      'lesson2',
      'date',
      'verse',
      'pastor',
      'events',
      'birthdays'
    ];
    const missingUpdatableBoxes = updatableKeys.filter(k => !matched.has(k));

    // Read Date from matched Date box (with Birthdays month fallback)
    let detectedDateText: string | null = null;
    let detectedMonth: number | null = null;
    let detectedYear: number | null = null;

    const dateMatch = matched.get('date');
    if (dateMatch) {
      const parsed = parseDateFromText(dateMatch.candidate.fullText);
      detectedDateText = parsed.display;
      detectedMonth = parsed.month;
      detectedYear = parsed.year;
    }

    if (detectedMonth === null) {
      const bdayMatch = matched.get('birthdays');
      if (bdayMatch) {
        const parsed = parseDateFromText(bdayMatch.candidate.paragraphsText[0] || '');
        detectedMonth = parsed.month;
      }
    }

    // Read existing Series Title and Passage from Page 1 lesson box
    const lesson1Match = matched.get('lesson1');
    const nonEmptyParas = lesson1Match
      ? lesson1Match.candidate.paragraphsText.filter(t => t.length > 0)
      : [];
    const detectedSeriesTitle = nonEmptyParas[0] || null;
    const detectedPassage = nonEmptyParas[1] || null;

    return {
      fileName,
      arrayBuffer,
      detectedDateText,
      detectedMonth,
      detectedYear,
      detectedSeriesTitle,
      detectedPassage,
      matchedBoxes,
      missingUpdatableBoxes
    };
  } catch (err: any) {
    return {
      fileName,
      arrayBuffer,
      detectedDateText: null,
      detectedMonth: null,
      detectedYear: null,
      detectedSeriesTitle: null,
      detectedPassage: null,
      matchedBoxes: {},
      missingUpdatableBoxes: ['lesson1', 'lesson2', 'date', 'verse', 'pastor', 'events', 'birthdays'],
      parseError: err?.message || 'Failed to read uploaded .docx file.'
    };
  }
}

function replaceTxbxContentChildren(
  mainDoc: Document,
  txbxContentEl: Element,
  innerXml: string,
  keepFirstParagraphNode?: Element | null
) {
  const wrapperXml = `<w:txbxContent
    xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
    xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  >${innerXml}</w:txbxContent>`;

  const fragDoc = new DOMParser().parseFromString(wrapperXml, 'application/xml');
  const parseErr = fragDoc.getElementsByTagName('parsererror')[0];
  if (parseErr) {
    throw new Error('Failed to build valid Word XML fragment for text box.');
  }

  // Clear existing children
  while (txbxContentEl.firstChild) {
    txbxContentEl.removeChild(txbxContentEl.firstChild);
  }

  if (keepFirstParagraphNode) {
    txbxContentEl.appendChild(keepFirstParagraphNode);
  }

  const fragRoot = fragDoc.documentElement;
  for (let i = 0; i < fragRoot.childNodes.length; i++) {
    txbxContentEl.appendChild(mainDoc.importNode(fragRoot.childNodes[i], true));
  }
}

function setBodyPrAnchor(bodyPrEl: Element | null, anchor: 'ctr' | 't') {
  if (!bodyPrEl) return;
  if (anchor === 'ctr') {
    bodyPrEl.setAttribute('anchor', 'ctr');
  } else {
    bodyPrEl.setAttribute('anchor', 't');
  }
}

function removeFallbackIfPresent(box: BoxCandidate) {
  if (box.fallbackEl && box.fallbackEl.parentNode) {
    box.fallbackEl.parentNode.removeChild(box.fallbackEl);
  }
}

export interface PatchDocxOptions {
  uploadedArrayBuffer: ArrayBuffer;
  updateFlags: DocxUpdateFlags;
  // Lesson data (always updated, except seriesTitle respects updateFlags.seriesTitle)
  seriesTitle: string;
  passage: string;
  lessonDate: string;
  page1Paragraphs: LessonParagraph[];
  page2Paragraphs: LessonParagraph[];
  fontSize: number;
  blankLineSize?: number;
  settings: ForerunnerFormatSettings;
  // Bulletin data (nullable if user has not created/opened a bulletin yet)
  bulletin?: ForerunnerBulletin | null;
}

/**
 * Patches ONLY the chosen sections inside the uploaded .docx, keeping all positions,
 * sizes, borders, background image, Welcome/closing boxes, and page setup intact.
 */
export async function patchUploadedDocx(options: PatchDocxOptions): Promise<Blob> {
  const {
    uploadedArrayBuffer,
    updateFlags,
    seriesTitle,
    passage,
    lessonDate,
    page1Paragraphs,
    page2Paragraphs,
    fontSize,
    blankLineSize = 10,
    settings,
    bulletin
  } = options;

  const zip = await JSZip.loadAsync(uploadedArrayBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Uploaded file is missing word/document.xml.');
  }

  const docXmlStr = await docFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXmlStr, 'application/xml');
  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) {
    throw new Error('Could not parse word/document.xml inside uploaded .docx.');
  }

  const candidates = collectBoxCandidates(doc);
  const matched = matchCandidatesToBoxes(candidates);

  const fontName = settings.fontName || 'Abadi';
  const fontSizeHalfPt = Math.round(fontSize * 2);
  const blankLineHalfPt = Math.round(blankLineSize * 2);

  // 1. Page 1 Lesson Box (Lesson text & Passage line always updated; Series title kept if !updateFlags.seriesTitle)
  const lesson1Box = matched.get('lesson1')?.candidate;
  if (!lesson1Box) {
    throw new Error('Could not identify the Page 1 lesson box in the uploaded .docx. Please switch to "Create new from scratch".');
  }

  const firstParaChild = Array.from(lesson1Box.txbxContentEl.children).find(c => localName(c) === 'p') || null;
  const keepFirstParaNode = !updateFlags.seriesTitle && firstParaChild
    ? (firstParaChild.cloneNode(true) as Element)
    : null;

  // Build header XML: if keeping first paragraph, omit series title paragraph from header string and prepend cloned DOM node!
  const headerXml = keepFirstParaNode
    ? `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}"/>
      <w:sz w:val="${fontSizeHalfPt}"/>
      <w:szCs w:val="${fontSizeHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(passage)}</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:spacing w:line="${blankLineHalfPt * 12}" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:sz w:val="${blankLineHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve"> </w:t>
  </w:r>
</w:p>`
    : buildLessonHeaderXml(seriesTitle, passage, fontName, fontSizeHalfPt, blankLineHalfPt);

  const page1BodyXml = page1Paragraphs
    .map(p => buildWordParagraphXml(p, fontSizeHalfPt, fontName, blankLineHalfPt))
    .join('\n');

  replaceTxbxContentChildren(
    doc,
    lesson1Box.txbxContentEl,
    `${headerXml}\n${page1BodyXml}`,
    keepFirstParaNode
  );
  setBodyPrAnchor(lesson1Box.bodyPrEl, 't');
  removeFallbackIfPresent(lesson1Box);

  // 2. Page 2 Lesson Box (always updated)
  const lesson2Box = matched.get('lesson2')?.candidate;
  if (!lesson2Box) {
    throw new Error('Could not identify the Page 2 lesson box in the uploaded .docx. Please switch to "Create new from scratch".');
  }
  const page2BodyXml = page2Paragraphs
    .map((p, idx) => buildWordParagraphXml(p, fontSizeHalfPt, fontName, blankLineHalfPt, idx === 0))
    .join('\n');
  replaceTxbxContentChildren(doc, lesson2Box.txbxContentEl, page2BodyXml);
  setBodyPrAnchor(lesson2Box.bodyPrEl, 't');
  removeFallbackIfPresent(lesson2Box);

  // 3. Date Box
  if (updateFlags.date) {
    const dateBox = matched.get('date')?.candidate;
    if (!dateBox) {
      throw new Error('Could not identify the Date box in the uploaded .docx. Turn off Date update or switch to "Create new from scratch".');
    }
    const dateText = bulletin?.customDateText?.trim() || formatSundayBulletinDate(bulletin?.bulletinDate || lessonDate);
    const dateXml = buildDateBoxContentXml(dateText, dateBox.wInches || 2.12, dateBox.hInches || 0.35);
    replaceTxbxContentChildren(doc, dateBox.txbxContentEl, dateXml);
    setBodyPrAnchor(dateBox.bodyPrEl, 'ctr');
    removeFallbackIfPresent(dateBox);
  }

  // 4. Verse of the Week Box
  if (updateFlags.verse) {
    const verseBox = matched.get('verse')?.candidate;
    if (!verseBox) {
      throw new Error('Could not identify the Verse of the Week box in the uploaded .docx. Turn off Verse update or switch to "Create new from scratch".');
    }
    if (bulletin) {
      const verseXml = buildVerseBoxContentXml(
        bulletin.verseText || '',
        bulletin.verseReference || '',
        verseBox.wInches || 4.00,
        verseBox.hInches || 0.94
      );
      replaceTxbxContentChildren(doc, verseBox.txbxContentEl, verseXml);
      setBodyPrAnchor(verseBox.bodyPrEl, 'ctr');
      removeFallbackIfPresent(verseBox);
    }
  }

  // 5. Pastor's Heart Message Box (Welcome & Closing are NEVER touched!)
  if (updateFlags.pastor) {
    const pastorBox = matched.get('pastor')?.candidate;
    if (!pastorBox) {
      throw new Error("Could not identify the Pastor's Heart message box in the uploaded .docx. Turn off Pastor's Heart update or switch to \"Create new from scratch\".");
    }
    if (bulletin) {
      const pastorXml = buildPastorMessageBoxContentXml(
        bulletin.pastorHeartText || '',
        pastorBox.wInches || 2.25,
        pastorBox.hInches || 4.38
      );
      replaceTxbxContentChildren(doc, pastorBox.txbxContentEl, pastorXml);
      setBodyPrAnchor(pastorBox.bodyPrEl, 't');
      removeFallbackIfPresent(pastorBox);
    }
  }

  // 6. Upcoming Events Box
  if (updateFlags.events) {
    const eventsBox = matched.get('events')?.candidate;
    if (!eventsBox) {
      throw new Error('Could not identify the Upcoming Events box in the uploaded .docx. Turn off Upcoming Events update or switch to "Create new from scratch".');
    }
    if (bulletin) {
      const eventsXml = buildEventsBoxContentXml(
        bulletin.upcomingEvents || [],
        eventsBox.wInches || 4.01,
        eventsBox.hInches || 1.69
      );
      replaceTxbxContentChildren(doc, eventsBox.txbxContentEl, eventsXml);
      setBodyPrAnchor(eventsBox.bodyPrEl, 'ctr');
      removeFallbackIfPresent(eventsBox);
    }
  }

  // 7. Birthdays Box
  if (updateFlags.birthdays) {
    const bdayBox = matched.get('birthdays')?.candidate;
    if (!bdayBox) {
      throw new Error('Could not identify the Birthdays box in the uploaded .docx. Turn off Birthdays update or switch to "Create new from scratch".');
    }
    if (bulletin) {
      const bdayBuilt = buildBirthdaysBoxContentXml(
        bulletin.bulletinDate || lessonDate,
        bulletin.birthdayCelebrators || [],
        bdayBox.wInches || 4.01,
        bdayBox.hInches || 1.73
      );
      replaceTxbxContentChildren(doc, bdayBox.txbxContentEl, bdayBuilt.contentXml);
      setBodyPrAnchor(bdayBox.bodyPrEl, bdayBuilt.isVerticallyCentered ? 'ctr' : 't');
      removeFallbackIfPresent(bdayBox);
    }
  }

  const serializer = new XMLSerializer();
  let finalXml = serializer.serializeToString(doc);
  // Ensure clean XML declaration matching standard WordprocessingML
  finalXml = finalXml.replace(/^<\?xml[^>]*\?>\s*/i, '');
  finalXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${finalXml}`;

  zip.file('word/document.xml', finalXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE'
  });
}
