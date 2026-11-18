/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ForerunnerFormatSettings } from '../types';
import { LessonParagraph, TextRun, parseHtmlToParagraphs } from './docxGenerator';

export interface SplitResult {
  page1Paragraphs: LessonParagraph[];
  page2Paragraphs: LessonParagraph[];
  optimalFontSize: number;
  blankLineSize: number;
  isOverflowing: boolean;
  overflowLines: number;
  p1LineCount: number;
  p2LineCount: number;
  maxP1Lines: number;
  maxP2Lines: number;
  breakLineIndex: number;
}

/**
 * Calculates characters per line based on text box width in inches and font size
 */
export function getCharsPerLine(widthInches: number, fontSize: number): number {
  // At 13pt Abadi, ~10.5 characters per inch.
  // Scale proportionally with font size.
  const baseCpi = 10.6 * (13 / fontSize);
  return Math.max(30, Math.floor(widthInches * baseCpi));
}

/**
 * Estimates how many visual lines a paragraph consumes given characters per line
 */
export function estimateParagraphLines(p: LessonParagraph, charsPerLine: number): number {
  if (p.isBlankLine) {
    return 1;
  }
  let totalText = p.runs.map(r => r.text).join('');
  if (p.listNumber) {
    totalText = p.listNumber + totalText;
  }
  if (!totalText.trim()) {
    return 1;
  }

  // Account for first-line indent reducing available width on the first line
  const indentOffset = p.isFirstLineIndent ? 4 : 0;
  const firstLineChars = Math.max(20, charsPerLine - indentOffset);

  if (totalText.length <= firstLineChars) {
    return 1;
  }

  const remainingChars = totalText.length - firstLineChars;
  return 1 + Math.ceil(remainingChars / charsPerLine);
}

/**
 * Splits a single paragraph into two at approximately targetLines
 */
export function splitParagraphAtLine(
  p: LessonParagraph,
  targetLinesOnP1: number,
  charsPerLineP1: number
): { p1Part: LessonParagraph; p2Part: LessonParagraph } {
  const fullText = p.runs.map(r => r.text).join('');
  const indentOffset = p.isFirstLineIndent ? 4 : 0;
  const firstLineChars = Math.max(20, charsPerLineP1 - indentOffset);
  const approxChars = firstLineChars + Math.max(0, targetLinesOnP1 - 1) * charsPerLineP1;

  // Find a word break near approxChars
  let splitIdx = approxChars;
  if (splitIdx < fullText.length) {
    // Look backward for a space or punctuation
    const lastSpace = fullText.lastIndexOf(' ', splitIdx);
    if (lastSpace > approxChars * 0.7) {
      splitIdx = lastSpace + 1;
    }
  } else {
    splitIdx = fullText.length;
  }

  const text1 = fullText.substring(0, splitIdx);
  const text2 = fullText.substring(splitIdx).trimStart();

  const p1Part: LessonParagraph = {
    runs: [{ text: text1, bold: p.runs[0]?.bold, italic: p.runs[0]?.italic, underline: p.runs[0]?.underline }],
    align: p.align,
    isFirstLineIndent: p.isFirstLineIndent,
    isList: p.isList,
    listNumber: p.listNumber
  };

  const p2Part: LessonParagraph = {
    runs: [{ text: text2, bold: p.runs[p.runs.length - 1]?.bold, italic: p.runs[p.runs.length - 1]?.italic, underline: p.runs[p.runs.length - 1]?.underline }],
    align: p.align,
    isFirstLineIndent: false // Continuation has NO first line indent!
  };

  return { p1Part, p2Part };
}

/**
 * Main calculation: computes line counts, selects the largest fitting font size (>= 12pt),
 * splits paragraphs between Page 1 and Page 2, and allows a line break offset.
 */
export function formatAndSplitLesson(
  html: string,
  settings: ForerunnerFormatSettings,
  userFontSizeOverride?: number,
  manualLineOffset: number = 0
): SplitResult {
  const targetAlign = (settings.defaultAlignment === 'justified' ? 'both' : settings.defaultAlignment) || 'both';
  const allParagraphs = parseHtmlToParagraphs(html, targetAlign);

  const p1PrintWidth = (settings.page1Width || 8.23) - 0.2;
  const p1PrintHeight = (settings.page1Height || 12.73) - 0.1;
  const p2PrintWidth = (settings.page2Width || 6.19) - 0.2;
  const p2PrintHeight = (settings.page2Height || 8.14) - 0.1;

  const minFont = Math.max(12, settings.minFontSize || 12);
  const maxFont = Math.max(minFont, settings.maxFontSize || 16);
  const startingFont = settings.startingFontSize || 13;
  const autoFit = settings.autoFitFontSize !== false;

  // Function to evaluate if all paragraphs fit at a given font size and blank line size
  function evaluateFit(fontSize: number, blankSize: number) {
    const lineHeight = fontSize * 1.18;
    const headerHeight = 2.2 * lineHeight + blankSize; // Series Title + Passage + blank line
    const p1AvailHeight = p1PrintHeight * 72 - headerHeight;
    const p2AvailHeight = p2PrintHeight * 72;

    const maxLinesP1 = Math.max(10, Math.floor(p1AvailHeight / lineHeight));
    const maxLinesP2 = Math.max(10, Math.floor(p2AvailHeight / lineHeight));
    const totalMaxLines = maxLinesP1 + maxLinesP2;

    const cplP1 = getCharsPerLine(p1PrintWidth, fontSize);
    const cplP2 = getCharsPerLine(p2PrintWidth, fontSize);

    // Sum estimated lines
    let totalLines = 0;
    for (const p of allParagraphs) {
      // Use average CPL for overall estimate
      totalLines += estimateParagraphLines(p, (cplP1 + cplP2) / 2);
    }

    return {
      fits: totalLines <= totalMaxLines,
      totalLines,
      totalMaxLines,
      maxLinesP1,
      maxLinesP2,
      cplP1,
      cplP2,
      lineHeight
    };
  }

  // Determine optimal font size:
  // User instructions: "Choose the LARGEST font size (in 0.5pt steps) at which the whole lesson
  // still fits in the two boxes together, up to maxFontSize (default 16), but never below 12pt."
  let chosenFontSize = startingFont;
  let chosenBlankLineSize = settings.blankLineSize || 10;
  let isOverflow = false;
  let overflowCount = 0;

  if (userFontSizeOverride && userFontSizeOverride >= minFont) {
    chosenFontSize = userFontSizeOverride;
    const evalResult = evaluateFit(chosenFontSize, chosenBlankLineSize);
    if (!evalResult.fits) {
      // Try shrinking blank line size
      chosenBlankLineSize = settings.minBlankLineSize || 4;
      const reEval = evaluateFit(chosenFontSize, chosenBlankLineSize);
      if (!reEval.fits) {
        isOverflow = true;
        overflowCount = reEval.totalLines - reEval.totalMaxLines;
      }
    }
  } else if (autoFit) {
    // Search from maxFont down to minFont (12pt) in 0.5 steps
    const candidateSizes: number[] = [];
    for (let s = maxFont; s >= minFont; s -= 0.5) {
      candidateSizes.push(Number(s.toFixed(1)));
    }

    let foundSize: number | null = null;
    for (const s of candidateSizes) {
      const evalRes = evaluateFit(s, chosenBlankLineSize);
      if (evalRes.fits) {
        foundSize = s;
        break; // Found the largest font size that fits!
      }
    }

    if (foundSize !== null) {
      chosenFontSize = foundSize;
    } else {
      // At minFont (12pt), try shrinking blank line size
      chosenFontSize = minFont;
      chosenBlankLineSize = settings.minBlankLineSize || 4;
      const reEval = evaluateFit(chosenFontSize, chosenBlankLineSize);
      if (!reEval.fits) {
        isOverflow = true;
        overflowCount = reEval.totalLines - reEval.totalMaxLines;
      }
    }
  } else {
    // Manual/fixed starting font size
    chosenFontSize = Math.min(maxFont, Math.max(minFont, startingFont));
    const evalRes = evaluateFit(chosenFontSize, chosenBlankLineSize);
    if (!evalRes.fits) {
      chosenBlankLineSize = settings.minBlankLineSize || 4;
      const reEval = evaluateFit(chosenFontSize, chosenBlankLineSize);
      if (!reEval.fits) {
        isOverflow = true;
        overflowCount = reEval.totalLines - reEval.totalMaxLines;
      }
    }
  }

  // Now calculate exact line allocation with chosen font size and manualLineOffset
  const finalEval = evaluateFit(chosenFontSize, chosenBlankLineSize);
  const targetP1Lines = Math.max(5, finalEval.maxLinesP1 + manualLineOffset);

  const page1Paragraphs: LessonParagraph[] = [];
  const page2Paragraphs: LessonParagraph[] = [];

  let currentP1Lines = 0;
  let splitHappened = false;

  for (let i = 0; i < allParagraphs.length; i++) {
    const p = allParagraphs[i];

    if (splitHappened) {
      page2Paragraphs.push(p);
      continue;
    }

    const pLinesP1 = estimateParagraphLines(p, finalEval.cplP1);

    if (currentP1Lines + pLinesP1 <= targetP1Lines) {
      page1Paragraphs.push(p);
      currentP1Lines += pLinesP1;
    } else {
      // This paragraph causes page 1 to overflow
      const remainingP1Lines = targetP1Lines - currentP1Lines;
      if (remainingP1Lines >= 2 && pLinesP1 > 2) {
        // Split inside paragraph!
        const { p1Part, p2Part } = splitParagraphAtLine(p, remainingP1Lines, finalEval.cplP1);
        page1Paragraphs.push(p1Part);
        page2Paragraphs.push(p2Part);
        currentP1Lines += remainingP1Lines;
      } else {
        // Move entire paragraph to page 2
        page2Paragraphs.push(p);
      }
      splitHappened = true;
    }
  }

  // Calculate actual lines in page 2
  let currentP2Lines = 0;
  for (const p of page2Paragraphs) {
    currentP2Lines += estimateParagraphLines(p, finalEval.cplP2);
  }

  if (currentP2Lines > finalEval.maxLinesP2) {
    isOverflow = true;
    overflowCount = currentP2Lines - finalEval.maxLinesP2;
  }

  return {
    page1Paragraphs,
    page2Paragraphs,
    optimalFontSize: chosenFontSize,
    blankLineSize: chosenBlankLineSize,
    isOverflowing: isOverflow,
    overflowLines: Math.max(0, overflowCount),
    p1LineCount: currentP1Lines,
    p2LineCount: currentP2Lines,
    maxP1Lines: finalEval.maxLinesP1,
    maxP2Lines: finalEval.maxLinesP2,
    breakLineIndex: targetP1Lines
  };
}

/**
 * Smart formatting and cleanup for Sunday School lessons:
 * - turns **text** into bold, *text* into italic, <u>text</u> into underline, and cleans leftover symbols
 * - turns lines like "1." / "2." (or "a." / "b.") into proper numbered or lettered list (<ol> / <ol type="a">)
 * - treats blank lines as paragraph breaks, and joins broken sentence lines into one paragraph
 * - keeps a subheading and its body text on the SAME line when they are in the same paragraph
 * - removes extra spaces, weird symbols, and applies alignment from Format Settings
 * - accepts rich text from Word or web page while preserving bold, italic and underline
 * - preserves original wording and spelling intact
 */
export function cleanAndFormatLessonText(
  input: string,
  options?: { defaultAlignment?: 'justified' | 'left' | 'center' | 'right' }
): string {
  if (!input || !input.trim()) {
    return '<p></p>';
  }

  const alignment = options?.defaultAlignment === 'left' ? 'left' :
                    options?.defaultAlignment === 'center' ? 'center' :
                    options?.defaultAlignment === 'right' ? 'right' : 'justify';

  function convertInlineMarkdown(text: string): string {
    let res = text;
    // Replace **bold** or __bold__
    res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Replace *italic* or _italic_
    res = res.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
    res = res.replace(/(^|[^_])_(?!_)([^_]+?)_(?!_)/g, '$1<em>$2</em>');
    // Clean leftover markdown symbols and backticks
    res = res.replace(/\*\*/g, '').replace(/```[a-z]*/gi, '').replace(/`/g, '');
    return res;
  }

  const isHtml = /<\/?[a-z][\s\S]*>/i.test(input);
  let rawLines: string[] = [];

  if (isHtml && typeof window !== 'undefined') {
    const parser = new DOMParser();
    const preCleaned = input
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');

    const doc = parser.parseFromString(preCleaned, 'text/html');
    const body = doc.body;

    function serializeNode(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        let inner = '';
        for (let i = 0; i < el.childNodes.length; i++) {
          inner += serializeNode(el.childNodes[i]);
        }
        if (!inner) return '';

        const isBold = tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight, 10) >= 600;
        const isItalic = tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic';
        const isUnderline = tag === 'u' || el.style.textDecoration.includes('underline');

        let res = inner;
        if (isUnderline) res = `<u>${res}</u>`;
        if (isItalic) res = `<em>${res}</em>`;
        if (isBold) res = `<strong>${res}</strong>`;
        return res;
      }
      return '';
    }

    const blocks: string[] = [];
    function extractBlocks(parent: Node) {
      for (let i = 0; i < parent.childNodes.length; i++) {
        const child = parent.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
          const txt = child.textContent?.trim();
          if (txt) blocks.push(txt);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          const tag = el.tagName.toLowerCase();
          if (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag) || tag === 'li' || tag === 'blockquote') {
            const content = serializeNode(el).trim();
            if (content) {
              blocks.push(content);
            } else {
              blocks.push(''); // blank line
            }
          } else if (tag === 'br') {
            blocks.push('');
          } else if (tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'tbody' || tag === 'article' || tag === 'section') {
            extractBlocks(el);
          } else {
            const content = serializeNode(el).trim();
            if (content) blocks.push(content);
          }
        }
      }
    }

    extractBlocks(body);
    rawLines = blocks;
  } else {
    rawLines = input.split(/\r?\n/);
  }

  interface ParagraphItem {
    type: 'paragraph' | 'list' | 'blank';
    listType?: 'ol' | 'ol-a' | 'ul';
    listPrefix?: string;
    text: string;
  }

  // Regex to detect list prefix like "1.", "1)", "2.", "a.", "b.", "A.", "B.", "•", "-", "*"
  const listRegex = /^(\s*)([0-9]+[.)]|[a-zA-Z][.)]|•|\*|-)\s+(.*)$/;
  // Verse/major section heading regex like "V. 1-3", "V. 4 -", "Verse 1", "NOTE:", "INTRODUCTION"
  const headingRegex = /^(\s*)(?:V\.\s*\d+|Verse\s*\d+|NOTE:|CONCLUSION:|[IVXLCDM]+\.)/i;

  const paragraphs: ParagraphItem[] = [];
  let currentPara: string = '';

  function flushCurrentPara() {
    if (currentPara.trim()) {
      paragraphs.push({
        type: 'paragraph',
        text: currentPara.trim()
      });
      currentPara = '';
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();

    if (!rawLine) {
      flushCurrentPara();
      if (paragraphs.length > 0 && paragraphs[paragraphs.length - 1].type !== 'blank') {
        paragraphs.push({ type: 'blank', text: '' });
      }
      continue;
    }

    // Check if line is a list item
    const listMatch = rawLine.match(listRegex);
    if (listMatch) {
      flushCurrentPara();
      const prefix = listMatch[2];
      const itemContent = listMatch[3];

      let listType: 'ol' | 'ol-a' | 'ul' = 'ol';
      if (/^[a-zA-Z][.)]/.test(prefix)) {
        listType = 'ol-a';
      } else if (/^[•*-]/.test(prefix)) {
        listType = 'ul';
      }

      paragraphs.push({
        type: 'list',
        listType,
        listPrefix: prefix,
        text: itemContent
      });
      continue;
    }

    if (currentPara) {
      if (headingRegex.test(rawLine)) {
        flushCurrentPara();
        currentPara = rawLine;
      } else {
        // Same paragraph: join lines broken in the middle of a sentence or subheading with body
        currentPara += ' ' + rawLine;
      }
    } else {
      currentPara = rawLine;
    }
  }

  flushCurrentPara();

  const htmlOutput: string[] = [];
  let openListType: 'ol' | 'ol-a' | 'ul' | null = null;

  function closeOpenList() {
    if (openListType) {
      htmlOutput.push(openListType === 'ul' ? '</ul>' : '</ol>');
      openListType = null;
    }
  }

  for (const item of paragraphs) {
    if (item.type === 'blank') {
      closeOpenList();
      htmlOutput.push('<p><br></p>');
      continue;
    }

    if (item.type === 'list') {
      if (openListType !== item.listType) {
        closeOpenList();
        if (item.listType === 'ol-a') {
          htmlOutput.push('<ol type="a">');
        } else if (item.listType === 'ul') {
          htmlOutput.push('<ul>');
        } else {
          htmlOutput.push('<ol>');
        }
        openListType = item.listType || 'ol';
      }

      let content = convertInlineMarkdown(item.text);
      content = content.replace(/\s{2,}/g, ' ').trim();
      htmlOutput.push(`<li>${content}</li>`);
      continue;
    }

    closeOpenList();
    let content = convertInlineMarkdown(item.text);
    content = content.replace(/\s{2,}/g, ' ').trim();

    htmlOutput.push(`<p style="text-align: ${alignment};">${content}</p>`);
  }

  closeOpenList();

  return htmlOutput.join('') || '<p></p>';
}
