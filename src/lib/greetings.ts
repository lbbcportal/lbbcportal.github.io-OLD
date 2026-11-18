export type TimeOfDayPeriod = 'morning' | 'afternoon' | 'evening' | 'late';

interface GreetingTemplate {
  withName: (name: string) => string;
  withoutName: string;
}

const GREETING_TEMPLATES: Record<TimeOfDayPeriod, readonly GreetingTemplate[]> = {
  // 5:00 AM to 11:59 AM
  morning: [
    { withName: (n) => `Good morning, ${n}`, withoutName: 'Good morning' },
    { withName: (n) => `Rise and shine, ${n}`, withoutName: 'Rise and shine' },
    { withName: (n) => `Blessed morning, ${n}`, withoutName: 'Blessed morning' },
    { withName: (n) => `Ready for a fruitful day, ${n}?`, withoutName: 'Ready for a fruitful day?' },
  ],
  // 12:00 PM to 5:59 PM
  afternoon: [
    { withName: (n) => `Good afternoon, ${n}`, withoutName: 'Good afternoon' },
    { withName: (n) => `Hope your day is going well, ${n}`, withoutName: 'Hope your day is going well' },
    { withName: (n) => `Keep up the good work, ${n}`, withoutName: 'Keep up the good work' },
    { withName: (n) => `Back at it, ${n}`, withoutName: 'Back at it' },
  ],
  // 6:00 PM to 9:59 PM
  evening: [
    { withName: (n) => `Good evening, ${n}`, withoutName: 'Good evening' },
    { withName: (n) => `Thank you for your faithful service, ${n}`, withoutName: 'Thank you for your faithful service' },
    { withName: (n) => `Welcome back, ${n}`, withoutName: 'Welcome back' },
  ],
  // 10:00 PM to 4:59 AM
  late: [
    { withName: (n) => `Working late, ${n}?`, withoutName: 'Working late?' },
    { withName: (n) => `Still serving, ${n}?`, withoutName: 'Still serving?' },
    { withName: (n) => `Good evening, ${n}`, withoutName: 'Good evening' },
  ],
};

export function getTimeOfDayPeriod(date: Date = new Date()): TimeOfDayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late';
}

export function pickRandomGreetingIndex(period: TimeOfDayPeriod): number {
  const list = GREETING_TEMPLATES[period];
  return Math.floor(Math.random() * list.length);
}

export function formatGreetingText(
  period: TimeOfDayPeriod,
  index: number,
  name?: string
): string {
  const list = GREETING_TEMPLATES[period];
  const safeIdx = ((index % list.length) + list.length) % list.length;
  const tpl = list[safeIdx];
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  return trimmedName ? tpl.withName(trimmedName) : tpl.withoutName;
}
