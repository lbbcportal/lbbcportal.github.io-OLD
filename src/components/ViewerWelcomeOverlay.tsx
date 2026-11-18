import React, { useEffect, useRef, useState } from 'react';
import { Church } from 'lucide-react';

interface ViewerWelcomeOverlayProps {
  churchName?: string;
  churchLogo?: string;
  isDataLoading: boolean;
  onDone: () => void;
}

export const ViewerWelcomeOverlay: React.FC<ViewerWelcomeOverlayProps> = ({
  churchName,
  churchLogo,
  isDataLoading,
  onDone,
}) => {
  const [prefersReducedMotion] = useState(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      );
    } catch {
      return false;
    }
  });
  const durationMs = prefersReducedMotion ? 1000 : 2500;

  const [timerReady, setTimerReady] = useState(false);
  const [userSkipped, setUserSkipped] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  const canSkipRef = useRef(false);
  const exitStartedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Reset image error fallback if logo source updates
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [churchLogo]);

  // Brief grace period before accepting tap/key skip so a login Enter press does not immediately dismiss
  useEffect(() => {
    const skipArmTimer = setTimeout(() => {
      canSkipRef.current = true;
    }, 180);

    const holdTimer = setTimeout(() => {
      setTimerReady(true);
    }, durationMs);

    return () => {
      clearTimeout(skipArmTimer);
      clearTimeout(holdTimer);
    };
  }, [durationMs]);

  // Allow any key press to skip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canSkipRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setUserSkipped(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Crossfade cleanly once duration completes (or user skips) AND initial Home data is ready
  useEffect(() => {
    if (exitStartedRef.current) return;
    if ((timerReady || userSkipped) && !isDataLoading) {
      exitStartedRef.current = true;
      setExiting(true);
      const fadeDuration = prefersReducedMotion ? 180 : 450;
      const doneTimer = setTimeout(() => {
        onDoneRef.current();
      }, fadeDuration);
      return () => clearTimeout(doneTimer);
    }
  }, [timerReady, userSkipped, isDataLoading, prefersReducedMotion]);

  const churchDisplayName = (typeof churchName === 'string' ? churchName.trim() : '') || 'Our Church';
  const safeLogo = typeof churchLogo === 'string' && churchLogo.trim() && !logoLoadFailed ? churchLogo : '';

  const handleTap = () => {
    if (!canSkipRef.current) return;
    setUserSkipped(true);
  };

  return (
    <div
      onClick={handleTap}
      role="status"
      aria-live="polite"
      aria-label={`Welcome to ${churchDisplayName}`}
      className={`fixed inset-0 z-[100] viewer-welcome-bg text-white flex flex-col items-center justify-center px-6 select-none overflow-hidden cursor-pointer ${
        prefersReducedMotion ? 'transition-opacity duration-150 ease-out' : 'transition-opacity duration-[450ms] ease-out'
      } ${exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      {/* Very slow soft light movement + faint vignette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="viewer-welcome-light absolute top-[-12%] left-1/2 w-[780px] h-[540px] rounded-full blur-3xl" />
        <div className="viewer-welcome-vignette absolute inset-0" />
      </div>

      {/* Centered Welcome Composition */}
      <div
        className={`relative z-10 w-full max-w-xl flex flex-col items-center text-center ${
          prefersReducedMotion ? '' : 'transition-opacity duration-[350ms] ease-out'
        } ${exiting ? 'opacity-0' : 'opacity-100'}`}
      >
        {/* Logo alone (no box), with soft glow following the logo shape */}
        <div className="mb-8 flex items-center justify-center">
          {safeLogo ? (
            <img
              src={safeLogo}
              alt={`${churchDisplayName} Logo`}
              referrerPolicy="no-referrer"
              onError={() => setLogoLoadFailed(true)}
              className="viewer-welcome-logo w-24 h-24 sm:w-28 sm:h-28 object-contain"
            />
          ) : (
            <Church
              aria-hidden="true"
              className="viewer-welcome-logo w-16 h-16 sm:w-20 sm:h-20 text-white/90 stroke-[1.5]"
            />
          )}
        </div>

        {/* Widely spaced uppercase WELCOME */}
        <p className="viewer-welcome-eyebrow text-[11px] sm:text-xs font-semibold uppercase tracking-[0.42em] text-slate-300/85 mb-3">
          WELCOME
        </p>

        {/* Church Name in large, clean type */}
        <h1 className="viewer-welcome-title text-2xl sm:text-4xl font-semibold tracking-tight text-white leading-tight text-balance max-w-lg">
          {churchDisplayName}
        </h1>

        {/* Thin line drawing across below the church name */}
        <div className="mt-6 w-32 sm:w-44 h-[1px] overflow-hidden" aria-hidden="true">
          <div className="viewer-welcome-line h-full w-full bg-gradient-to-r from-white/20 via-white/85 to-white/20" />
        </div>
      </div>
    </div>
  );
};
