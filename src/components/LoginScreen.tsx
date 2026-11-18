import React, { useEffect, useRef, useState } from 'react';
import {
  Church,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  CalendarDays,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './LoadingIndicator';
import { ParallaxBackground } from './ParallaxBackground';

export const LoginScreen: React.FC = () => {
  const {
    login,
    createInitialAccount,
    enterViewerOpen,
    enterViewerWithPasscode,
    isInitialSetup,
    publicBranding,
    loginBackground,
    anonymousAuthDisabled,
    authError,
    clearAuthError
  } = useAuth();

  // Default to Viewer mode; if initial secretary account setup is required, show secretary mode directly
  const [mode, setMode] = useState<'viewer' | 'secretary'>(isInitialSetup ? 'secretary' : 'viewer');

  useEffect(() => {
    if (isInitialSetup) {
      setMode('secretary');
    }
  }, [isInitialSetup]);

  // Viewer passcode 6-digit state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [viewerSubmitting, setViewerSubmitting] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Secretary login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isOpenViewer = publicBranding.viewerMode === 'open';
  const passcodeConfigured = publicBranding.viewerPasscodeConfigured;

  const triggerViewerError = (msg: string) => {
    setViewerError(msg);
    setShakeKey(k => k + 1);
  };

  const handleOpenViewerEnter = async () => {
    setViewerError(null);
    clearAuthError();
    setViewerSubmitting(true);
    try {
      await enterViewerOpen();
    } catch (err: any) {
      triggerViewerError(err?.message || 'Unable to enter viewer mode.');
    } finally {
      setViewerSubmitting(false);
    }
  };

  const submitPasscode = async (code: string) => {
    setViewerError(null);
    clearAuthError();
    if (!/^\d{6}$/.test(code)) {
      triggerViewerError('Please enter all 6 digits.');
      return;
    }
    setViewerSubmitting(true);
    try {
      await enterViewerWithPasscode(code);
    } catch (err: any) {
      triggerViewerError(err?.message || 'Incorrect passcode. Please try again.');
    } finally {
      setViewerSubmitting(false);
    }
  };

  const handleDigitChange = (idx: number, rawVal: string) => {
    if (viewerError) setViewerError(null);
    const cleaned = rawVal.replace(/\D/g, '');
    if (!cleaned) {
      setDigits(prev => {
        const next = [...prev];
        next[idx] = '';
        return next;
      });
      return;
    }

    if (cleaned.length > 1) {
      // Handle multi-digit paste/autofill into a single box
      const chars = cleaned.slice(0, 6 - idx).split('');
      const next = [...digits];
      chars.forEach((ch, offset) => {
        if (idx + offset < 6) {
          next[idx + offset] = ch;
        }
      });
      setDigits(next);
      const nextFocus = Math.min(5, idx + chars.length);
      digitRefs.current[nextFocus]?.focus();
      return;
    }

    const next = [...digits];
    next[idx] = cleaned;
    setDigits(next);
    if (idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      } else if (idx > 0) {
        const next = [...digits];
        next[idx - 1] = '';
        setDigits(next);
        digitRefs.current[idx - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitPasscode(digits.join(''));
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    if (viewerError) setViewerError(null);
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setDigits(next);
    const focusIdx = Math.min(5, text.length);
    digitRefs.current[focusIdx]?.focus();
  };

  const handleViewerPasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPasscode(digits.join(''));
  };

  const handleSecretarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!username.trim()) {
      setLocalError('Please enter your username');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    if (isInitialSetup) {
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isInitialSetup) {
        await createInitialAccount(username, password);
      } else {
        await login(username, password);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const secretaryErrorMessage = localError || authError;
  const churchDisplayName = publicBranding.churchName || 'Our Church';
  const hasCustomBackground = Boolean(loginBackground.imageData);
  const exteriorTextShadowStyle: React.CSSProperties | undefined = hasCustomBackground
    ? { textShadow: '0 2px 10px rgba(0, 0, 0, 0.72), 0 1px 3px rgba(0, 0, 0, 0.6)' }
    : undefined;

  return (
    <div className="min-h-screen w-full relative overflow-hidden login-bg-navy text-slate-100 flex flex-col items-center justify-center px-4 py-10">
      {/* Background image (with cursor parallax & dimming) or default navy ambient glow */}
      <ParallaxBackground
        imageData={loginBackground.imageData}
        dimming={loginBackground.dimming}
      />

      <div className="relative z-10 w-full max-w-md login-fade-in">
        {/* Church Branding Header */}
        <div className="text-center mb-7">
          {publicBranding.churchLogo ? (
            <img
              src={publicBranding.churchLogo}
              alt={churchDisplayName}
              className="w-16 h-16 object-contain mx-auto mb-4 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900/55 backdrop-blur-md text-white mb-4 border border-white/20 shadow-lg">
              <Church className="w-8 h-8" />
            </div>
          )}

          <h1
            style={exteriorTextShadowStyle}
            className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug"
          >
            {churchDisplayName}
          </h1>
        </div>

        {/* Frosted-Glass Card */}
        <div className="rounded-2xl bg-slate-900/65 backdrop-blur-xl border border-white/15 shadow-2xl p-6 sm:p-8">
          {mode === 'viewer' ? (
            <div className="space-y-6">
              <div className="text-center space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  {isOpenViewer ? <CalendarDays className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                  <span>{isOpenViewer ? 'Church Schedules & Calendar' : 'Member Viewer Access'}</span>
                </span>
                <h2 className="text-lg font-bold text-white">
                  {isOpenViewer ? 'Welcome to Our Church Portal' : 'Enter 6-Digit Passcode'}
                </h2>
                <p className="text-xs text-slate-300/80 leading-relaxed">
                  {isOpenViewer
                    ? 'View upcoming worship services, ministry schedules, and church calendar events.'
                    : 'Enter the 6-digit church viewer code to browse schedules, services, and calendar events.'}
                </p>
              </div>

              {anonymousAuthDisabled && (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-start gap-2.5 text-xs text-amber-100">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                  <span className="leading-relaxed">
                    Anonymous sign-in is disabled in Firebase Authentication. Ask the church secretary to enable <strong>Anonymous</strong> under Authentication &rarr; Sign-in method in Firebase Console.
                  </span>
                </div>
              )}

              {viewerError && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-400/40 flex items-start gap-2.5 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-300" />
                  <span className="leading-relaxed">{viewerError}</span>
                </div>
              )}

              {isOpenViewer ? (
                <button
                  type="button"
                  disabled={viewerSubmitting}
                  onClick={handleOpenViewerEnter}
                  className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60 cursor-pointer"
                >
                  {viewerSubmitting ? (
                    <>
                      <Spinner size="xs" variant="contrast" label="Opening viewer" />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <span>View Schedules and Calendar</span>
                  )}
                </button>
              ) : !passcodeConfigured ? (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center space-y-2">
                  <p className="text-xs text-slate-200 font-medium">
                    A viewer passcode has not been set up yet.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    The church secretary can configure a 6-digit passcode or switch to Open access in Settings.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleViewerPasscodeSubmit} className="space-y-5">
                  <div
                    key={shakeKey}
                    className={`grid grid-cols-6 gap-2 sm:gap-2.5 ${viewerError ? 'login-shake' : ''}`}
                  >
                    {digits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          digitRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        autoComplete="one-time-code"
                        aria-label={`Passcode digit ${idx + 1}`}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                        onPaste={handleDigitPaste}
                        autoFocus={idx === 0}
                        className="h-12 sm:h-14 w-full text-center text-lg sm:text-xl font-bold rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white transition-all tabular-nums"
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={viewerSubmitting || digits.join('').length < 6}
                    className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-55 cursor-pointer"
                  >
                    {viewerSubmitting ? (
                      <>
                        <Spinner size="xs" variant="contrast" label="Checking passcode" />
                        <span>Entering...</span>
                      </>
                    ) : (
                      <span>Enter</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-5 login-fade-in">
              <div className="text-center space-y-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  {churchDisplayName}
                </span>
                <h2 className="text-lg font-bold text-white">
                  {isInitialSetup ? 'Set Up Secretary Account' : 'Secretary Sign In'}
                </h2>
                <p className="text-xs text-slate-300/80">
                  {isInitialSetup
                    ? 'Create your primary secretary login to begin.'
                    : 'Sign in to manage church schedules, members, and records.'}
                </p>
              </div>

              {isInitialSetup && (
                <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-white shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-200">
                    <span className="font-semibold text-white block mb-0.5">One-time initial setup</span>
                    Create your administrative login. Subsequent launches will directly show the sign-in screen.
                  </div>
                </div>
              )}

              {secretaryErrorMessage && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-400/40 flex items-start gap-2.5 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-300" />
                  <span className="leading-relaxed">{secretaryErrorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSecretarySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (localError) setLocalError(null);
                      }}
                      placeholder="e.g. secretary or yourname"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (localError) setLocalError(null);
                      }}
                      placeholder={isInitialSetup ? 'At least 6 characters' : 'Enter password'}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isInitialSetup && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (localError) setLocalError(null);
                        }}
                        placeholder="Repeat password"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition-all"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Spinner size="xs" variant="contrast" label="Signing in" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>{isInitialSetup ? 'Create Account & Enter' : 'Sign In'}</span>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Mode Switch Link Below Card */}
        {!isInitialSetup && (
          <div className="text-center mt-5">
            {mode === 'viewer' ? (
              <button
                type="button"
                onClick={() => {
                  setViewerError(null);
                  clearAuthError();
                  setMode('secretary');
                }}
                style={exteriorTextShadowStyle}
                className="text-xs font-medium text-slate-200/90 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
              >
                Secretary mode
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  clearAuthError();
                  setMode('viewer');
                }}
                style={exteriorTextShadowStyle}
                className="text-xs font-medium text-slate-200/90 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
              >
                Back to viewer mode
              </button>
            )}
          </div>
        )}

        <p
          style={exteriorTextShadowStyle}
          className="text-center text-[11px] text-slate-300/85 mt-6"
        >
          {churchDisplayName}
        </p>
      </div>
    </div>
  );
};
