/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import {
  ForerunnerFormatSettings,
  ForerunnerBulletin,
  DEFAULT_BULLETIN_POSITIONS,
  FIXED_BULLETIN_BOXES
} from '../types';
import {
  formatSundayBulletinDate,
  formatVerseWithCurlyQuotes,
  calcDateFontSize,
  calcVerseFontSize,
  calcEventsLayout,
  calcBirthdayTableLayout,
  calcPastorMessageLayout,
  groupBirthdaysForColumns
} from './bulletinHelpers';

/**
 * Escapes text for XML
 */
export function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface LessonParagraph {
  runs: TextRun[];
  align?: 'left' | 'center' | 'right' | 'both';
  isFirstLineIndent?: boolean;
  isBlankLine?: boolean;
  isList?: boolean;
  listNumber?: string;
}

/**
 * Converts rich text HTML into an array of LessonParagraph structures
 */
export function parseHtmlToParagraphs(
  html: string,
  defaultAlign: 'left' | 'center' | 'right' | 'both' = 'both'
): LessonParagraph[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body;

  const paragraphs: LessonParagraph[] = [];

  function processNode(node: Node, currentRuns: TextRun[], state: { bold: boolean; italic: boolean; underline: boolean }) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) {
        currentRuns.push({
          text,
          bold: state.bold,
          italic: state.italic,
          underline: state.underline
        });
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      const newBold = state.bold || tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold';
      const newItalic = state.italic || tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic';
      const newUnderline = state.underline || tag === 'u' || el.style.textDecoration.includes('underline');

      if (tag === 'p' || tag === 'div' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'li') {
        const pRuns: TextRun[] = [];
        const isIndent = el.classList.contains('indent') || el.style.textIndent !== '' || el.getAttribute('data-indent') === 'true';
        let align = defaultAlign;
        if (el.style.textAlign === 'center') align = 'center';
        else if (el.style.textAlign === 'right') align = 'right';
        else if (el.style.textAlign === 'left') align = 'left';
        else if (el.style.textAlign === 'justify') align = 'both';

        for (let i = 0; i < el.childNodes.length; i++) {
          processNode(el.childNodes[i], pRuns, { bold: newBold, italic: newItalic, underline: newUnderline });
        }

        const textContent = el.textContent?.trim() || '';
        if (textContent.length === 0) {
          paragraphs.push({ runs: [], isBlankLine: true });
        } else {
          paragraphs.push({
            runs: pRuns,
            align,
            isFirstLineIndent: isIndent,
            isList: tag === 'li'
          });
        }
        return;
      }

      // Inline children
      for (let i = 0; i < el.childNodes.length; i++) {
        processNode(el.childNodes[i], currentRuns, { bold: newBold, italic: newItalic, underline: newUnderline });
      }
    }
  }

  // Iterate top level children
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'ol' || tag === 'ul') {
        const isAlpha = el.getAttribute('type') === 'a' || el.getAttribute('type') === 'A';
        let num = 1;
        for (let j = 0; j < el.children.length; j++) {
          const li = el.children[j];
          const pRuns: TextRun[] = [];
          for (let k = 0; k < li.childNodes.length; k++) {
            processNode(li.childNodes[k], pRuns, { bold: false, italic: false, underline: false });
          }
          const prefix = tag === 'ul'
            ? '• '
            : isAlpha
              ? `${String.fromCharCode(96 + num++)}. `
              : `${num++}. `;

          paragraphs.push({
            runs: pRuns,
            align: defaultAlign,
            isList: true,
            listNumber: prefix
          });
        }
        continue;
      }
    }
    const runs: TextRun[] = [];
    processNode(child, runs, { bold: false, italic: false, underline: false });
    if (runs.length > 0) {
      paragraphs.push({
        runs,
        align: defaultAlign,
        isFirstLineIndent: true
      });
    }
  }

  // If no paragraphs created, create one from root text
  if (paragraphs.length === 0 && root.textContent?.trim()) {
    paragraphs.push({
      runs: [{ text: root.textContent.trim() }],
      align: defaultAlign,
      isFirstLineIndent: true
    });
  }

  return paragraphs;
}

/**
 * Builds XML string for a single Word paragraph (<w:p>)
 */
export function buildWordParagraphXml(
  p: LessonParagraph,
  fontSizeHalfPt: number,
  fontName: string,
  blankLineHalfPt: number = 20,
  forceNoIndent: boolean = false
): string {
  if (p.isBlankLine) {
    return `<w:p>
  <w:pPr>
    <w:spacing w:line="${blankLineHalfPt * 12}" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}"/>
      <w:sz w:val="${blankLineHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve"> </w:t>
  </w:r>
</w:p>`;
  }

  const jcVal = p.align || 'both';
  const hasIndent = p.isFirstLineIndent && !forceNoIndent;
  const indXml = hasIndent
    ? `<w:ind w:firstLine="360"/>`
    : p.isList
    ? `<w:ind w:left="360" w:hanging="360"/>`
    : `<w:ind w:firstLine="0"/>`;

  let runsXml = '';
  if (p.isList && p.listNumber) {
    runsXml += `<w:r>
  <w:rPr>
    <w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}"/>
    <w:sz w:val="${fontSizeHalfPt}"/>
    <w:szCs w:val="${fontSizeHalfPt}"/>
    <w:b/>
  </w:rPr>
  <w:t xml:space="preserve">${escapeXml(p.listNumber)}</w:t>
</w:r>`;
  }

  for (const r of p.runs) {
    if (!r.text) continue;
    const rPrParts: string[] = [
      `<w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}"/>`,
      `<w:sz w:val="${fontSizeHalfPt}"/>`,
      `<w:szCs w:val="${fontSizeHalfPt}"/>`
    ];
    if (r.bold) rPrParts.push('<w:b/>');
    if (r.italic) rPrParts.push('<w:i/>');
    if (r.underline) rPrParts.push('<w:u w:val="single"/>');

    runsXml += `<w:r>
  <w:rPr>${rPrParts.join('')}</w:rPr>
  <w:t xml:space="preserve">${escapeXml(r.text)}</w:t>
</w:r>`;
  }

  return `<w:p>
  <w:pPr>
    <w:jc w:val="${jcVal}"/>
    ${indXml}
    <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  ${runsXml}
</w:p>`;
}

export interface GenerateDocxOptions {
  seriesTitle: string;
  passage: string;
  page1Paragraphs: LessonParagraph[];
  page2Paragraphs: LessonParagraph[];
  fontSize: number; // pt, e.g. 13
  blankLineSize?: number; // pt, e.g. 10
  settings: ForerunnerFormatSettings;
  bulletin?: ForerunnerBulletin | null;
  backgroundImageData?: string | null;
}

/**
 * Builds the DrawingML XML for an unbordered, unfilled text box on Page 2
 */
function buildTextBoxShapeXml(
  id: number,
  name: string,
  xEmu: number,
  yEmu: number,
  wEmu: number,
  hEmu: number,
  relHeight: number,
  contentXml: string,
  vAlign: 'top' | 'ctr' = 'top',
  lInsEmu: number = 91440, // 0.1 inch default
  tInsEmu: number = 45720, // 0.05 inch default
  rInsEmu: number = 91440, // 0.1 inch default
  bInsEmu: number = 45720  // 0.05 inch default
): string {
  const anchorAttr = vAlign === 'ctr' ? ' anchor="ctr"' : '';
  return `<w:r>
  <w:drawing>
    <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${relHeight}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="page">
        <wp:posOffset>${xEmu}</wp:posOffset>
      </wp:positionH>
      <wp:positionV relativeFrom="page">
        <wp:posOffset>${yEmu}</wp:posOffset>
      </wp:positionV>
      <wp:extent cx="${wEmu}" cy="${hEmu}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="${id}" name="${escapeXml(name)}"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic>
        <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:wsp>
            <wps:cNvSpPr txBox="1"/>
            <wps:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="${wEmu}" cy="${hEmu}"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              <a:noFill/>
              <a:ln><a:noFill/></a:ln>
            </wps:spPr>
            <wps:txbx>
              <w:txbxContent>
                ${contentXml}
              </w:txbxContent>
            </wps:txbx>
            <wps:bodyPr lIns="${lInsEmu}" tIns="${tInsEmu}" rIns="${rInsEmu}" bIns="${bInsEmu}"${anchorAttr}/>
          </wps:wsp>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing>
</w:r>`;
}

export function buildLessonHeaderXml(
  seriesTitle: string,
  passage: string,
  fontName: string,
  fontSizeHalfPt: number,
  blankLineHalfPt: number,
  keepFirstParagraphXml?: string | null
): string {
  const firstPara = keepFirstParagraphXml
    ? keepFirstParagraphXml
    : `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}"/>
      <w:b/>
      <w:u w:val="single"/>
      <w:sz w:val="${fontSizeHalfPt}"/>
      <w:szCs w:val="${fontSizeHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(seriesTitle)}</w:t>
  </w:r>
</w:p>`;

  return `${firstPara}
<w:p>
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
</w:p>`;
}

export function buildDateBoxContentXml(dateText: string, wInches: number, hInches: number): string {
  const datePt = calcDateFontSize(dateText, wInches, hInches);
  const dateHalfPt = Math.round(datePt * 2);
  return `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Franklin Gothic Medium" w:hAnsi="Franklin Gothic Medium"/>
      <w:b/>
      <w:color w:val="FFFFFF"/>
      <w:sz w:val="${dateHalfPt}"/>
      <w:szCs w:val="${dateHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(dateText)}</w:t>
  </w:r>
</w:p>`;
}

export function buildVerseBoxContentXml(
  verseText: string,
  verseReference: string,
  wInches: number,
  hInches: number
): string {
  const verseLayout = calcVerseFontSize(verseText, verseReference, wInches, hInches);
  const verseHalfPt = Math.round(verseLayout.fontSize * 2);
  return `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="210" w:lineRule="auto" w:before="0" w:after="30"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Mongolian Baiti" w:hAnsi="Mongolian Baiti"/>
      <w:sz w:val="${verseHalfPt}"/>
      <w:szCs w:val="${verseHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(verseLayout.verseFormatted)}</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="190" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Mongolian Baiti" w:hAnsi="Mongolian Baiti"/>
      <w:b/>
      <w:sz w:val="${verseHalfPt}"/>
      <w:szCs w:val="${verseHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(verseReference || '')}</w:t>
  </w:r>
</w:p>`;
}

export function buildPastorMessageBoxContentXml(
  pastorHeartText: string,
  wInches: number,
  hInches: number
): string {
  const pastorLayout = calcPastorMessageLayout(pastorHeartText, wInches, hInches);
  const pastorHalfPt = Math.round(pastorLayout.fontSize * 2);
  const pastorBodyXml = pastorLayout.paragraphs.map(p => `<w:p>
  <w:pPr>
    <w:jc w:val="both"/>
    <w:ind w:firstLine="432"/>
    <w:spacing w:line="210" w:lineRule="auto" w:before="0" w:after="70"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Franklin Gothic Book" w:hAnsi="Franklin Gothic Book"/>
      <w:sz w:val="${pastorHalfPt}"/>
      <w:szCs w:val="${pastorHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(p)}</w:t>
  </w:r>
</w:p>`).join('\n');

  return pastorBodyXml || `<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Franklin Gothic Book" w:hAnsi="Franklin Gothic Book"/><w:sz w:val="${pastorHalfPt}"/><w:szCs w:val="${pastorHalfPt}"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
}

export function buildEventsBoxContentXml(
  upcomingEvents: ForerunnerBulletin['upcomingEvents'],
  wInches: number,
  hInches: number
): string {
  const visibleEvents = (upcomingEvents || []).filter(e => !e.hidden).slice(0, 3);
  const eventsLayout = calcEventsLayout(visibleEvents, wInches, hInches);
  const eventsTitleHalfPt = Math.round(eventsLayout.titleFontSize * 2);
  const eventsDetailHalfPt = Math.round(eventsLayout.detailFontSize * 2);
  const eventsGapDxa = Math.round(eventsLayout.eventSpacingInches * 1440);

  const eventsXmlParts: string[] = [];
  for (let i = 0; i < visibleEvents.length; i++) {
    const ev = visibleEvents[i];
    const beforeDxa = i > 0 ? eventsGapDxa : 0;

    if (ev.isGrouped && ev.subLines && ev.subLines.length > 0) {
      let groupXml = `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="210" w:lineRule="auto" w:before="${beforeDxa}" w:after="20"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Leelawadee" w:hAnsi="Leelawadee"/>
      <w:b/>
      <w:sz w:val="${eventsTitleHalfPt}"/>
      <w:szCs w:val="${eventsTitleHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(ev.title)}</w:t>
  </w:r>
</w:p>`;
      for (const sub of ev.subLines) {
        const subText = sub.location?.trim()
          ? `${sub.dateStr} (${sub.weekdayStr}) - ${sub.location.trim()}`
          : `${sub.dateStr} (${sub.weekdayStr})`;
        groupXml += `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="190" w:lineRule="auto" w:before="0" w:after="10"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Leelawadee" w:hAnsi="Leelawadee"/>
      <w:sz w:val="${eventsDetailHalfPt}"/>
      <w:szCs w:val="${eventsDetailHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(subText)}</w:t>
  </w:r>
</w:p>`;
      }
      eventsXmlParts.push(groupXml);
    } else {
      eventsXmlParts.push(`<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="210" w:lineRule="auto" w:before="${beforeDxa}" w:after="10"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Leelawadee" w:hAnsi="Leelawadee"/>
      <w:b/>
      <w:sz w:val="${eventsTitleHalfPt}"/>
      <w:szCs w:val="${eventsTitleHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(ev.dateStr || '')}</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="200" w:lineRule="auto" w:before="0" w:after="20"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Leelawadee" w:hAnsi="Leelawadee"/>
      <w:sz w:val="${eventsDetailHalfPt}"/>
      <w:szCs w:val="${eventsDetailHalfPt}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(ev.title)}</w:t>
  </w:r>
</w:p>`);
    }
  }

  return eventsXmlParts.length > 0
    ? eventsXmlParts.join('\n')
    : `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Leelawadee" w:hAnsi="Leelawadee"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>No upcoming calendar events</w:t></w:r></w:p>`;
}

export function buildBirthdaysBoxContentXml(
  bulletinDate: string,
  birthdayCelebrators: ForerunnerBulletin['birthdayCelebrators'],
  wInches: number,
  hInches: number
): { contentXml: string; isVerticallyCentered: boolean } {
  const [y, m] = (bulletinDate || '').split('-').map(Number);
  const dateObj = new Date(y || 2026, (m || 1) - 1, 1);
  const monthCapitals = dateObj.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

  const bdayLayout = calcBirthdayTableLayout(birthdayCelebrators || [], wInches, hInches);
  const bdayHalfPt = Math.round(bdayLayout.fontSize * 2);

  let bdayTableRowsXml = '';
  for (let r = 0; r < bdayLayout.maxRows; r++) {
    const left = bdayLayout.leftGroups[r];
    const right = bdayLayout.rightGroups[r];

    const lDayText = left ? String(left.day) : '';
    const lNamesXml = left && left.names && left.names.length > 0
      ? left.names.map(n => `<w:r><w:rPr><w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/><w:sz w:val="${bdayHalfPt}"/><w:szCs w:val="${bdayHalfPt}"/></w:rPr><w:t xml:space="preserve">${escapeXml(n)}</w:t></w:r>`).join('<w:r><w:br/></w:r>')
      : '';

    const rDayText = right ? String(right.day) : '';
    const rNamesXml = right && right.names && right.names.length > 0
      ? right.names.map(n => `<w:r><w:rPr><w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/><w:sz w:val="${bdayHalfPt}"/><w:szCs w:val="${bdayHalfPt}"/></w:rPr><w:t xml:space="preserve">${escapeXml(n)}</w:t></w:r>`).join('<w:r><w:br/></w:r>')
      : '';

    bdayTableRowsXml += `
<w:tr>
  <w:tc>
    <w:tcPr>
      <w:tcW w:w="420" w:type="dxa"/>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:line="180" w:lineRule="auto" w:before="0" w:after="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/>
          <w:b/>
          <w:sz w:val="${bdayHalfPt}"/>
          <w:szCs w:val="${bdayHalfPt}"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(lDayText)}</w:t>
      </w:r>
    </w:p>
  </w:tc>
  <w:tc>
    <w:tcPr>
      <w:tcW w:w="2320" w:type="dxa"/>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p>
      <w:pPr>
        <w:jc w:val="left"/>
        <w:spacing w:line="180" w:lineRule="auto" w:before="0" w:after="0"/>
      </w:pPr>
      ${lNamesXml}
    </w:p>
  </w:tc>
  <w:tc>
    <w:tcPr>
      <w:tcW w:w="420" w:type="dxa"/>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:line="180" w:lineRule="auto" w:before="0" w:after="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/>
          <w:b/>
          <w:sz w:val="${bdayHalfPt}"/>
          <w:szCs w:val="${bdayHalfPt}"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(rDayText)}</w:t>
      </w:r>
    </w:p>
  </w:tc>
  <w:tc>
    <w:tcPr>
      <w:tcW w:w="2320" w:type="dxa"/>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p>
      <w:pPr>
        <w:jc w:val="left"/>
        <w:spacing w:line="180" w:lineRule="auto" w:before="0" w:after="0"/>
      </w:pPr>
      ${rNamesXml}
    </w:p>
  </w:tc>
</w:tr>`;
  }

  const contentXml = `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="20"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/>
      <w:b/>
      <w:sz w:val="32"/>
      <w:szCs w:val="32"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(monthCapitals)}</w:t>
  </w:r>
</w:p>
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5480" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="30" w:type="dxa"/>
      <w:bottom w:w="30" w:type="dxa"/>
      <w:left w:w="40" w:type="dxa"/>
      <w:right w:w="40" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="420"/>
    <w:gridCol w:w="2320"/>
    <w:gridCol w:w="420"/>
    <w:gridCol w:w="2320"/>
  </w:tblGrid>
  ${bdayTableRowsXml}
</w:tbl>
<w:p>
  <w:pPr>
    <w:spacing w:line="20" w:lineRule="exact" w:before="0" w:after="0"/>
  </w:pPr>
</w:p>`;

  return { contentXml, isVerticallyCentered: bdayLayout.isVerticallyCentered };
}

/**
 * Generates the complete .docx binary Blob using JSZip
 */
export async function generateForerunnerDocx(options: GenerateDocxOptions): Promise<Blob> {
  const {
    seriesTitle,
    passage,
    page1Paragraphs,
    page2Paragraphs,
    fontSize,
    blankLineSize = 10,
    settings,
    bulletin,
    backgroundImageData
  } = options;

  const fontName = settings.fontName || 'Abadi';
  const fontSizeHalfPt = Math.round(fontSize * 2);
  const blankLineHalfPt = Math.round(blankLineSize * 2);

  // Convert dimensions to EMU: 1 inch = 914400 EMU
  const p1WidthEmu = Math.round((settings.page1Width || 8.23) * 914400);
  const p1HeightEmu = Math.round((settings.page1Height || 12.73) * 914400);
  const p2WidthEmu = Math.round((settings.page2Width || 6.19) * 914400);
  const p2HeightEmu = Math.round((settings.page2Height || 8.14) * 914400);

  // Center on Page 1: Portrait 8.5" x 13" (7772400 x 11887200 EMU)
  const p1OffsetX = Math.max(0, Math.round((7772400 - p1WidthEmu) / 2));
  const p1OffsetY = Math.max(0, Math.round((11887200 - p1HeightEmu) / 2));

  // Top Left on Page 2: Margin 0.12" = 109728 EMU
  const p2OffsetX = Math.round((settings.margins || 0.12) * 914400);
  const p2OffsetY = Math.round((settings.margins || 0.12) * 914400);

  // Border 0.5pt = 6350 EMU
  const borderXml = settings.border !== false
    ? `<a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`;

  // Build Page 1 Header XML:
  const headerXml = buildLessonHeaderXml(seriesTitle, passage, fontName, fontSizeHalfPt, blankLineHalfPt);

  // Page 1 lesson content paragraphs
  const page1ContentXml = page1Paragraphs
    .map(p => buildWordParagraphXml(p, fontSizeHalfPt, fontName, blankLineHalfPt))
    .join('\n');

  // Page 2 continuation paragraphs (first continuation paragraph has no first line indent)
  const page2ContentXml = page2Paragraphs
    .map((p, idx) => buildWordParagraphXml(p, fontSizeHalfPt, fontName, blankLineHalfPt, idx === 0))
    .join('\n');

  // Check if bulletin and background image should be rendered
  const hasBulletin = Boolean(bulletin && backgroundImageData);
  const positions = settings.bulletinPositions || DEFAULT_BULLETIN_POSITIONS;

  let bgPictureXml = '';
  let bulletinBoxesXml = '';

  if (hasBulletin && bulletin) {
    // 1. Background picture drawing XML (behindDoc="1", lowest layer relativeHeight="0")
    // Covers full 13" x 8.5" page = 11887200 x 7772400 EMU
    bgPictureXml = `<w:r>
  <w:drawing>
    <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="page">
        <wp:posOffset>0</wp:posOffset>
      </wp:positionH>
      <wp:positionV relativeFrom="page">
        <wp:posOffset>0</wp:posOffset>
      </wp:positionV>
      <wp:extent cx="11887200" cy="7772400"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="10" name="Bulletin Background"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="0" name="Page 2 Background"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="rIdBg" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="11887200" cy="7772400"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing>
</w:r>`;

    // FIXED BOX 1: WELCOME (Times New Roman 22pt, italic, centered horizontally & vertically)
    const welcomeFixed = FIXED_BULLETIN_BOXES.welcome;
    const welcomeContentXml = `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
      <w:i/>
      <w:sz w:val="44"/>
      <w:szCs w:val="44"/>
    </w:rPr>
    <w:t>Welcome!</w:t>
  </w:r>
</w:p>`;
    const welcomeBoxXml = buildTextBoxShapeXml(
      19,
      'Bulletin Welcome Box',
      Math.round(welcomeFixed.x * 914400),
      Math.round(welcomeFixed.y * 914400),
      Math.round(welcomeFixed.w * 914400),
      Math.round(welcomeFixed.h * 914400),
      251658241,
      welcomeContentXml,
      'ctr'
    );

    // FIXED BOX 2: PASTOR CLOSING & SIGNATURE
    const closingFixed = FIXED_BULLETIN_BOXES.closing;
    const closingContentXml = `<w:p>
  <w:pPr>
    <w:jc w:val="left"/>
    <w:spacing w:line="200" w:lineRule="auto" w:before="0" w:after="20"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Franklin Gothic Medium" w:hAnsi="Franklin Gothic Medium"/>
      <w:b/>
      <w:i/>
      <w:sz w:val="20"/>
      <w:szCs w:val="20"/>
    </w:rPr>
    <w:t xml:space="preserve">Have a wonderful Lord&apos;s Day!</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:jc w:val="right"/>
    <w:spacing w:line="180" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Bodoni MT" w:hAnsi="Bodoni MT"/>
      <w:b/>
      <w:i/>
      <w:sz w:val="16"/>
      <w:szCs w:val="16"/>
    </w:rPr>
    <w:t xml:space="preserve">Ptr. Claus P. Esden</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:jc w:val="right"/>
    <w:spacing w:line="170" w:lineRule="auto" w:before="0" w:after="0"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Franklin Gothic Book" w:hAnsi="Franklin Gothic Book"/>
      <w:i/>
      <w:sz w:val="16"/>
      <w:szCs w:val="16"/>
    </w:rPr>
    <w:t xml:space="preserve">Pastor of LBBC Ministries</w:t>
  </w:r>
</w:p>`;
    const closingBoxXml = buildTextBoxShapeXml(
      25,
      'Bulletin Pastor Closing Box',
      Math.round(closingFixed.x * 914400),
      Math.round(closingFixed.y * 914400),
      Math.round(closingFixed.w * 914400),
      Math.round(closingFixed.h * 914400),
      251658248,
      closingContentXml,
      'ctr'
    );

    // DYNAMIC BOX 1: DATE
    const dateText = bulletin.customDateText || formatSundayBulletinDate(bulletin.bulletinDate);
    const dateContentXml = buildDateBoxContentXml(dateText, positions.date.w, positions.date.h);
    const dateBoxXml = buildTextBoxShapeXml(
      20,
      'Bulletin Date Box',
      Math.round(positions.date.x * 914400),
      Math.round(positions.date.y * 914400),
      Math.round(positions.date.w * 914400),
      Math.round(positions.date.h * 914400),
      251658242,
      dateContentXml,
      'ctr'
    );

    // DYNAMIC BOX 2: VERSE OF THE WEEK
    const verseContentXml = buildVerseBoxContentXml(
      bulletin.verseText || '',
      bulletin.verseReference || '',
      positions.verse.w,
      positions.verse.h
    );
    const verseBoxXml = buildTextBoxShapeXml(
      21,
      'Bulletin Verse Box',
      Math.round(positions.verse.x * 914400),
      Math.round(positions.verse.y * 914400),
      Math.round(positions.verse.w * 914400),
      Math.round(positions.verse.h * 914400),
      251658243,
      verseContentXml,
      'ctr'
    );

    // DYNAMIC BOX 3: PASTOR'S HEART MESSAGE (BODY ONLY)
    const pastorBodyXml = buildPastorMessageBoxContentXml(
      bulletin.pastorHeartText || '',
      positions.pastor.w,
      positions.pastor.h
    );
    const pastorBoxXml = buildTextBoxShapeXml(
      22,
      'Bulletin Pastor Message Box',
      Math.round(positions.pastor.x * 914400),
      Math.round(positions.pastor.y * 914400),
      Math.round(positions.pastor.w * 914400),
      Math.round(positions.pastor.h * 914400),
      251658244,
      pastorBodyXml,
      'top'
    );

    // DYNAMIC BOX 4: UPCOMING EVENTS
    const eventsContentXml = buildEventsBoxContentXml(
      bulletin.upcomingEvents || [],
      positions.events.w,
      positions.events.h
    );
    const eventsBoxXml = buildTextBoxShapeXml(
      23,
      'Bulletin Events Box',
      Math.round(positions.events.x * 914400),
      Math.round(positions.events.y * 914400),
      Math.round(positions.events.w * 914400),
      Math.round(positions.events.h * 914400),
      251658245,
      eventsContentXml,
      'ctr'
    );

    // DYNAMIC BOX 5: BIRTHDAY CELEBRATORS
    const bdayBuilt = buildBirthdaysBoxContentXml(
      bulletin.bulletinDate || '',
      bulletin.birthdayCelebrators || [],
      positions.birthdays.w,
      positions.birthdays.h
    );
    const bdayBoxXml = buildTextBoxShapeXml(
      24,
      'Bulletin Birthdays Box',
      Math.round(positions.birthdays.x * 914400),
      Math.round(positions.birthdays.y * 914400),
      Math.round(positions.birthdays.w * 914400),
      Math.round(positions.birthdays.h * 914400),
      251658246,
      bdayBuilt.contentXml,
      bdayBuilt.isVerticallyCentered ? 'ctr' : 'top'
    );

    // Combine all 2 fixed boxes and 5 dynamic boxes
    bulletinBoxesXml = `${welcomeBoxXml}\n${closingBoxXml}\n${dateBoxXml}\n${verseBoxXml}\n${pastorBoxXml}\n${eventsBoxXml}\n${bdayBoxXml}`;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
  <w:body>
    <!-- SECTION 1: Page 1 Text Box (Portrait 8.5" x 13" = 12240 x 18720 twips) -->
    <w:p>
      <w:pPr>
        <w:sectPr>
          <w:pgSz w:w="12240" w:h="18720"/>
          <w:pgMar w:top="173" w:right="173" w:bottom="173" w:left="173" w:header="720" w:footer="720" w:gutter="0"/>
        </w:sectPr>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
            <wp:simplePos x="0" y="0"/>
            <wp:positionH relativeFrom="page">
              <wp:posOffset>${p1OffsetX}</wp:posOffset>
            </wp:positionH>
            <wp:positionV relativeFrom="page">
              <wp:posOffset>${p1OffsetY}</wp:posOffset>
            </wp:positionV>
            <wp:extent cx="${p1WidthEmu}" cy="${p1HeightEmu}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:wrapNone/>
            <wp:docPr id="1" name="Text Box Page 1"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic>
              <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                <wps:wsp>
                  <wps:cNvSpPr txBox="1"/>
                  <wps:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${p1WidthEmu}" cy="${p1HeightEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                    <a:noFill/>
                    ${borderXml}
                  </wps:spPr>
                  <wps:txbx>
                    <w:txbxContent>
                      ${headerXml}
                      ${page1ContentXml}
                    </w:txbxContent>
                  </wps:txbx>
                  <wps:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720"/>
                </wps:wsp>
              </a:graphicData>
            </a:graphic>
          </wp:anchor>
        </w:drawing>
      </w:r>
    </w:p>

    <!-- SECTION 2: Page 2 Text Box & Bulletin (Landscape 13" x 8.5" = 18720 x 12240 twips) -->
    <w:p>
      ${bgPictureXml}
      <w:r>
        <w:drawing>
          <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658241" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
            <wp:simplePos x="0" y="0"/>
            <wp:positionH relativeFrom="page">
              <wp:posOffset>${p2OffsetX}</wp:posOffset>
            </wp:positionH>
            <wp:positionV relativeFrom="page">
              <wp:posOffset>${p2OffsetY}</wp:posOffset>
            </wp:positionV>
            <wp:extent cx="${p2WidthEmu}" cy="${p2HeightEmu}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:wrapNone/>
            <wp:docPr id="2" name="Text Box Page 2"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic>
              <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                <wps:wsp>
                  <wps:cNvSpPr txBox="1"/>
                  <wps:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${p2WidthEmu}" cy="${p2HeightEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                    <a:noFill/>
                    ${borderXml}
                  </wps:spPr>
                  <wps:txbx>
                    <w:txbxContent>
                      ${page2ContentXml}
                    </w:txbxContent>
                  </wps:txbx>
                  <wps:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720"/>
                </wps:wsp>
              </a:graphicData>
            </a:graphic>
          </wp:anchor>
        </w:drawing>
      </w:r>
      ${bulletinBoxesXml}
    </w:p>

    <!-- Section 2 Properties (Body Level: Landscape 13" x 8.5") -->
    <w:sectPr>
      <w:type w:val="nextPage"/>
      <w:pgSz w:w="18720" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="173" w:right="173" w:bottom="173" w:left="173" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const zip = new JSZip();

  // Content types
  let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
</Types>`;
  zip.file('[Content_Types].xml', contentTypesXml);

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // Document relationships
  let docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>`;

  if (hasBulletin && backgroundImageData) {
    docRelsXml += `\n  <Relationship Id="rIdBg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>`;

    // Process base64 data to binary
    try {
      const base64Data = backgroundImageData.includes(',')
        ? backgroundImageData.split(',')[1]
        : backgroundImageData;
      if (typeof Buffer !== 'undefined') {
        zip.file('word/media/image1.jpeg', Buffer.from(base64Data, 'base64'));
      } else {
        const binStr = atob(base64Data);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        zip.file('word/media/image1.jpeg', bytes);
      }
    } catch (e) {
      console.error('Failed to embed background image into docx', e);
    }
  }

  docRelsXml += `\n</Relationships>`;
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  // Font Table linking fonts
  zip.file(
    'word/fontTable.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="${escapeXml(fontName)}">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Franklin Gothic Medium">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Franklin Gothic Book">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Mongolian Baiti">
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Bodoni MT">
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Leelawadee">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Arial Narrow">
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
</w:fonts>`
  );

  zip.file(
    'word/settings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
</w:settings>`
  );

  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}" w:cs="${escapeXml(fontName)}"/>
        <w:sz w:val="${fontSizeHalfPt}"/>
        <w:szCs w:val="${fontSizeHalfPt}"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>
        <w:jc w:val="both"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`
  );

  zip.file('word/document.xml', documentXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}
