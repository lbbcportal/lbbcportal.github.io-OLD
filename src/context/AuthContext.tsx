import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword as fbUpdatePassword
} from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { AppSettings, LoginBackgroundConfig, PublicBranding, UserRole } from '../types';
import {
  DEFAULT_LOGIN_BACKGROUND,
  isValidChurchLogo,
  isValidChurchName,
  normalizeAccentColor,
  normalizeLoginBackground,
  readCachedBranding,
  readCachedLoginBackground,
  saveCachedBranding,
  saveCachedLoginBackground,
} from '../lib/brandingCache';
import { DEFAULT_COLOR_SCHEME, DEFAULT_THEME_ID, normalizeAppearance } from '../lib/themes';

export const DEFAULT_PUBLIC_BRANDING: PublicBranding = {
  churchName: 'Our Church',
  churchLogo: '',
  accentColor: 'red',
  theme: DEFAULT_THEME_ID,
  colorScheme: DEFAULT_COLOR_SCHEME,
  clockStyle: 'digital',
  clockColor: 'white',
  weekStartDay: 'sunday',
  timeFormat: '12h',
  showDailyVerse: true,
  viewerMode: 'passcode',
  viewerPasscodeConfigured: false,
  viewerPasscodeVersion: 1,
  viewerIdleMinutes: 30,
};

interface ViewerUnlockRecord {
  code?: string;
  passcodeVersion?: number;
  updatedAt?: string;
}

interface AuthContextType {
  currentUser: User | null;
  role: UserRole;
  isSecretary: boolean;
  isViewer: boolean;
  username: string;
  loading: boolean;
  isInitialSetup: boolean;
  publicBranding: PublicBranding;
  publicBrandingLoading: boolean;
  publicBrandingExists: boolean;
  publicBrandingError: string | null;
  loginBackground: LoginBackgroundConfig;
  viewerUnlocked: boolean;
  viewerUnlockChecking: boolean;
  viewerPasscodeSubmitting: boolean;
  viewerUnlockError: string | null;
  anonymousAuthDisabled: boolean;
  viewerWelcomePending: boolean;
  dismissViewerWelcome: () => void;
  login: (username: string, password: string) => Promise<void>;
  createInitialAccount: (username: string, password: string) => Promise<void>;
  enterViewerOpen: () => Promise<void>;
  enterViewerWithPasscode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  recheckAuth: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function resolveUserRole(user: User | null): UserRole {
  if (!user) return null;
  if (user.isAnonymous) return 'viewer';
  return 'secretary';
}

export function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${clean || 'secretary'}@churchapp.local`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) return '';
  return email.split('@')[0];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [anonymousAuthDisabled, setAnonymousAuthDisabled] = useState(false);

  const [publicBranding, setPublicBranding] = useState<PublicBranding>(() => {
    const cached = readCachedBranding();
    return {
      ...DEFAULT_PUBLIC_BRANDING,
      ...cached,
    };
  });
  const [publicBrandingLoading, setPublicBrandingLoading] = useState(true);
  const [publicBrandingExists, setPublicBrandingExists] = useState(false);
  const [publicBrandingError, setPublicBrandingError] = useState<string | null>(null);
  const [loginBackground, setLoginBackground] = useState<LoginBackgroundConfig>(() =>
    readCachedLoginBackground()
  );

  const [viewerUnlockRecord, setViewerUnlockRecord] = useState<ViewerUnlockRecord | null>(null);
  const [viewerUnlockChecking, setViewerUnlockChecking] = useState(false);
  const [viewerPasscodeSubmitting, setViewerPasscodeSubmitting] = useState(false);
  const [viewerUnlockError, setViewerUnlockError] = useState<string | null>(null);
  const [viewerWelcomePending, setViewerWelcomePending] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);

  const authEventSeqRef = useRef(0);
  const viewerWelcomeShownRef = useRef(false);

  const isSecretary = role === 'secretary';
  const isViewer = role === 'viewer';

  const applyBrandingSnapshot = useCallback((exists: boolean, rawData?: Partial<PublicBranding>) => {
    if (exists && rawData) {
      const safeChurchName = isValidChurchName(rawData.churchName)
        ? rawData.churchName.trim()
        : DEFAULT_PUBLIC_BRANDING.churchName;
      const safeChurchLogo = isValidChurchLogo(rawData.churchLogo) ? rawData.churchLogo : '';
      const safeAccentColor = normalizeAccentColor(rawData.accentColor, 'red');
      const normalizedAppearance = normalizeAppearance(rawData.theme, rawData.colorScheme);

      const nextBranding: PublicBranding = {
        ...DEFAULT_PUBLIC_BRANDING,
        ...rawData,
        churchName: safeChurchName,
        churchLogo: safeChurchLogo,
        accentColor: safeAccentColor,
        theme: normalizedAppearance.theme,
        colorScheme: normalizedAppearance.colorScheme,
        clockStyle: rawData.clockStyle === 'analog' ? 'analog' : 'digital',
        clockColor: rawData.clockColor === 'black' ? 'black' : 'white',
        viewerMode: rawData.viewerMode === 'open' ? 'open' : 'passcode',
        viewerPasscodeConfigured: !!rawData.viewerPasscodeConfigured,
        viewerPasscodeVersion: typeof rawData.viewerPasscodeVersion === 'number' ? rawData.viewerPasscodeVersion : 1,
        viewerIdleMinutes:
          rawData.viewerIdleMinutes === 0 ||
          rawData.viewerIdleMinutes === 15 ||
          rawData.viewerIdleMinutes === 30 ||
          rawData.viewerIdleMinutes === 60 ||
          rawData.viewerIdleMinutes === 120
            ? rawData.viewerIdleMinutes
            : 30,
      };
      setPublicBranding(nextBranding);
      setPublicBrandingExists(true);
      saveCachedBranding({
        churchName: safeChurchName,
        churchLogo: safeChurchLogo,
        accentColor: safeAccentColor,
        theme: normalizedAppearance.theme,
        colorScheme: normalizedAppearance.colorScheme,
      });
    } else {
      setPublicBranding(DEFAULT_PUBLIC_BRANDING);
      setPublicBrandingExists(false);
    }
    setPublicBrandingError(null);
    setPublicBrandingLoading(false);
  }, []);

  useEffect(() => {
    const brandingRef = doc(db, 'public_branding', 'app');
    const unsubBranding = onSnapshot(brandingRef, (snapshot) => {
      applyBrandingSnapshot(snapshot.exists(), snapshot.data() as Partial<PublicBranding> | undefined);
    }, (err: any) => {
      console.warn('Public branding snapshot check:', err);
      setPublicBrandingError(err?.code || err?.message || 'Unable to read public_branding/app');
      setPublicBrandingLoading(false);
    });

    const loginBgRef = doc(db, 'public_branding', 'login_background');
    const unsubLoginBg = onSnapshot(loginBgRef, (snapshot) => {
      if (snapshot.exists()) {
        const nextBg = normalizeLoginBackground(snapshot.data() as Partial<LoginBackgroundConfig>);
        setLoginBackground(nextBg);
        saveCachedLoginBackground(nextBg);
      } else {
        setLoginBackground(DEFAULT_LOGIN_BACKGROUND);
        saveCachedLoginBackground(DEFAULT_LOGIN_BACKGROUND);
      }
    }, (err: any) => {
      console.warn('Public login background snapshot check:', err);
    });

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      const seq = ++authEventSeqRef.current;
      if (user) {
        try {
          await user.getIdToken();
        } catch (err) {
          console.warn('ID token readiness check:', err);
        }
      }
      if (authEventSeqRef.current !== seq) return;

      const resolved = resolveUserRole(user);
      setViewerUnlockRecord(null);
      setViewerUnlockError(null);
      if (!user || !user.isAnonymous) {
        setViewerUnlockChecking(false);
      }
      setRole(resolved);
      setCurrentUser(user);
      setLoading(false);
    });

    return () => {
      unsubBranding();
      unsubLoginBg();
      unsubAuth();
    };
  }, [applyBrandingSnapshot, authEpoch]);

  // Track viewer unlock record only when signed in as anonymous viewer AND passcode mode is active
  useEffect(() => {
    if (!currentUser || !currentUser.isAnonymous || publicBranding.viewerMode === 'open') {
      setViewerUnlockRecord(null);
      setViewerUnlockChecking(false);
      setViewerUnlockError(null);
      return;
    }

    setViewerUnlockChecking(true);
    setViewerUnlockError(null);
    const unlockRef = doc(db, 'viewer_unlocks', currentUser.uid);
    const unsubUnlock = onSnapshot(unlockRef, (snap) => {
      // Wait for server-confirmed state rather than local optimistic pending writes
      if (snap.metadata.hasPendingWrites) {
        return;
      }
      if (snap.exists()) {
        setViewerUnlockRecord(snap.data() as ViewerUnlockRecord);
      } else {
        setViewerUnlockRecord(null);
      }
      setViewerUnlockError(null);
      setViewerUnlockChecking(false);
    }, (err: any) => {
      console.warn('Viewer unlock check:', err);
      setViewerUnlockRecord(null);
      setViewerUnlockError(err?.code || err?.message || 'Unable to read viewer_unlocks');
      setViewerUnlockChecking(false);
    });

    return () => unsubUnlock();
  }, [currentUser?.uid, currentUser?.isAnonymous, publicBranding.viewerMode, authEpoch]);

  const viewerUnlocked = useMemo(() => {
    if (!isViewer) return false;
    if (publicBranding.viewerMode === 'open') {
      return true;
    }
    if (!publicBranding.viewerPasscodeConfigured) {
      return false;
    }
    return !!(
      viewerUnlockRecord &&
      typeof viewerUnlockRecord.passcodeVersion === 'number' &&
      viewerUnlockRecord.passcodeVersion === publicBranding.viewerPasscodeVersion
    );
  }, [isViewer, publicBranding.viewerMode, publicBranding.viewerPasscodeConfigured, publicBranding.viewerPasscodeVersion, viewerUnlockRecord]);

  const isInitialSetup = useMemo(() => {
    return publicBrandingExists && publicBranding.initialAccountCreated === false;
  }, [publicBrandingExists, publicBranding.initialAccountCreated]);

  const dismissViewerWelcome = useCallback(() => {
    setViewerWelcomePending(false);
  }, []);

  const clearAuthError = () => setAuthError(null);

  const login = async (u: string, p: string) => {
    setAuthError(null);
    if (!u.trim()) throw new Error('Please enter your username');
    if (!p) throw new Error('Please enter your password');

    const email = usernameToEmail(u);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, p);
      await cred.user.getIdToken(true);
      viewerWelcomeShownRef.current = false;
      setViewerWelcomePending(false);
      setRole(resolveUserRole(cred.user));
      setCurrentUser(cred.user);
      setLoading(false);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        const msg = 'Incorrect username or password.';
        setAuthError(msg);
        throw new Error(msg);
      } else if (err.code === 'auth/too-many-requests') {
        const msg = 'Too many failed login attempts. Please try again later.';
        setAuthError(msg);
        throw new Error(msg);
      } else {
        const msg = err.message || 'Failed to sign in. Please check your credentials.';
        setAuthError(msg);
        throw new Error(msg);
      }
    }
  };

  const createInitialAccount = async (u: string, p: string) => {
    setAuthError(null);
    if (!u.trim()) throw new Error('Please choose a username');
    if (p.length < 6) throw new Error('Password must be at least 6 characters');

    const email = usernameToEmail(u);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, p);
      await cred.user.getIdToken(true);
      viewerWelcomeShownRef.current = false;
      setViewerWelcomePending(false);
      setRole(resolveUserRole(cred.user));
      setCurrentUser(cred.user);
      setLoading(false);

      const settingsRef = doc(db, 'settings', 'app');
      const existingSettingsSnap = await getDoc(settingsRef);
      if (!existingSettingsSnap.exists()) {
        const initialSettings: AppSettings = {
          churchName: publicBranding.churchName || 'Our Church',
          churchLogo: publicBranding.churchLogo || '',
          secretaryName: '',
          theme: DEFAULT_THEME_ID,
          colorScheme: DEFAULT_COLOR_SCHEME,
          accentColor: 'red',
          weekStartDay: 'sunday',
          timeFormat: '12h',
          initialAccountCreated: true,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(settingsRef, initialSettings);
      } else {
        await setDoc(settingsRef, {
          initialAccountCreated: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err: any) {
      console.error('Create account error:', err);
      if (err.code === 'auth/email-already-in-use') {
        const msg = 'An account with this username already exists. Please log in.';
        setAuthError(msg);
        throw new Error(msg);
      } else {
        const msg = err.message || 'Failed to create secretary account.';
        setAuthError(msg);
        throw new Error(msg);
      }
    }
  };

  const ensureAnonymousSignIn = async (): Promise<User> => {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        await auth.currentUser.getIdToken();
      } catch {
        // Proceed with existing token if offline
      }
      return auth.currentUser;
    }
    try {
      const cred = await signInAnonymously(auth);
      await cred.user.getIdToken(true);
      setAnonymousAuthDisabled(false);
      return cred.user;
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/admin-only-operation' || code === 'auth/operation-not-allowed') {
        setAnonymousAuthDisabled(true);
        throw new Error('Anonymous sign-in is not enabled in Firebase Authentication yet. Please ask the secretary to enable the Anonymous sign-in provider in Firebase Console.');
      }
      throw new Error(err?.message || 'Unable to start viewer session.');
    }
  };

  const enterViewerOpen = async () => {
    setAuthError(null);
    if (publicBranding.viewerMode !== 'open') {
      throw new Error('Open viewer access is not currently enabled.');
    }
    const shouldShowWelcome = !viewerWelcomeShownRef.current;
    if (shouldShowWelcome) {
      viewerWelcomeShownRef.current = true;
      setViewerWelcomePending(true);
    }
    try {
      const user = await ensureAnonymousSignIn();
      setRole('viewer');
      setCurrentUser(user);
      setViewerUnlockChecking(false);
      setLoading(false);
    } catch (err) {
      if (shouldShowWelcome) {
        viewerWelcomeShownRef.current = false;
        setViewerWelcomePending(false);
      }
      throw err;
    }
  };

  const enterViewerWithPasscode = async (rawCode: string) => {
    setAuthError(null);
    const code = rawCode.trim();
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Please enter all 6 digits.');
    }
    if (!publicBranding.viewerPasscodeConfigured) {
      throw new Error('A viewer passcode has not been set yet. Please contact the church secretary.');
    }

    const shouldShowWelcome = !viewerWelcomeShownRef.current;
    if (shouldShowWelcome) {
      viewerWelcomeShownRef.current = true;
      setViewerWelcomePending(true);
    }

    setViewerPasscodeSubmitting(true);
    try {
      const user = await ensureAnonymousSignIn();
      const unlockPayload = {
        code,
        passcodeVersion: publicBranding.viewerPasscodeVersion || 1,
        updatedAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, 'viewer_unlocks', user.uid), unlockPayload);
      } catch (err: any) {
        setViewerUnlockChecking(false);
        const errCode = err?.code || '';
        if (errCode === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission')) {
          throw new Error('Incorrect passcode. Please check the 6-digit code and try again.');
        }
        throw new Error(err?.message || 'Unable to verify passcode.');
      }

      // Server confirmed write succeeded; update role & unlock state synchronously
      setViewerUnlockRecord(unlockPayload);
      setViewerUnlockError(null);
      setViewerUnlockChecking(false);
      setRole('viewer');
      setCurrentUser(user);
      setLoading(false);
    } catch (err) {
      if (shouldShowWelcome) {
        viewerWelcomeShownRef.current = false;
        setViewerWelcomePending(false);
      }
      throw err;
    } finally {
      setViewerPasscodeSubmitting(false);
    }
  };

  const logout = async () => {
    try {
      authEventSeqRef.current++;
      viewerWelcomeShownRef.current = false;
      setViewerWelcomePending(false);
      setViewerPasscodeSubmitting(false);
      setViewerUnlockRecord(null);
      setViewerUnlockChecking(false);
      setViewerUnlockError(null);
      setAuthError(null);
      setAnonymousAuthDisabled(false);
      setRole(null);
      setCurrentUser(null);
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const recheckAuth = useCallback(async () => {
    setAuthError(null);
    setPublicBrandingError(null);
    setViewerUnlockError(null);
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
        const resolved = resolveUserRole(auth.currentUser);
        setRole(resolved);
        setCurrentUser(auth.currentUser);

        if (auth.currentUser.isAnonymous && publicBranding.viewerMode !== 'open') {
          try {
            const snap = await getDocFromServer(doc(db, 'viewer_unlocks', auth.currentUser.uid));
            setViewerUnlockRecord(snap.exists() ? (snap.data() as ViewerUnlockRecord) : null);
          } catch (err: any) {
            setViewerUnlockError(err?.code || err?.message || 'Unable to check viewer_unlocks');
          } finally {
            setViewerUnlockChecking(false);
          }
        }
      }
      try {
        const brandSnap = await getDocFromServer(doc(db, 'public_branding', 'app'));
        applyBrandingSnapshot(brandSnap.exists(), brandSnap.data() as Partial<PublicBranding> | undefined);
      } catch (err: any) {
        setPublicBrandingError(err?.code || err?.message || 'Unable to read public_branding/app');
        setPublicBrandingLoading(false);
      }
    } catch (err: any) {
      console.warn('Auth recheck warning:', err);
    } finally {
      setLoading(false);
      setAuthEpoch(e => e + 1);
    }
  }, [applyBrandingSnapshot, publicBranding.viewerMode]);

  const changePassword = async (newPassword: string) => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Not logged in as secretary');
    if (newPassword.length < 6) throw new Error('Password must be at least 6 characters');
    try {
      await fbUpdatePassword(auth.currentUser, newPassword);
    } catch (err: any) {
      console.error('Change password error:', err);
      if (err.code === 'auth/requires-recent-login') {
        throw new Error('For security, please log out and log in again before changing your password.');
      }
      throw new Error(err.message || 'Failed to change password');
    }
  };

  const value: AuthContextType = {
    currentUser,
    role,
    isSecretary,
    isViewer,
    username: isViewer ? 'Viewer' : emailToUsername(currentUser?.email),
    loading,
    isInitialSetup,
    publicBranding,
    publicBrandingLoading,
    publicBrandingExists,
    publicBrandingError,
    loginBackground,
    viewerUnlocked,
    viewerUnlockChecking,
    viewerPasscodeSubmitting,
    viewerUnlockError,
    anonymousAuthDisabled,
    viewerWelcomePending,
    dismissViewerWelcome,
    login,
    createInitialAccount,
    enterViewerOpen,
    enterViewerWithPasscode,
    logout,
    recheckAuth,
    changePassword,
    authError,
    clearAuthError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
