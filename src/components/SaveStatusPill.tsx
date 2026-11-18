/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Spinner } from './LoadingIndicator';

export const SaveStatusPill: React.FC = () => {
  const { saveStatus } = useData();
  const [displayedState, setDisplayedState] = useState<'saving' | 'saved'>('saving');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (saveStatus.state === 'saving') {
      setDisplayedState('saving');
      setIsVisible(true);
    } else if (saveStatus.state === 'saved') {
      setDisplayedState('saved');
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [saveStatus.state]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none select-none mb-[env(safe-area-inset-bottom,0px)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-2.5 scale-95 pointer-events-none'
      }`}
    >
      <div
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-dropdown backdrop-blur-md border transition-all ${
          displayedState === 'saving'
            ? 'bg-surface/95 text-main border-accent/40 ring-1 ring-accent/20'
            : 'bg-surface/95 text-main border-emerald-500/40 ring-1 ring-emerald-500/20'
        }`}
      >
        {displayedState === 'saving' ? (
          <>
            <Spinner size="xs" variant="accent" label="Saving" />
            <span className="text-xs font-semibold tracking-wide text-main">Saving...</span>
          </>
        ) : (
          <>
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
            </div>
            <span className="text-xs font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
              Saved
            </span>
          </>
        )}
      </div>
    </div>
  );
};
