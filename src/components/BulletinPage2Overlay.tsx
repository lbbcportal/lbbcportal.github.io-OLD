/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ForerunnerBulletin,
  ForerunnerFormatSettings,
  DEFAULT_BULLETIN_POSITIONS,
  FIXED_BULLETIN_BOXES
} from '../types';
import {
  formatSundayBulletinDate,
  calcDateFontSize,
  calcVerseFontSize,
  calcEventsLayout,
  calcBirthdayTableLayout,
  calcPastorMessageLayout
} from '../lib/bulletinHelpers';
import { Edit3 } from 'lucide-react';

export interface BulletinPage2OverlayProps {
  bulletin: ForerunnerBulletin | null;
  backgroundImageUrl: string | null;
  settings: ForerunnerFormatSettings;
  scale?: number;
  onBoxClick?: (boxKey: 'date' | 'verse' | 'pastor' | 'events' | 'birthdays') => void;
  interactive?: boolean;
}

export const BulletinPage2Overlay: React.FC<BulletinPage2OverlayProps> = ({
  bulletin,
  backgroundImageUrl,
  settings,
  scale = 1,
  onBoxClick,
  interactive = false
}) => {
  if (!backgroundImageUrl) return null;

  const positions = settings.bulletinPositions || DEFAULT_BULLETIN_POSITIONS;

  // Scale factor: scale of 1.4 in the 840px preview canvas
  // 1 point in Word ≈ (840px / 13in / 72pt/in) ≈ 0.897 px in preview
  // Multiply Word point sizes by pxPerPt to ensure preview exactly mirrors Word export!
  const pxPerPt = (840 / 13 / 72) * (scale / 1.4);

  // 1. Sunday Date
  const dateText = bulletin?.customDateText || (bulletin?.bulletinDate ? formatSundayBulletinDate(bulletin.bulletinDate) : 'November 15, 2026');
  const datePt = calcDateFontSize(dateText, positions.date.w, positions.date.h);
  const datePx = Math.max(7, datePt * pxPerPt);

  // 2. Verse of the Week
  const verseLayout = calcVerseFontSize(
    bulletin?.verseText || '',
    bulletin?.verseReference || '',
    positions.verse.w,
    positions.verse.h
  );
  const versePx = Math.max(6, verseLayout.fontSize * pxPerPt);

  // 3. Pastor's Heart Message (body only)
  const pastorLayout = calcPastorMessageLayout(
    bulletin?.pastorHeartText || '',
    positions.pastor.w,
    positions.pastor.h
  );
  const pastorPx = Math.max(6, pastorLayout.fontSize * pxPerPt);

  // 4. Upcoming Events
  const visibleEvents = (bulletin?.upcomingEvents || []).filter(e => !e.hidden).slice(0, 3);
  const eventsLayout = calcEventsLayout(visibleEvents, positions.events.w, positions.events.h);
  const eventsTitlePx = Math.max(6.5, eventsLayout.titleFontSize * pxPerPt);
  const eventsDetailPx = Math.max(5.5, eventsLayout.detailFontSize * pxPerPt);

  // 5. Birthday Celebrators
  const [y, m] = (bulletin?.bulletinDate || '').split('-').map(Number);
  const bdayDateObj = new Date(y || 2026, (m || 1) - 1, 1);
  const monthCapitals = bdayDateObj.toLocaleDateString('en-US', { month: 'long' }).toUpperCase() || 'NOVEMBER';

  const bdayLayout = calcBirthdayTableLayout(
    bulletin?.birthdayCelebrators || [],
    positions.birthdays.w,
    positions.birthdays.h
  );
  const bdayMonthPx = Math.max(8, 16 * pxPerPt);
  const bdayTablePx = Math.max(5.5, bdayLayout.fontSize * pxPerPt);

  // Box positions in percentages of 13" x 8.5" page
  const getBoxStyle = (coords: { x: number; y: number; w: number; h: number }) => ({
    position: 'absolute' as const,
    left: `${(coords.x / 13) * 100}%`,
    top: `${(coords.y / 8.5) * 100}%`,
    width: `${(coords.w / 13) * 100}%`,
    height: `${(coords.h / 8.5) * 100}%`
  });

  return (
    <>
      {/* Background Image spanning 100% of Page 2 (13" x 8.5") */}
      <img
        src={backgroundImageUrl}
        alt="Page 2 Background"
        className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
      />

      {/* ================= FIXED BOX 1: WELCOME (UNCLICKABLE) ================= */}
      <div
        style={getBoxStyle(FIXED_BULLETIN_BOXES.welcome)}
        className="pointer-events-none select-none overflow-hidden flex items-center justify-center px-1"
      >
        <span
          className="text-black italic text-center font-serif leading-none tracking-normal"
          style={{
            fontFamily: '"Times New Roman", Times, serif',
            fontSize: `${Math.max(10, 22 * pxPerPt)}px`
          }}
        >
          Welcome!
        </span>
      </div>

      {/* ================= FIXED BOX 2: CLOSING & SIGNATURE (UNCLICKABLE) ================= */}
      <div
        style={getBoxStyle(FIXED_BULLETIN_BOXES.closing)}
        className="pointer-events-none select-none overflow-hidden flex flex-col justify-center px-2 py-0.5 space-y-0.5"
      >
        <div
          className="text-left font-bold italic text-black leading-tight"
          style={{
            fontFamily: '"Franklin Gothic Medium", Arial, sans-serif',
            fontSize: `${Math.max(6.5, 10 * pxPerPt)}px`
          }}
        >
          Have a wonderful Lord's Day!
        </div>
        <div
          className="text-right font-bold italic text-black leading-tight"
          style={{
            fontFamily: '"Bodoni MT", Didot, serif',
            fontSize: `${Math.max(5.5, 8 * pxPerPt)}px`
          }}
        >
          Ptr. Claus P. Esden
        </div>
        <div
          className="text-right italic text-black leading-tight"
          style={{
            fontFamily: '"Franklin Gothic Book", "Franklin Gothic", Arial, sans-serif',
            fontSize: `${Math.max(5.5, 8 * pxPerPt)}px`
          }}
        >
          Pastor of LBBC Ministries
        </div>
      </div>

      {/* ================= DYNAMIC BOX 1: DATE ================= */}
      {/* Franklin Gothic Medium, white, bold, centered horizontally and vertically */}
      <div
        style={getBoxStyle(positions.date)}
        onClick={() => interactive && onBoxClick?.('date')}
        className={`group overflow-hidden flex items-center justify-center px-2 py-0.5 ${
          interactive ? 'cursor-pointer hover:ring-1 hover:ring-accent/70 hover:bg-accent/10 rounded' : ''
        }`}
        title={interactive ? 'Click to edit Date' : undefined}
      >
        <div
          className="w-full text-white font-bold tracking-normal leading-tight text-center select-none truncate"
          style={{
            fontFamily: '"Franklin Gothic Medium", Arial, sans-serif',
            fontSize: `${datePx}px`
          }}
        >
          {dateText}
        </div>
        {interactive && (
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 bg-black/60 text-white rounded">
            <Edit3 className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      {/* ================= DYNAMIC BOX 2: VERSE OF THE WEEK ================= */}
      {/* Mongolian Baiti, centered horizontally and vertically. Curly quotes, reference in bold on its own line */}
      <div
        style={getBoxStyle(positions.verse)}
        onClick={() => interactive && onBoxClick?.('verse')}
        className={`group overflow-hidden flex flex-col justify-center items-center text-center px-2 py-0.5 ${
          interactive ? 'cursor-pointer hover:ring-1 hover:ring-accent/70 hover:bg-accent/10 rounded' : ''
        }`}
        title={interactive ? 'Click to edit Verse of the Week' : undefined}
      >
        <div
          className="w-full text-black leading-snug select-none overflow-hidden"
          style={{
            fontFamily: '"Mongolian Baiti", "Times New Roman", serif',
            fontSize: `${versePx}px`
          }}
        >
          {bulletin?.verseText ? (
            <>
              <p className="leading-snug">{verseLayout.verseFormatted}</p>
              <p className="font-bold mt-0.5 text-black not-italic">{bulletin.verseReference}</p>
            </>
          ) : (
            <p className="text-zinc-400 italic text-[0.9em]">No verse selected</p>
          )}
        </div>
        {interactive && (
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 bg-black/60 text-white rounded">
            <Edit3 className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      {/* ================= DYNAMIC BOX 3: PASTOR'S HEART MESSAGE (BODY ONLY) ================= */}
      {/* Franklin Gothic Book, justified. ~0.3" first-line indent, small paragraph gap. */}
      <div
        style={getBoxStyle(positions.pastor)}
        onClick={() => interactive && onBoxClick?.('pastor')}
        className={`group overflow-hidden flex flex-col justify-start px-2 py-0.5 ${
          interactive ? 'cursor-pointer hover:ring-1 hover:ring-accent/70 hover:bg-accent/10 rounded' : ''
        }`}
        title={interactive ? "Click to edit Pastor's Heart Message" : undefined}
      >
        <div
          className="text-black leading-tight text-justify w-full overflow-hidden space-y-1.5 select-none"
          style={{
            fontFamily: '"Franklin Gothic Book", "Franklin Gothic", Arial, sans-serif',
            fontSize: `${pastorPx}px`
          }}
        >
          {pastorLayout.paragraphs.length > 0 ? (
            pastorLayout.paragraphs.map((para, pIdx) => (
              <p
                key={pIdx}
                style={{ textIndent: `${0.30 * 72 * pxPerPt}px` }}
                className="leading-snug"
              >
                {para}
              </p>
            ))
          ) : (
            <p className="text-zinc-400 italic text-[0.9em]">Type pastor's heart message...</p>
          )}
        </div>

        {interactive && (
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 bg-black/60 text-white rounded">
            <Edit3 className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      {/* ================= DYNAMIC BOX 4: UPCOMING EVENTS ================= */}
      {/* Leelawadee, centered horizontally and vertically as one block */}
      <div
        style={getBoxStyle(positions.events)}
        onClick={() => interactive && onBoxClick?.('events')}
        className={`group overflow-hidden flex flex-col justify-center items-center text-center px-2 py-0.5 ${
          interactive ? 'cursor-pointer hover:ring-1 hover:ring-accent/70 hover:bg-accent/10 rounded' : ''
        }`}
        title={interactive ? 'Click to edit Upcoming Events' : undefined}
      >
        <div
          className="w-full text-black space-y-1 overflow-hidden select-none flex flex-col items-center justify-center"
          style={{
            fontFamily: '"Leelawadee", "Segoe UI", Arial, sans-serif',
            fontSize: `${eventsDetailPx}px`
          }}
        >
          {visibleEvents.length > 0 ? (
            visibleEvents.map((ev, idx) => (
              <div key={idx} className="leading-tight w-full">
                {ev.isGrouped && ev.subLines ? (
                  <>
                    <div
                      className="font-bold text-black"
                      style={{ fontSize: `${eventsTitlePx}px` }}
                    >
                      {ev.title}
                    </div>
                    {ev.subLines.map((sub, sIdx) => (
                      <div key={sIdx} className="text-zinc-800">
                        {sub.dateStr} ({sub.weekdayStr}){sub.location ? ` - ${sub.location}` : ''}
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div
                      className="font-bold text-black"
                      style={{ fontSize: `${eventsTitlePx}px` }}
                    >
                      {ev.dateStr}
                    </div>
                    <div className="text-zinc-800">{ev.title}</div>
                  </>
                )}
              </div>
            ))
          ) : (
            <div className="text-zinc-400 italic text-[0.9em]">No upcoming events</div>
          )}
        </div>

        {interactive && (
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 bg-black/60 text-white rounded">
            <Edit3 className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      {/* ================= DYNAMIC BOX 5: BIRTHDAY CELEBRATORS ================= */}
      {/* Month in capitals (Arial Narrow 16pt bold centered). Table fills whole width. */}
      {/* 2 column groups ([day] [name] [day] [name]), thin black borders, vertically centered text */}
      {/* If several people share a day, show day once and stack names one per line in the same cell (no commas) */}
      {/* Center month + table vertically if shorter than box */}
      <div
        style={getBoxStyle(positions.birthdays)}
        onClick={() => interactive && onBoxClick?.('birthdays')}
        className={`group overflow-hidden flex flex-col ${
          bdayLayout.isVerticallyCentered ? 'justify-center' : 'justify-start'
        } px-2 py-0.5 ${
          interactive ? 'cursor-pointer hover:ring-1 hover:ring-accent/70 hover:bg-accent/10 rounded' : ''
        }`}
        title={interactive ? 'Click to edit Birthday Celebrators' : undefined}
      >
        {/* Month Heading */}
        <div
          className="text-center font-bold text-black uppercase tracking-wider mb-0.5 select-none"
          style={{
            fontFamily: '"Arial Narrow", Arial, sans-serif',
            fontSize: `${bdayMonthPx}px`
          }}
        >
          {monthCapitals}
        </div>

        {/* 2-Column Table */}
        <div className="w-full overflow-hidden flex flex-col justify-center">
          <table
            className="w-full border-collapse border border-black select-none text-left"
            style={{
              fontFamily: '"Arial Narrow", Arial, sans-serif',
              fontSize: `${bdayTablePx}px`,
              lineHeight: 1.15
            }}
          >
            <tbody>
              {Array.from({ length: bdayLayout.maxRows }).map((_, r) => {
                const left = bdayLayout.leftGroups[r];
                const right = bdayLayout.rightGroups[r];
                return (
                  <tr key={r} className="border-b border-black">
                    <td className="w-[12%] text-center font-bold border-r border-black p-0.5 bg-white text-black align-middle">
                      {left ? left.day : ''}
                    </td>
                    <td className="w-[38%] border-r border-black p-0.5 bg-white text-black align-middle">
                      {left && left.names && left.names.length > 0 ? (
                        left.names.map((n, nIdx) => (
                          <div key={nIdx} className="leading-tight truncate">
                            {n}
                          </div>
                        ))
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="w-[12%] text-center font-bold border-r border-black p-0.5 bg-white text-black align-middle">
                      {right ? right.day : ''}
                    </td>
                    <td className="w-[38%] p-0.5 bg-white text-black align-middle">
                      {right && right.names && right.names.length > 0 ? (
                        right.names.map((n, nIdx) => (
                          <div key={nIdx} className="leading-tight truncate">
                            {n}
                          </div>
                        ))
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {interactive && (
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 bg-black/60 text-white rounded">
            <Edit3 className="w-2.5 h-2.5" />
          </div>
        )}
      </div>
    </>
  );
};
