/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { ClockColor, ClockStyle } from '../types';

export const BannerClock: React.FC = () => {
  const { settings } = useData();
  const [now, setNow] = useState(() => new Date());

  const clockStyle: ClockStyle = settings.clockStyle === 'analog' ? 'analog' : 'digital';
  const clockColor: ClockColor = settings.clockColor === 'black' ? 'black' : 'white';
  const isBlack = clockColor === 'black';

  // Live timer: 100ms when in analog mode for continuous smooth second hand sweep, 1000ms in digital mode
  useEffect(() => {
    const intervalMs = clockStyle === 'analog' ? 100 : 1000;
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [clockStyle]);

  // Date line: "Friday, Nov 6, 2026"
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Digital time components (Always 12-hour with AM/PM)
  const rawHours = now.getHours();
  const displayHours = rawHours % 12 || 12;
  const displayMinutes = String(now.getMinutes()).padStart(2, '0');
  const displaySeconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = rawHours >= 12 ? 'PM' : 'AM';

  // Analog calculations (with smooth fractional second hand)
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const secondsFraction = now.getSeconds() + now.getMilliseconds() / 1000;

  const hourAngle = (hours + minutes / 60 + secondsFraction / 3600) * 30; // 360 / 12 = 30 deg/hr
  const minuteAngle = (minutes + secondsFraction / 60) * 6; // 360 / 60 = 6 deg/min
  const secondAngle = secondsFraction * 6; // 6 deg/sec

  const textShadowStyle: React.CSSProperties = {
    textShadow: isBlack
      ? '0 0 12px rgba(255, 255, 255, 0.85), 0 1px 4px rgba(255, 255, 255, 0.7)'
      : '0 2px 10px rgba(0, 0, 0, 0.65), 0 1px 3px rgba(0, 0, 0, 0.5)'
  };

  const svgFilterStyle: React.CSSProperties = {
    filter: isBlack
      ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.85)) drop-shadow(0 1px 3px rgba(255, 255, 255, 0.7))'
      : 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.65)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))'
  };

  return (
    <div
      data-no-motion="true"
      className={`px-2 py-1 ${
        isBlack ? 'text-black' : 'text-white'
      } flex flex-col items-center justify-center gap-2 w-auto min-w-[240px] sm:min-w-[295px] select-none shrink-0`}
    >
      {/* 1. Date at the top */}
      <div className="w-full shrink-0 flex items-center justify-center">
        <span
          style={textShadowStyle}
          className={`text-[11px] sm:text-xs font-normal ${
            isBlack ? 'text-black/90' : 'text-white/90'
          } whitespace-nowrap leading-normal tracking-wide text-center`}
        >
          {formattedDate}
        </span>
      </div>

      {/* 2. Clock directly on the banner */}
      {clockStyle === 'digital' ? (
        <div
          style={textShadowStyle}
          className="w-full flex flex-col items-center justify-center my-0.5"
        >
          {/* Centered time ~35% larger, light weight */}
          <div
            className={`text-[4.15rem] sm:text-[5.05rem] font-light leading-none tracking-tight tabular-nums ${
              isBlack ? 'text-black' : 'text-white'
            } text-center w-full`}
          >
            {displayHours}:{displayMinutes}
          </div>
          {/* Seconds & AM/PM smaller, regular weight, centered directly below */}
          <div
            className={`text-sm sm:text-base font-normal ${
              isBlack ? 'text-black/85' : 'text-white/90'
            } tracking-widest uppercase mt-1.5 tabular-nums`}
          >
            :{displaySeconds} {ampm}
          </div>
        </div>
      ) : (
        <div className="w-full flex items-center justify-center my-0.5">
          {/* Analog clock ~33% larger with lighter strokes and numerals */}
          <svg
            viewBox="0 0 100 100"
            style={svgFilterStyle}
            className="w-[176px] h-[176px] sm:w-[192px] sm:h-[192px] shrink-0"
          >
            {/* Outer dial (no filled card behind it) */}
            <circle
              cx="50"
              cy="50"
              r="47"
              className={`fill-none ${isBlack ? 'stroke-black/45' : 'stroke-white/45'}`}
              strokeWidth="1.5"
            />

            {/* Cardinal Numbers: 12, 3, 6, 9 */}
            <text
              x="50"
              y="17"
              textAnchor="middle"
              dominantBaseline="central"
              className={`${isBlack ? 'fill-black' : 'fill-white'} font-normal text-[9px]`}
            >
              12
            </text>
            <text
              x="83.5"
              y="50"
              textAnchor="middle"
              dominantBaseline="central"
              className={`${isBlack ? 'fill-black' : 'fill-white'} font-normal text-[9px]`}
            >
              3
            </text>
            <text
              x="50"
              y="83"
              textAnchor="middle"
              dominantBaseline="central"
              className={`${isBlack ? 'fill-black' : 'fill-white'} font-normal text-[9px]`}
            >
              6
            </text>
            <text
              x="16.5"
              y="50"
              textAnchor="middle"
              dominantBaseline="central"
              className={`${isBlack ? 'fill-black' : 'fill-white'} font-normal text-[9px]`}
            >
              9
            </text>

            {/* Hour tick marks at 1, 2, 4, 5, 7, 8, 10, 11 */}
            {[1, 2, 4, 5, 7, 8, 10, 11].map(h => {
              const angle = h * 30;
              const rad = (angle - 90) * (Math.PI / 180);
              const x1 = 50 + 40 * Math.cos(rad);
              const y1 = 50 + 40 * Math.sin(rad);
              const x2 = 50 + 44.5 * Math.cos(rad);
              const y2 = 50 + 44.5 * Math.sin(rad);
              return (
                <line
                  key={h}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={isBlack ? 'stroke-black/70' : 'stroke-white/70'}
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Hour Hand */}
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="28"
              className={isBlack ? 'stroke-black' : 'stroke-white'}
              strokeWidth="2.75"
              strokeLinecap="round"
              transform={`rotate(${hourAngle} 50 50)`}
            />

            {/* Minute Hand */}
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="18"
              className={isBlack ? 'stroke-black/90' : 'stroke-white/95'}
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${minuteAngle} 50 50)`}
            />

            {/* Second Hand (accent colored, smoothly sweeping) */}
            <g transform={`rotate(${secondAngle} 50 50)`}>
              <line
                x1="50"
                y1="58"
                x2="50"
                y2="13"
                className="stroke-[var(--accent-base,#ea580c)]"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
              <circle
                cx="50"
                cy="50"
                r="2.25"
                className="fill-[var(--accent-base,#ea580c)]"
              />
            </g>

            {/* Center Cap */}
            <circle cx="50" cy="50" r="1.4" className={isBlack ? 'fill-black' : 'fill-white'} />
          </svg>
        </div>
      )}
    </div>
  );
};
