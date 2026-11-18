/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Clock, X, Calendar, Check } from 'lucide-react';
import { toDateString } from '../lib/dateTime';
import { addDaysToDate } from '../lib/taskHelpers';
import { Task } from '../types';
import { Spinner } from './LoadingIndicator';

export interface SnoozeModalProps {
  isOpen: boolean;
  task?: Task | null;
  taskTitle?: string;
  onClose: () => void;
  onSnooze: ((untilDate: string) => Promise<void>) | ((taskId: string, untilDate: string) => Promise<void>);
}

export const SnoozeModal: React.FC<SnoozeModalProps> = ({
  isOpen,
  task,
  taskTitle,
  onClose,
  onSnooze
}) => {
  if (!isOpen) return null;

  const todayStr = toDateString(new Date());
  const [customDate, setCustomDate] = useState<string>(addDaysToDate(todayStr, 1));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tomorrowStr = addDaysToDate(todayStr, 1);
  const in3DaysStr = addDaysToDate(todayStr, 3);
  const nextWeekStr = addDaysToDate(todayStr, 7);

  const displayTitle = task?.title || taskTitle || 'this task';

  const handleApplySnooze = async (date: string) => {
    setIsSubmitting(true);
    try {
      if (task && onSnooze.length > 1) {
        await (onSnooze as (id: string, d: string) => Promise<void>)(task.id, date);
      } else {
        await (onSnooze as (d: string) => Promise<void>)(date);
      }
      onClose();
    } catch (err) {
      console.error('Failed to snooze task', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="relative w-full max-w-sm bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-main leading-tight">Snooze Task</h3>
              <p className="text-xs text-mut truncate max-w-[200px]" title={displayTitle}>
                {displayTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-sec">
          Hide this task from the dashboard until the chosen date. It will still remain visible in the Tasks page with a snoozed tag.
        </p>

        {/* Quick Options */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleApplySnooze(tomorrowStr)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-subtle hover:border-accent/40 bg-subtle/30 hover:bg-surface text-left text-xs font-semibold text-main transition-colors flex items-center justify-between cursor-pointer"
          >
            <span>Tomorrow</span>
            <span className="text-[11px] text-mut font-normal">{tomorrowStr}</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleApplySnooze(in3DaysStr)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-subtle hover:border-accent/40 bg-subtle/30 hover:bg-surface text-left text-xs font-semibold text-main transition-colors flex items-center justify-between cursor-pointer"
          >
            <span>In 3 days</span>
            <span className="text-[11px] text-mut font-normal">{in3DaysStr}</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleApplySnooze(nextWeekStr)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-subtle hover:border-accent/40 bg-subtle/30 hover:bg-surface text-left text-xs font-semibold text-main transition-colors flex items-center justify-between cursor-pointer"
          >
            <span>Next week</span>
            <span className="text-[11px] text-mut font-normal">{nextWeekStr}</span>
          </button>
        </div>

        {/* Pick a specific date */}
        <div className="pt-2 border-t border-subtle space-y-2">
          <label className="block text-[11px] font-semibold text-sec uppercase tracking-wider">
            Or pick a date
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              min={tomorrowStr}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              disabled={isSubmitting || !customDate}
              onClick={() => handleApplySnooze(customDate)}
              className="px-3 py-1.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Snooze</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
