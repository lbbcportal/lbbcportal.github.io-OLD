import React, { useState, useEffect } from 'react';

export const HeaderLiveClock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Update every second for live accurate time
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format 12-hour time with AM/PM (e.g. "10:42 AM")
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = String(minutes).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  const timeStr = `${displayHours}:${displayMinutes} ${period}`;

  // Format date e.g. "Fri, Nov 6"
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      data-no-motion="true"
      className="flex flex-col items-end justify-center select-none shrink-0 px-1 text-right"
    >
      <span className="text-xs sm:text-sm font-bold text-main leading-none tabular-nums tracking-tight">
        {timeStr}
      </span>
      <span className="text-[10px] text-mut font-medium leading-none mt-0.5 hidden sm:inline tabular-nums">
        {dateStr}
      </span>
    </div>
  );
};
