import React, { useEffect, useState } from 'react';
import {
  TimeOfDayPeriod,
  formatGreetingText,
  getTimeOfDayPeriod,
  pickRandomGreetingIndex,
} from '../lib/greetings';

interface HomeBannerGreetingProps {
  isViewer: boolean;
  secretaryName?: string;
}

interface GreetingSelection {
  period: TimeOfDayPeriod;
  index: number;
}

export const HomeBannerGreeting: React.FC<HomeBannerGreetingProps> = ({
  isViewer,
  secretaryName,
}) => {
  const [selection, setSelection] = useState<GreetingSelection>(() => {
    const period = getTimeOfDayPeriod(new Date());
    return {
      period,
      index: pickRandomGreetingIndex(period),
    };
  });

  // Only re-roll if the time-of-day bucket changes while Home remains open
  useEffect(() => {
    const timer = setInterval(() => {
      const nextPeriod = getTimeOfDayPeriod(new Date());
      setSelection((prev) => {
        if (prev.period === nextPeriod) return prev;
        return {
          period: nextPeriod,
          index: pickRandomGreetingIndex(nextPeriod),
        };
      });
    }, 15_000);

    return () => clearInterval(timer);
  }, []);

  const greetingText = formatGreetingText(
    selection.period,
    selection.index,
    isViewer ? undefined : secretaryName
  );

  return (
    <h1
      key={`${selection.period}-${selection.index}`}
      className={`home-greeting-enter ${
        isViewer
          ? 'text-[1.75rem] sm:text-[2.625rem] lg:text-[3.5rem]'
          : 'text-2xl sm:text-4xl lg:text-5xl'
      } font-black tracking-tight text-white drop-shadow-sm leading-tight`}
    >
      {greetingText}
    </h1>
  );
};
