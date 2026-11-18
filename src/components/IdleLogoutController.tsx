import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

const WARNING_SECONDS = 60;

export const IdleLogoutController: React.FC = () => {
  const { currentUser, isViewer, viewerUnlocked, publicBranding, logout } = useAuth();
  const { viewerSettings, isBusyOperation } = useData();

  const isSessionActive = Boolean(currentUser && (!isViewer || viewerUnlocked));

  const timeoutMinutes = isViewer
    ? (typeof publicBranding.viewerIdleMinutes === 'number' ? publicBranding.viewerIdleMinutes : 30)
    : (typeof viewerSettings.secretaryIdleMinutes === 'number' ? viewerSettings.secretaryIdleMinutes : 60);

  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);
  const [waitingForBusy, setWaitingForBusy] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const warningOpenRef = useRef<boolean>(false);
  const isBusyRef = useRef<boolean>(isBusyOperation);
  const loggingOutRef = useRef<boolean>(false);

  useEffect(() => {
    isBusyRef.current = isBusyOperation;
    if (isBusyOperation) {
      // Keep session alive whenever a save, AI request, or download is running
      lastActivityRef.current = Date.now();
    }
  }, [isBusyOperation]);

  useEffect(() => {
    warningOpenRef.current = showWarning;
  }, [showWarning]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setSecondsLeft(WARNING_SECONDS);
    setWaitingForBusy(false);
  }, []);

  // Reset activity when session state or configured timeout changes
  useEffect(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setSecondsLeft(WARNING_SECONDS);
    setWaitingForBusy(false);
    loggingOutRef.current = false;
  }, [isSessionActive, timeoutMinutes]);

  // Monitor user interaction (mouse, keyboard, touch, scroll)
  useEffect(() => {
    if (!isSessionActive || timeoutMinutes <= 0) return;

    const handleActivity = () => {
      // Only auto-reset before the 60-second warning modal opens; once open, user taps "Stay logged in"
      if (!warningOpenRef.current) {
        lastActivityRef.current = Date.now();
      }
    };

    const events: Array<{ type: keyof WindowEventMap; capture?: boolean }> = [
      { type: 'mousemove' },
      { type: 'mousedown' },
      { type: 'keydown' },
      { type: 'touchstart' },
      { type: 'touchmove' },
      { type: 'scroll', capture: true },
    ];

    for (const ev of events) {
      window.addEventListener(ev.type, handleActivity, { passive: true, capture: Boolean(ev.capture) });
    }

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev.type, handleActivity, { capture: Boolean(ev.capture) });
      }
    };
  }, [isSessionActive, timeoutMinutes]);

  // Poll elapsed inactivity every second
  useEffect(() => {
    if (!isSessionActive || timeoutMinutes <= 0) return;

    const totalMs = timeoutMinutes * 60_000;
    const warningAtMs = Math.max(0, totalMs - WARNING_SECONDS * 1000);

    const interval = setInterval(() => {
      if (loggingOutRef.current) return;

      if (isBusyRef.current) {
        lastActivityRef.current = Date.now();
        if (warningOpenRef.current) {
          setWaitingForBusy(true);
        }
        return;
      }

      setWaitingForBusy(false);
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= totalMs) {
        loggingOutRef.current = true;
        setShowWarning(false);
        logout();
        return;
      }

      if (elapsed >= warningAtMs) {
        const remainingSec = Math.max(1, Math.ceil((totalMs - elapsed) / 1000));
        setSecondsLeft(remainingSec);
        if (!warningOpenRef.current) {
          setShowWarning(true);
        }
      } else if (warningOpenRef.current) {
        setShowWarning(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, timeoutMinutes, logout]);

  if (!isSessionActive || timeoutMinutes <= 0 || !showWarning) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs motion-backdrop-in"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-logout-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-subtle shadow-xl p-6 space-y-5 text-main motion-popup-in">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 id="idle-logout-title" className="text-base font-bold text-main">
              Still there?
            </h2>
            {waitingForBusy ? (
              <p className="text-xs text-sec leading-relaxed">
                A save, AI request, or download is currently finishing. Your session will stay active until it completes.
              </p>
            ) : (
              <p className="text-xs text-sec leading-relaxed">
                You have been inactive for a while. For security, you will be logged out automatically in{' '}
                <strong className="text-main tabular-nums">{secondsLeft}s</strong>.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isBusyOperation}
            onClick={() => {
              if (isBusyRef.current) return;
              loggingOutRef.current = true;
              setShowWarning(false);
              logout();
            }}
            className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out now</span>
          </button>

          <button
            type="button"
            onClick={resetActivity}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Stay logged in</span>
          </button>
        </div>
      </div>
    </div>
  );
};
