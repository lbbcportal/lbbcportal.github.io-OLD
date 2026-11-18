import React, { createContext, useCallback, useContext, useEffect, useState, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  waitForPendingWrites,
  getDocs
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { APP_COLLECTIONS } from '../lib/backupRegistry';
import { isValidAccentColor, normalizeAccentColor } from '../lib/brandingCache';
import {
  DEFAULT_COLOR_SCHEME,
  DEFAULT_THEME_ID,
  applyThemeToDocument,
  isValidColorScheme,
  isValidThemeId,
  normalizeAppearance
} from '../lib/themes';
import { useAuth, DEFAULT_PUBLIC_BRANDING } from './AuthContext';
import {
  AppSettings,
  OutlineNode,
  Person,
  RegularService,
  ServiceOverride,
  ChurchEvent,
  RoleAssignment,
  EventCategory,
  RequiredRoleSpec,
  Schedule,
  MessageTemplate,
  SentReminder,
  ColorScheme,
  ThemeBase,
  AccentColor,
  ClockStyle,
  ClockColor,
  Task,
  TaskCategory,
  QuickNote,
  ForerunnerLesson,
  ForerunnerFormatSettings,
  ForerunnerBulletin,
  ForerunnerAsset,
  DEFAULT_BULLETIN_POSITIONS,
  Visitor,
  VisitorSettings,
  DEFAULT_VISITOR_AGE_GROUPS,
  ViewerAccessMode,
  ViewerSettings,
  PublicBranding,
  PersonPublic,
  IdleTimeoutMinutes,
  ViewerNote,
  ViewerNoteStatus,
  LoginBackgroundConfig
} from '../types';
import { clampLoginDimming } from '../lib/brandingCache';

import { getNextPeriodDateRange, toDateString } from '../lib/dateTime';

export interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
}

export interface CloudError {
  code: string;
  message: string;
  path: string;
  operationDesc: string;
  timestamp: string;
  retryFn?: () => Promise<void>;
}

export interface DataLoadingState {
  settings: boolean;
  initial: boolean;
  home: boolean;
  calendar: boolean;
  services: boolean;
  schedules: boolean;
  people: boolean;
  tasks: boolean;
  notes: boolean;
  templates: boolean;
  visitors: boolean;
  forerunner: boolean;
  viewerNotes: boolean;
}

interface DataContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  bannerImage: string;
  updateBannerImage: (imageUrl: string) => Promise<void>;
  loginBackground: LoginBackgroundConfig;
  updateLoginBackground: (updates: Partial<LoginBackgroundConfig>) => Promise<void>;
  saveStatus: SaveStatus;
  cloudError: CloudError | null;
  clearCloudError: () => void;

  // Outline Nodes
  nodes: OutlineNode[];
  addNode: (parentId?: string, title?: string, isRole?: boolean) => Promise<string>;
  updateNode: (id: string, updates: Partial<OutlineNode>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  indentNode: (id: string) => Promise<void>;
  outdentNode: (id: string) => Promise<void>;
  reorderNodes: (sourceId: string, targetParentId: string, newOrder: number) => Promise<void>;
  attachPersonToRole: (roleId: string, personNameOrId: string) => Promise<void>;
  detachPersonFromRole: (roleId: string, personId: string) => Promise<void>;

  // People
  people: Person[];
  addPerson: (name: string, details?: Partial<Person>) => Promise<string>;
  updatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;

  // Regular Services
  regularServices: RegularService[];
  addRegularService: (service: Omit<RegularService, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateRegularService: (id: string, updates: Partial<RegularService>) => Promise<void>;
  deleteRegularService: (id: string) => Promise<void>;

  // Service Overrides (single occurrence alterations / cancellations)
  overrides: ServiceOverride[];
  setServiceOverride: (override: ServiceOverride) => Promise<void>;
  deleteServiceOverride: (id: string) => Promise<void>;

  // Calendar Events & Templates
  events: ChurchEvent[];
  addEvent: (event: Omit<ChurchEvent, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateEvent: (id: string, updates: Partial<ChurchEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // Event Categories
  categories: EventCategory[];
  addCategory: (name: string, color: string) => Promise<string>;
  updateCategory: (id: string, updates: Partial<EventCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Role Assignments (Single Source of Truth)
  assignments: RoleAssignment[];
  saveAssignment: (assignment: Omit<RoleAssignment, 'id' | 'updatedAt'>) => Promise<string>;
  deleteAssignment: (id: string) => Promise<void>;
  batchSaveAssignments: (newAssignments: Omit<RoleAssignment, 'id' | 'updatedAt'>[]) => Promise<void>;
  clearAssignmentsInRange: (targetId: string, roleId: string, dates: string[]) => Promise<void>;

  // Schedules (cards representing schedule periods for roles)
  schedules: Schedule[];
  addSchedule: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSchedule: (id: string, updates: Partial<Schedule>) => Promise<void>;
  deleteSchedule: (id: string, deleteAssociatedAssignments?: boolean) => Promise<void>;
  duplicateSchedule: (scheduleId: string) => Promise<string>;

  // Message Templates
  messageTemplates: MessageTemplate[];
  addMessageTemplate: (template: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>, customId?: string) => Promise<string>;
  updateMessageTemplate: (id: string, updates: Partial<MessageTemplate>) => Promise<void>;
  deleteMessageTemplate: (id: string) => Promise<void>;
  duplicateMessageTemplate: (id: string) => Promise<string>;

  // Sent Reminders
  sentReminders: SentReminder[];
  markReminderSent: (templateId: string, occurrenceDate: string, targetId: string) => Promise<string>;

  // Tasks
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, customId?: string) => Promise<string>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTaskDone: (taskId: string, occurrenceDate?: string) => Promise<void>;
  snoozeTask: (taskId: string, untilDate: string) => Promise<void>;

  // Task Categories
  taskCategories: TaskCategory[];
  addTaskCategory: (name: string, color: string) => Promise<string>;
  updateTaskCategory: (id: string, updates: Partial<TaskCategory>) => Promise<void>;
  deleteTaskCategory: (id: string) => Promise<void>;

  // Quick Notes
  notes: QuickNote[];
  addNote: (text: string, pinned?: boolean) => Promise<string>;
  updateNote: (id: string, updates: Partial<QuickNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  togglePinNote: (id: string) => Promise<void>;

  // Forerunner Studio
  forerunnerLessons: ForerunnerLesson[];
  forerunnerSettings: ForerunnerFormatSettings;
  forerunnerBulletins: ForerunnerBulletin[];
  forerunnerAsset: ForerunnerAsset | null;
  addForerunnerLesson: (lesson: Omit<ForerunnerLesson, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateForerunnerLesson: (id: string, updates: Partial<ForerunnerLesson>) => Promise<void>;
  deleteForerunnerLesson: (id: string) => Promise<void>;
  updateForerunnerSettings: (updates: Partial<ForerunnerFormatSettings>) => Promise<void>;
  resetForerunnerSettings: () => Promise<void>;
  saveForerunnerAsset: (asset: Omit<ForerunnerAsset, 'id' | 'updatedAt'>) => Promise<void>;
  saveForerunnerBulletin: (bulletin: ForerunnerBulletin) => Promise<void>;
  deleteForerunnerBulletin: (id: string) => Promise<void>;

  // Visitors
  visitors: Visitor[];
  visitorSettings: VisitorSettings;
  addVisitor: (visitor: Omit<Visitor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateVisitor: (id: string, updates: Partial<Visitor>) => Promise<void>;
  deleteVisitor: (id: string) => Promise<void>;
  addVisitorReturnVisit: (id: string, visitDate: string) => Promise<void>;
  updateVisitorSettings: (updates: Partial<VisitorSettings>) => Promise<void>;

  // Viewer Access & Safe Member Copy (Stage 6A)
  viewerSettings: ViewerSettings;
  updateViewerSettings: (updates: Partial<ViewerSettings>) => Promise<void>;
  rebuildPeoplePublic: () => Promise<number>;

  // Viewer Notes (Stage 6B-2)
  viewerNotes: ViewerNote[];
  submitViewerNote: (message: string, name?: string) => Promise<void>;
  updateViewerNoteStatus: (id: string, status: ViewerNoteStatus) => Promise<void>;
  deleteViewerNote: (id: string) => Promise<void>;

  // Active Save / AI / Download Guard for Idle Logout
  isBusyOperation: boolean;
  beginBusyOperation: () => void;
  endBusyOperation: () => void;
  trackBusyOperation: <T>(fn: () => Promise<T>) => Promise<T>;

  // Loading state per domain / initial load & resilient diagnostics
  dataLoading: DataLoadingState;
  pendingLoadingParts: string[];
  collectionErrors: Record<string, string>;
  retryDataLoad: () => void;

  // Helper selectors
  assignableRoles: OutlineNode[];
}

const defaultSettings: AppSettings = {
  churchName: 'Our Church',
  churchLogo: '',
  secretaryName: '',
  facebookLink: '',
  messengerChatLink: '',
  clockStyle: 'digital',
  clockColor: 'white',
  showDailyVerse: true,
  theme: DEFAULT_THEME_ID,
  colorScheme: DEFAULT_COLOR_SCHEME,
  accentColor: 'red',
  weekStartDay: 'sunday',
  timeFormat: '12h',
  initialAccountCreated: true,
};

function normalizeIdleMinutes(val: unknown, fallback: IdleTimeoutMinutes): IdleTimeoutMinutes {
  if (val === 0 || val === 15 || val === 30 || val === 60 || val === 120) {
    return val;
  }
  return fallback;
}

const defaultViewerSettings: ViewerSettings = {
  mode: 'passcode',
  passcode: '',
  passcodeVersion: 1,
  secretaryIdleMinutes: 60,
  viewerIdleMinutes: 30
};

function toPersonPublic(person: {
  id: string;
  name: string;
  department?: string;
  birthdayMonth?: number;
  birthdayDay?: number;
}): PersonPublic {
  const pub: PersonPublic = {
    id: person.id,
    name: person.name.trim(),
    department: person.department || ''
  };
  if (typeof person.birthdayMonth === 'number' && person.birthdayMonth >= 1 && person.birthdayMonth <= 12) {
    pub.birthdayMonth = person.birthdayMonth;
  }
  if (typeof person.birthdayDay === 'number' && person.birthdayDay >= 1 && person.birthdayDay <= 31) {
    pub.birthdayDay = person.birthdayDay;
  }
  return pub;
}

function buildPublicBrandingPayload(appSettings: AppSettings, vSettings: ViewerSettings): PublicBranding {
  const normalized = normalizeAppearance(appSettings.theme, appSettings.colorScheme);
  return {
    churchName: appSettings.churchName || 'Our Church',
    churchLogo: appSettings.churchLogo || '',
    facebookLink: appSettings.facebookLink || '',
    theme: normalized.theme,
    colorScheme: normalized.colorScheme,
    accentColor: normalizeAccentColor(appSettings.accentColor, 'red'),
    clockStyle: appSettings.clockStyle === 'analog' ? 'analog' : 'digital',
    clockColor: appSettings.clockColor === 'black' ? 'black' : 'white',
    weekStartDay: appSettings.weekStartDay || 'sunday',
    timeFormat: appSettings.timeFormat || '12h',
    showDailyVerse: appSettings.showDailyVerse !== false,
    initialAccountCreated: appSettings.initialAccountCreated !== false,
    viewerMode: vSettings.mode === 'open' ? 'open' : 'passcode',
    viewerPasscodeConfigured: typeof vSettings.passcode === 'string' && /^\d{6}$/.test(vSettings.passcode),
    viewerPasscodeVersion: typeof vSettings.passcodeVersion === 'number' ? vSettings.passcodeVersion : 1,
    viewerIdleMinutes: normalizeIdleMinutes(vSettings.viewerIdleMinutes, 30),
    updatedAt: new Date().toISOString()
  };
}

const VIEWER_PREFS_STORAGE_KEY = 'lbbc_viewer_device_prefs_v1';

interface ViewerDevicePrefs {
  theme?: ThemeBase;
  colorScheme?: ColorScheme;
  accentColor?: AccentColor;
}

function loadViewerDevicePrefs(): ViewerDevicePrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(VIEWER_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { theme?: unknown; colorScheme?: unknown; accentColor?: unknown };
    const prefs: ViewerDevicePrefs = {};
    if (parsed.theme !== undefined) {
      const normalized = normalizeAppearance(parsed.theme, parsed.colorScheme);
      prefs.theme = normalized.theme;
      prefs.colorScheme = normalized.colorScheme;
    } else if (isValidColorScheme(parsed.colorScheme)) {
      prefs.colorScheme = parsed.colorScheme;
    }
    if (parsed.accentColor === 'maroon' || isValidAccentColor(parsed.accentColor)) {
      prefs.accentColor = normalizeAccentColor(parsed.accentColor);
    }
    return prefs;
  } catch {
    return {};
  }
}

function saveViewerDevicePrefs(prefs: ViewerDevicePrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEWER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or private browsing errors cleanly
  }
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, role, isSecretary, isViewer, viewerUnlocked, publicBranding, publicBrandingExists, loginBackground } = useAuth();

  const [viewerPrefs, setViewerPrefs] = useState<ViewerDevicePrefs>(() => loadViewerDevicePrefs());
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [bannerImage, setBannerImage] = useState<string>('');
  const [publicBannerImage, setPublicBannerImage] = useState<string>('');
  const [publicBannerLoaded, setPublicBannerLoaded] = useState<boolean>(false);
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [peoplePublic, setPeoplePublic] = useState<PersonPublic[]>([]);
  const [regularServices, setRegularServices] = useState<RegularService[]>([]);
  const [overrides, setOverrides] = useState<ServiceOverride[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [sentReminders, setSentReminders] = useState<SentReminder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [forerunnerLessons, setForerunnerLessons] = useState<ForerunnerLesson[]>([]);
  const [forerunnerBulletins, setForerunnerBulletins] = useState<ForerunnerBulletin[]>([]);
  const [forerunnerAsset, setForerunnerAsset] = useState<ForerunnerAsset | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [visitorSettings, setVisitorSettings] = useState<VisitorSettings>({
    ageGroups: DEFAULT_VISITOR_AGE_GROUPS
  });
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(defaultViewerSettings);
  const [viewerNotes, setViewerNotes] = useState<ViewerNote[]>([]);
  const [busyOperationCount, setBusyOperationCount] = useState<number>(0);
  const [forerunnerSettings, setForerunnerSettings] = useState<ForerunnerFormatSettings>({
    fontName: 'Abadi',
    startingFontSize: 13,
    minFontSize: 12,
    maxFontSize: 16,
    autoFitFontSize: true,
    page1Width: 8.23,
    page1Height: 12.73,
    page2Width: 6.19,
    page2Height: 8.14,
    margins: 0.12,
    border: true,
    blankLineSize: 10,
    minBlankLineSize: 4,
    defaultAlignment: 'justified',
    lastUsedSeriesTitle: '',
    bulletinPositions: DEFAULT_BULLETIN_POSITIONS,
    pastorClosingLine: '',
    pastorName: '',
    pastorTitle: '',
    pastorStyleSamples: '',
    pastorTargetWords: 117
  });

  // Persistent save tracking & server confirmation
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const [cloudError, setCloudError] = useState<CloudError | null>(null);
  const [loadedCollections, setLoadedCollections] = useState<Record<string, boolean>>({});
  const [collectionErrors, setCollectionErrors] = useState<Record<string, string>>({});
  const [subscriptionEpoch, setSubscriptionEpoch] = useState<number>(0);

  const hasSyncedPublicBrandingRef = React.useRef(false);
  const hasSyncedPeoplePublicRef = React.useRef(false);

  const markLoaded = useCallback((key: string) => {
    setLoadedCollections(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const recordCollectionError = useCallback((pathLabel: string, err: any) => {
    const code = err?.code || 'read-error';
    const message = err?.message || String(err || 'Unable to read');
    setCollectionErrors(prev => ({ ...prev, [pathLabel]: `${code}: ${message}` }));
  }, []);

  const clearCollectionError = useCallback((pathLabel: string) => {
    setCollectionErrors(prev => {
      if (!(pathLabel in prev)) return prev;
      const next = { ...prev };
      delete next[pathLabel];
      return next;
    });
  }, []);

  const retryDataLoad = useCallback(() => {
    setLoadedCollections({});
    setCollectionErrors({});
    setPublicBannerLoaded(false);
    setSubscriptionEpoch(prev => prev + 1);
  }, []);

  const clearCloudError = () => setCloudError(null);

  const baseBrandingAppearance = normalizeAppearance(publicBranding.theme, publicBranding.colorScheme);
  const secretaryAppearance = normalizeAppearance(settings.theme, settings.colorScheme);

  const activeTheme: ThemeBase = isViewer
    ? (viewerPrefs.theme ?? baseBrandingAppearance.theme)
    : isSecretary
      ? secretaryAppearance.theme
      : baseBrandingAppearance.theme;
  const activeColorScheme: ColorScheme = isViewer
    ? (viewerPrefs.colorScheme ?? baseBrandingAppearance.colorScheme)
    : isSecretary
      ? secretaryAppearance.colorScheme
      : baseBrandingAppearance.colorScheme;
  const activeAccent = normalizeAccentColor(
    isViewer
      ? (viewerPrefs.accentColor || publicBranding.accentColor)
      : isSecretary
        ? settings.accentColor
        : publicBranding.accentColor,
    'red'
  );

  // Apply theme, color scheme & accent variables directly to <html> element
  useEffect(() => {
    applyThemeToDocument(activeTheme, activeColorScheme, activeAccent);
  }, [activeTheme, activeColorScheme, activeAccent]);

  const beginBusyOperation = useCallback(() => {
    setBusyOperationCount(c => c + 1);
  }, []);

  const endBusyOperation = useCallback(() => {
    setBusyOperationCount(c => Math.max(0, c - 1));
  }, []);

  const trackBusyOperation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    beginBusyOperation();
    try {
      return await fn();
    } finally {
      endBusyOperation();
    }
  }, [beginBusyOperation, endBusyOperation]);

  const isBusyOperation = saveStatus.state === 'saving' || busyOperationCount > 0;

  // Centralized Server-Confirmed Firestore Write Wrapper
  // Enforces:
  // 1. Shows "Saving..." while write is pending
  // 2. Confirms via waitForPendingWrites(db) that Cloud Firestore server has acknowledged the write
  // 3. Shows "Saved" only after server acknowledgment
  // 4. If fails or does not confirm within 10 seconds, sets persistent cloudError with full code and Retry function
  const executeServerConfirmedWrite = async (
    operationDesc: string,
    path: string,
    writeFn: () => Promise<void>
  ): Promise<void> => {
    if (!isSecretary) return;
    beginBusyOperation();
    setSaveStatus({ state: 'saving', message: 'Saving...' });

    let timeoutTimer: any;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        const timeoutErr: any = new Error(
          `Write to ${path} was not acknowledged by the Firestore cloud server within 10 seconds. Check your internet connection or Firebase setup.`
        );
        timeoutErr.code = 'deadline-exceeded';
        reject(timeoutErr);
      }, 10000);
    });

    try {
      // Execute the Firestore write mutation
      await writeFn();

      // Wait for the Firestore cloud server to confirm acknowledgment
      await Promise.race([waitForPendingWrites(db), timeoutPromise]);
      clearTimeout(timeoutTimer);

      // Server confirmed!
      setCloudError(null);
      setSaveStatus({ state: 'saved', message: 'Saved' });

      setTimeout(() => {
        setSaveStatus(prev => prev.state === 'saved' ? { state: 'idle' } : prev);
      }, 2500);
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const errorCode = err?.code || (err instanceof Error && 'code' in err ? (err as any).code : 'write-failed');
      const errorMessage = err?.message || String(err);

      console.error(`Firestore WRITE Error [${errorCode}] at ${path}:`, errorMessage, err);

      setCloudError({
        code: errorCode,
        message: errorMessage,
        path,
        operationDesc,
        timestamp: new Date().toLocaleTimeString(),
        retryFn: () => executeServerConfirmedWrite(operationDesc, path, writeFn)
      });

      setSaveStatus({ state: 'error', message: `Not saved: ${errorCode}` });
      throw err;
    } finally {
      endBusyOperation();
    }
  };

  // Sync public banner image independently of session loadedCollections so auth transitions never wipe it
  useEffect(() => {
    let active = true;
    const unsub = onSnapshot(doc(db, 'public_branding', 'banner'), (snap) => {
      if (!active) return;
      if (snap.exists()) {
        const data = snap.data();
        setPublicBannerImage(data?.imageUrl || data?.dataUrl || '');
      } else {
        setPublicBannerImage('');
      }
      clearCollectionError('public_branding/banner');
      setPublicBannerLoaded(true);
    }, (err: any) => {
      if (!active) return;
      console.warn('Public banner snapshot fallback:', err);
      setPublicBannerImage('');
      recordCollectionError('public_branding/banner', err);
      setPublicBannerLoaded(true);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [subscriptionEpoch, clearCollectionError, recordCollectionError]);

  // Sync collections strictly by role (Secretary = full access; Viewer = allowed read-only collections only when unlocked)
  useEffect(() => {
    const clearAllRoleData = () => {
      setNodes([]);
      setPeople([]);
      setPeoplePublic([]);
      setRegularServices([]);
      setOverrides([]);
      setEvents([]);
      setCategories([]);
      setAssignments([]);
      setSchedules([]);
      setMessageTemplates([]);
      setSentReminders([]);
      setTasks([]);
      setTaskCategories([]);
      setNotes([]);
      setForerunnerLessons([]);
      setForerunnerBulletins([]);
      setForerunnerAsset(null);
      setVisitors([]);
      setBannerImage('');
      setViewerSettings(defaultViewerSettings);
      setViewerNotes([]);
    };

    if (!currentUser) {
      hasSyncedPublicBrandingRef.current = false;
      hasSyncedPeoplePublicRef.current = false;
      clearAllRoleData();
      setSettings(defaultSettings);
      setCloudError(null);
      setSaveStatus({ state: 'idle' });
      setLoadedCollections({});
      setCollectionErrors({});
      return;
    }

    if (isViewer && !viewerUnlocked) {
      clearAllRoleData();
      setLoadedCollections({});
      setCollectionErrors({});
      return;
    }

    // Reset per-session loading trackers cleanly before starting role subscriptions
    setLoadedCollections({});
    setCollectionErrors({});

    let isDisposed = false;
    const activeUnsubs: Array<() => void> = [];
    const retryTimers: Array<ReturnType<typeof setTimeout>> = [];

    const attachResilientSnapshot = (
      key: string,
      pathLabel: string,
      startListener: (
        onNext: (snap: any) => void,
        onErr: (err: any) => void
      ) => () => void,
      handleData: (snap: any) => void,
      handleEmptyFallback: () => void
    ) => {
      let retriedOnce = false;
      let currentUnsub: (() => void) | null = null;

      const subscribe = () => {
        if (isDisposed) return;
        currentUnsub = startListener(
          (snap) => {
            if (isDisposed) return;
            handleData(snap);
            clearCollectionError(pathLabel);
            markLoaded(key);
          },
          (err) => {
            if (isDisposed) return;
            const code = err?.code || 'read-error';
            if (!retriedOnce && (code === 'permission-denied' || code === 'unavailable')) {
              retriedOnce = true;
              if (currentUnsub) {
                try { currentUnsub(); } catch {}
              }
              const timer = setTimeout(() => {
                if (!isDisposed) subscribe();
              }, 350);
              retryTimers.push(timer);
              return;
            }
            console.warn(`Firestore READ fallback [${code}] at ${pathLabel}:`, err?.message || err);
            handleEmptyFallback();
            recordCollectionError(pathLabel, err);
            markLoaded(key);
          }
        );
      };

      subscribe();
      activeUnsubs.push(() => {
        if (currentUnsub) {
          try { currentUnsub(); } catch {}
        }
      });
    };

    // Allowed shared listeners for both Secretary and unlocked Viewer
    attachResilientSnapshot(
      'nodes',
      APP_COLLECTIONS.outline_nodes.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.outline_nodes.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as OutlineNode));
        items.sort((a: OutlineNode, b: OutlineNode) => a.order - b.order);
        setNodes(items);
      },
      () => setNodes([])
    );

    attachResilientSnapshot(
      'regularServices',
      APP_COLLECTIONS.regular_services.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.regular_services.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as RegularService));
        setRegularServices(items);
      },
      () => setRegularServices([])
    );

    attachResilientSnapshot(
      'overrides',
      APP_COLLECTIONS.service_overrides.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.service_overrides.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as ServiceOverride));
        setOverrides(items);
      },
      () => setOverrides([])
    );

    attachResilientSnapshot(
      'events',
      APP_COLLECTIONS.events.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.events.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as ChurchEvent));
        items.sort((a: ChurchEvent, b: ChurchEvent) => a.startDate.localeCompare(b.startDate));
        setEvents(items);
      },
      () => setEvents([])
    );

    attachResilientSnapshot(
      'assignments',
      APP_COLLECTIONS.assignments.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.assignments.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as RoleAssignment));
        setAssignments(items);
      },
      () => setAssignments([])
    );

    attachResilientSnapshot(
      'schedules',
      APP_COLLECTIONS.schedules.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.schedules.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Schedule));
        items.sort((a: Schedule, b: Schedule) => b.startDate.localeCompare(a.startDate));
        setSchedules(items);
      },
      () => setSchedules([])
    );

    if (isViewer) {
      // Viewer reads people_public ONLY (never people, settings, visitors, tasks, etc.)
      attachResilientSnapshot(
        'people',
        APP_COLLECTIONS.people_public.id,
        (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.people_public.id), onNext, onErr),
        (snap) => {
          const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as PersonPublic));
          items.sort((a: PersonPublic, b: PersonPublic) => a.name.localeCompare(b.name));
          setPeoplePublic(items);
        },
        () => setPeoplePublic([])
      );

      // Mark secretary-only collections loaded so UI never hangs or emits permission errors
      markLoaded('settings');
      markLoaded('banner');
      markLoaded('categories');
      markLoaded('messageTemplates');
      markLoaded('sentReminders');
      markLoaded('tasks');
      markLoaded('taskCategories');
      markLoaded('notes');
      markLoaded('forerunnerLessons');
      markLoaded('forerunnerSettings');
      markLoaded('forerunnerBulletins');
      markLoaded('forerunnerAsset');
      markLoaded('visitors');
      markLoaded('visitorSettings');
      markLoaded('viewerSettings');
      markLoaded('viewerNotes');

      return () => {
        isDisposed = true;
        retryTimers.forEach(clearTimeout);
        activeUnsubs.forEach(u => u());
      };
    }

    // ---------------- SECRETARY-ONLY LISTENERS ----------------
    attachResilientSnapshot(
      'settings',
      `${APP_COLLECTIONS.settings.id}/app`,
      (onNext, onErr) => onSnapshot(doc(db, APP_COLLECTIONS.settings.id, 'app'), onNext, onErr),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          const normalized = normalizeAppearance(data?.theme, data?.colorScheme);
          const safeAccent: AccentColor = normalizeAccentColor(data?.accentColor, 'red');

          setSettings({
            ...defaultSettings,
            ...data,
            theme: normalized.theme,
            colorScheme: normalized.colorScheme,
            accentColor: safeAccent,
            clockStyle: data.clockStyle === 'analog' ? 'analog' : 'digital',
            clockColor: data.clockColor === 'black' ? 'black' : 'white',
            showDailyVerse: data.showDailyVerse ?? true,
          });
        }
      },
      () => setSettings(defaultSettings)
    );

    attachResilientSnapshot(
      'banner',
      `${APP_COLLECTIONS.settings.id}/banner`,
      (onNext, onErr) => onSnapshot(doc(db, APP_COLLECTIONS.settings.id, 'banner'), onNext, onErr),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBannerImage(data?.imageUrl || data?.dataUrl || '');
        } else {
          setBannerImage('');
        }
      },
      () => setBannerImage('')
    );

    attachResilientSnapshot(
      'viewerSettings',
      `${APP_COLLECTIONS.viewer_settings.id}/config`,
      (onNext, onErr) => onSnapshot(doc(db, APP_COLLECTIONS.viewer_settings.id, 'config'), onNext, onErr),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<ViewerSettings>;
          setViewerSettings({
            mode: data.mode === 'open' ? 'open' : 'passcode',
            passcode: typeof data.passcode === 'string' ? data.passcode : '',
            passcodeVersion: typeof data.passcodeVersion === 'number' ? data.passcodeVersion : 1,
            secretaryIdleMinutes: normalizeIdleMinutes(data.secretaryIdleMinutes, 60),
            viewerIdleMinutes: normalizeIdleMinutes(data.viewerIdleMinutes, 30),
            updatedAt: data.updatedAt
          });
        } else {
          setViewerSettings(defaultViewerSettings);
        }
      },
      () => setViewerSettings(defaultViewerSettings)
    );

    attachResilientSnapshot(
      'viewerNotes',
      APP_COLLECTIONS.viewer_notes.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.viewer_notes.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => {
          const data = d.data() as Partial<ViewerNote>;
          return {
            id: d.id,
            message: typeof data.message === 'string' ? data.message : '',
            name: typeof data.name === 'string' ? data.name : undefined,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
            status: data.status === 'done' ? 'done' : 'new'
          } as ViewerNote;
        });
        items.sort((a: ViewerNote, b: ViewerNote) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setViewerNotes(items);
      },
      () => setViewerNotes([])
    );

    attachResilientSnapshot(
      'people',
      APP_COLLECTIONS.people.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.people.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Person));
        items.sort((a: Person, b: Person) => a.name.localeCompare(b.name));
        setPeople(items);
      },
      () => setPeople([])
    );

    attachResilientSnapshot(
      'categories',
      APP_COLLECTIONS.categories.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.categories.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as EventCategory));
        setCategories(items);
      },
      () => setCategories([])
    );

    attachResilientSnapshot(
      'messageTemplates',
      APP_COLLECTIONS.message_templates.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.message_templates.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as MessageTemplate));
        items.sort((a: MessageTemplate, b: MessageTemplate) => a.name.localeCompare(b.name));
        setMessageTemplates(items);
      },
      () => setMessageTemplates([])
    );

    attachResilientSnapshot(
      'sentReminders',
      APP_COLLECTIONS.sent_reminders.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.sent_reminders.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as SentReminder));
        setSentReminders(items);
      },
      () => setSentReminders([])
    );

    attachResilientSnapshot(
      'tasks',
      APP_COLLECTIONS.tasks.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.tasks.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Task));
        items.sort((a: Task, b: Task) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setTasks(items);
      },
      () => setTasks([])
    );

    attachResilientSnapshot(
      'taskCategories',
      APP_COLLECTIONS.task_categories.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.task_categories.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as TaskCategory));
        items.sort((a: TaskCategory, b: TaskCategory) => a.name.localeCompare(b.name));
        setTaskCategories(items);
      },
      () => setTaskCategories([])
    );

    attachResilientSnapshot(
      'notes',
      APP_COLLECTIONS.notes.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.notes.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as QuickNote));
        items.sort((a: QuickNote, b: QuickNote) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        setNotes(items);
      },
      () => setNotes([])
    );

    attachResilientSnapshot(
      'forerunnerLessons',
      APP_COLLECTIONS.forerunner_lessons.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.forerunner_lessons.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as ForerunnerLesson));
        items.sort((a: ForerunnerLesson, b: ForerunnerLesson) => (b.lessonDate || b.createdAt || '').localeCompare(a.lessonDate || a.createdAt || ''));
        setForerunnerLessons(items);
      },
      () => setForerunnerLessons([])
    );

    attachResilientSnapshot(
      'forerunnerSettings',
      `${APP_COLLECTIONS.forerunner_settings.id}/format`,
      (onNext, onErr) => onSnapshot(doc(db, APP_COLLECTIONS.forerunner_settings.id, 'format'), onNext, onErr),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ForerunnerFormatSettings;
          let updatedPositions = data.bulletinPositions ? { ...data.bulletinPositions } : { ...DEFAULT_BULLETIN_POSITIONS };
          if (!updatedPositions.pastor || updatedPositions.pastor.h > 4.5 || updatedPositions.pastor.y < 3.20) {
            updatedPositions.pastor = { ...DEFAULT_BULLETIN_POSITIONS.pastor };
          }
          setForerunnerSettings(prev => ({
            ...prev,
            ...data,
            bulletinPositions: updatedPositions
          } as ForerunnerFormatSettings));
        }
      },
      () => {}
    );

    attachResilientSnapshot(
      'forerunnerBulletins',
      APP_COLLECTIONS.forerunner_bulletins.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.forerunner_bulletins.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as ForerunnerBulletin));
        items.sort((a: ForerunnerBulletin, b: ForerunnerBulletin) => (b.bulletinDate || '').localeCompare(a.bulletinDate || ''));
        setForerunnerBulletins(items);
      },
      () => setForerunnerBulletins([])
    );

    attachResilientSnapshot(
      'forerunnerAsset',
      `${APP_COLLECTIONS.forerunner_assets.id}/page2_bg`,
      (onNext, onErr) => onSnapshot(doc(db, APP_COLLECTIONS.forerunner_assets.id, 'page2_bg'), onNext, onErr),
      (snap) => {
        if (snap.exists()) {
          setForerunnerAsset({ ...snap.data(), id: snap.id } as ForerunnerAsset);
        } else {
          setForerunnerAsset(null);
        }
      },
      () => setForerunnerAsset(null)
    );

    attachResilientSnapshot(
      'visitors',
      APP_COLLECTIONS.visitors.id,
      (onNext, onErr) => onSnapshot(collection(db, APP_COLLECTIONS.visitors.id), onNext, onErr),
      (snap) => {
        const items = snap.docs.map((d: any) => {
          const data = d.data() as Visitor;
          return {
            ...data,
            id: d.id,
            visits: Array.isArray(data.visits) ? data.visits : []
          };
        });
        items.sort((a: Visitor, b: Visitor) => {
          const aDate = a.visits?.[0] || a.createdAt || '';
          const bDate = b.visits?.[0] || b.createdAt || '';
          return bDate.localeCompare(aDate);
        });
        setVisitors(items);
      },
      () => setVisitors([])
    );

    attachResilientSnapshot(
      'visitorSettings',
      `${APP_COLLECTIONS.visitor_settings.id}/config`,
      (onNext, onErr) => onSnapshot(doc(db, APP_COLLECTIONS.visitor_settings.id, 'config'), onNext, onErr),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as VisitorSettings;
          setVisitorSettings({
            ageGroups: Array.isArray(data.ageGroups) && data.ageGroups.length > 0
              ? data.ageGroups
              : DEFAULT_VISITOR_AGE_GROUPS,
            updatedAt: data.updatedAt
          });
        }
      },
      () => {}
    );

    return () => {
      isDisposed = true;
      retryTimers.forEach(clearTimeout);
      activeUnsubs.forEach(u => u());
    };
  }, [currentUser?.uid, role, isSecretary, isViewer, viewerUnlocked, subscriptionEpoch, markLoaded, clearCollectionError, recordCollectionError]);

  // One-time safe sync of public_branding (creates/updates public_branding only, never touches settings/app)
  useEffect(() => {
    if (!isSecretary || !loadedCollections.settings || !loadedCollections.banner || !loadedCollections.viewerSettings) {
      return;
    }
    if (hasSyncedPublicBrandingRef.current) return;
    hasSyncedPublicBrandingRef.current = true;

    const desired = buildPublicBrandingPayload(settings, viewerSettings);
    const needsBrandingWrite = !publicBrandingExists ||
      publicBranding.churchName !== desired.churchName ||
      publicBranding.churchLogo !== desired.churchLogo ||
      (publicBranding.facebookLink || '') !== (desired.facebookLink || '') ||
      publicBranding.theme !== desired.theme ||
      (publicBranding.colorScheme || DEFAULT_COLOR_SCHEME) !== desired.colorScheme ||
      publicBranding.accentColor !== desired.accentColor ||
      (publicBranding.clockStyle || 'digital') !== desired.clockStyle ||
      (publicBranding.clockColor || 'white') !== desired.clockColor ||
      publicBranding.weekStartDay !== desired.weekStartDay ||
      publicBranding.timeFormat !== desired.timeFormat ||
      publicBranding.showDailyVerse !== desired.showDailyVerse ||
      publicBranding.viewerMode !== desired.viewerMode ||
      publicBranding.viewerPasscodeConfigured !== desired.viewerPasscodeConfigured ||
      publicBranding.viewerPasscodeVersion !== desired.viewerPasscodeVersion ||
      normalizeIdleMinutes(publicBranding.viewerIdleMinutes, 30) !== desired.viewerIdleMinutes;

    if (needsBrandingWrite) {
      setDoc(doc(db, 'public_branding', 'app'), sanitizeForFirestore(desired)).catch((err) => {
        console.warn('Public branding sync warning:', err);
      });
    }

    if (bannerImage && bannerImage !== publicBannerImage) {
      setDoc(doc(db, 'public_branding', 'banner'), {
        imageUrl: bannerImage,
        updatedAt: new Date().toISOString()
      }).catch((err) => {
        console.warn('Public banner sync warning:', err);
      });
    }
  }, [
    isSecretary,
    loadedCollections.settings,
    loadedCollections.banner,
    loadedCollections.viewerSettings,
    settings,
    viewerSettings,
    publicBrandingExists,
    publicBranding,
    bannerImage,
    publicBannerImage
  ]);

  // One-time safe build of people_public from existing members (creates missing docs in people_public only, never touches people)
  useEffect(() => {
    if (!isSecretary || !loadedCollections.people || hasSyncedPeoplePublicRef.current) return;
    hasSyncedPeoplePublicRef.current = true;

    if (people.length === 0) return;

    (async () => {
      try {
        const existingSnap = await getDocs(collection(db, 'people_public'));
        const existingIds = new Set(existingSnap.docs.map(d => d.id));
        const missing = people.filter(p => !existingIds.has(p.id));
        if (missing.length === 0) return;

        for (let i = 0; i < missing.length; i += 450) {
          const chunk = missing.slice(i, i + 450);
          const batch = writeBatch(db);
          for (const person of chunk) {
            batch.set(doc(db, 'people_public', person.id), sanitizeForFirestore(toPersonPublic(person)));
          }
          await batch.commit();
        }
      } catch (err) {
        console.warn('Initial people_public sync warning:', err);
      }
    })();
  }, [isSecretary, loadedCollections.people, people]);

  // Update Settings (Viewer updates device-only localStorage; Secretary updates Firestore)
  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (isViewer) {
      setViewerPrefs(prev => {
        const next: ViewerDevicePrefs = { ...prev };
        if (newSettings.theme && isValidThemeId(newSettings.theme)) {
          next.theme = newSettings.theme;
        }
        if (newSettings.colorScheme && isValidColorScheme(newSettings.colorScheme)) {
          next.colorScheme = newSettings.colorScheme;
        }
        if (newSettings.accentColor && isValidAccentColor(newSettings.accentColor)) {
          next.accentColor = newSettings.accentColor;
        }
        saveViewerDevicePrefs(next);
        return next;
      });
      return;
    }
    if (!isSecretary) return;

    await executeServerConfirmedWrite('Update Church Settings', 'settings/app', async () => {
      const updated = {
        ...settings,
        ...newSettings,
        updatedAt: new Date().toISOString()
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'app'), sanitizeForFirestore(updated), { merge: true });
      batch.set(
        doc(db, 'public_branding', 'app'),
        sanitizeForFirestore(buildPublicBrandingPayload(updated, viewerSettings))
      );
      await batch.commit();
    });
  };

  // Update Banner Image in its own separate document (and mirror to public_branding/banner)
  const updateBannerImage = async (imageUrl: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Home banner image', 'settings/banner', async () => {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'banner'), {
        imageUrl,
        updatedAt: now
      });
      batch.set(doc(db, 'public_branding', 'banner'), {
        imageUrl,
        updatedAt: now
      });
      await batch.commit();
    });
  };

  // Update Login Screen Background in its own single public document (public_branding/login_background)
  const updateLoginBackground = async (updates: Partial<LoginBackgroundConfig>) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Login screen background', 'public_branding/login_background', async () => {
      const nextConfig: LoginBackgroundConfig = {
        imageData: updates.imageData !== undefined ? updates.imageData : loginBackground.imageData,
        width: updates.width !== undefined ? updates.width : loginBackground.width,
        height: updates.height !== undefined ? updates.height : loginBackground.height,
        dimming: clampLoginDimming(updates.dimming !== undefined ? updates.dimming : loginBackground.dimming),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'public_branding', 'login_background'), sanitizeForFirestore(nextConfig));
    });
  };

  // Update Viewer Access & Security Settings (Secretary only)
  const updateViewerSettings = async (updates: Partial<ViewerSettings>) => {
    if (!isSecretary) return;
    const nextMode: ViewerAccessMode = updates.mode ?? viewerSettings.mode ?? 'passcode';
    const nextPasscode = updates.passcode !== undefined ? updates.passcode : (viewerSettings.passcode || '');
    const passcodeChanged = updates.passcode !== undefined && updates.passcode !== (viewerSettings.passcode || '');
    const nextVersion = passcodeChanged
      ? (viewerSettings.passcodeVersion || 1) + 1
      : (updates.passcodeVersion ?? viewerSettings.passcodeVersion ?? 1);
    const nextSecretaryIdle = updates.secretaryIdleMinutes !== undefined
      ? normalizeIdleMinutes(updates.secretaryIdleMinutes, 60)
      : normalizeIdleMinutes(viewerSettings.secretaryIdleMinutes, 60);
    const nextViewerIdle = updates.viewerIdleMinutes !== undefined
      ? normalizeIdleMinutes(updates.viewerIdleMinutes, 30)
      : normalizeIdleMinutes(viewerSettings.viewerIdleMinutes, 30);

    const nextViewerSettings: ViewerSettings = {
      mode: nextMode,
      passcode: nextPasscode,
      passcodeVersion: nextVersion,
      secretaryIdleMinutes: nextSecretaryIdle,
      viewerIdleMinutes: nextViewerIdle,
      updatedAt: new Date().toISOString()
    };

    await executeServerConfirmedWrite('Update Security & Viewer Settings', 'viewer_settings/config', async () => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'viewer_settings', 'config'), sanitizeForFirestore(nextViewerSettings));
      batch.set(
        doc(db, 'public_branding', 'app'),
        sanitizeForFirestore(buildPublicBrandingPayload(settings, nextViewerSettings))
      );
      await batch.commit();
    });
  };

  // Submit Note to the Secretary (Viewer create-only, or Secretary)
  const submitViewerNote = async (message: string, name?: string): Promise<void> => {
    if (!currentUser) {
      throw new Error('Please sign in first.');
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new Error('Please enter a message before sending.');
    }
    if (trimmedMessage.length > 500) {
      throw new Error('Message must be 500 characters or fewer.');
    }
    const trimmedName = (name || '').trim().slice(0, 100);

    await trackBusyOperation(async () => {
      const id = 'vnote_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
      const payload: {
        message: string;
        name?: string;
        createdAt: string;
        status: 'new';
      } = {
        message: trimmedMessage,
        createdAt: new Date().toISOString(),
        status: 'new'
      };
      if (trimmedName) {
        payload.name = trimmedName;
      }

      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          reject(new Error('Your note was not confirmed by the server in time. Please check your connection and try again.'));
        }, 10000);
      });

      try {
        await setDoc(doc(db, 'viewer_notes', id), sanitizeForFirestore(payload));
        await Promise.race([waitForPendingWrites(db), timeoutPromise]);
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
      }
    });
  };

  // Update Viewer Note status (Secretary only)
  const updateViewerNoteStatus = async (id: string, status: ViewerNoteStatus): Promise<void> => {
    if (!isSecretary) return;
    setViewerNotes(prev => prev.map(n => n.id === id ? { ...n, status } : n));
    await executeServerConfirmedWrite(
      status === 'done' ? 'Mark viewer note as done' : 'Reopen viewer note',
      `viewer_notes/${id}`,
      async () => {
        await updateDoc(doc(db, 'viewer_notes', id), sanitizeForFirestore({ status }));
      }
    );
  };

  // Delete Viewer Note (Secretary only)
  const deleteViewerNote = async (id: string): Promise<void> => {
    if (!isSecretary) return;
    setViewerNotes(prev => prev.filter(n => n.id !== id));
    await executeServerConfirmedWrite('Delete viewer note', `viewer_notes/${id}`, async () => {
      await deleteDoc(doc(db, 'viewer_notes', id));
    });
  };

  // Rebuild viewer-safe member copy (Secretary only)
  const rebuildPeoplePublic = async (): Promise<number> => {
    if (!isSecretary) return 0;
    let totalSynced = 0;
    await executeServerConfirmedWrite('Rebuild Viewer Member Copy', 'people_public', async () => {
      const [peopleSnap, publicSnap] = await Promise.all([
        getDocs(collection(db, 'people')),
        getDocs(collection(db, 'people_public'))
      ]);

      const activeIds = new Set(peopleSnap.docs.map(d => d.id));
      const ops: Array<{ type: 'set' | 'delete'; id: string; data?: PersonPublic }> = [];

      for (const pDoc of peopleSnap.docs) {
        const pData = pDoc.data() as Person;
        ops.push({
          type: 'set',
          id: pDoc.id,
          data: toPersonPublic({
            id: pDoc.id,
            name: pData.name || '',
            department: pData.department,
            birthdayMonth: pData.birthdayMonth,
            birthdayDay: pData.birthdayDay
          })
        });
        totalSynced++;
      }

      for (const pubDoc of publicSnap.docs) {
        if (!activeIds.has(pubDoc.id)) {
          ops.push({ type: 'delete', id: pubDoc.id });
        }
      }

      for (let i = 0; i < ops.length; i += 450) {
        const chunk = ops.slice(i, i + 450);
        const batch = writeBatch(db);
        for (const op of chunk) {
          if (op.type === 'set' && op.data) {
            batch.set(doc(db, 'people_public', op.id), sanitizeForFirestore(op.data));
          } else if (op.type === 'delete') {
            batch.delete(doc(db, 'people_public', op.id));
          }
        }
        await batch.commit();
      }
    });
    return totalSynced;
  };

  // ---------------- OUTLINE NODES ----------------
  const addNode = async (parentId = '', title = 'New Item', isRole = false): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'node_' + Math.random().toString(36).substring(2, 10);
    const siblings = nodes.filter(n => n.parentId === parentId);
    const maxOrder = siblings.reduce((max, n) => Math.max(max, n.order), -1);

    const newNode: OutlineNode = {
      id,
      title,
      parentId,
      order: maxOrder + 1,
      isRole,
      assignedPeopleIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await executeServerConfirmedWrite(`Add Outline Item "${title}"`, `outline_nodes/${id}`, async () => {
      await setDoc(doc(db, 'outline_nodes', id), sanitizeForFirestore(newNode));
    });
    return id;
  };

  const updateNode = async (id: string, updates: Partial<OutlineNode>) => {
    if (!isSecretary) return;
    // Optimistic local update for instantaneous responsiveness
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));

    await executeServerConfirmedWrite('Update Outline Item', `outline_nodes/${id}`, async () => {
      await updateDoc(doc(db, 'outline_nodes', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteNode = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Outline Item', `outline_nodes/${id}`, async () => {
      const batch = writeBatch(db);
      // Recursively gather IDs of node and all its children
      const toDeleteIds: string[] = [];
      const gather = (currId: string) => {
        toDeleteIds.push(currId);
        nodes.filter(n => n.parentId === currId).forEach(c => gather(c.id));
      };
      gather(id);

      for (const dId of toDeleteIds) {
        batch.delete(doc(db, 'outline_nodes', dId));
      }

      // Unlink removed roles from people records
      for (const p of people) {
        const remaining = p.roles.filter(r => !toDeleteIds.includes(r));
        if (remaining.length !== p.roles.length) {
          batch.update(doc(db, 'people', p.id), sanitizeForFirestore({
            roles: remaining,
            updatedAt: new Date().toISOString()
          }));
        }
      }

      await batch.commit();
    });
  };

  const indentNode = async (id: string) => {
    if (!isSecretary) return;
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const siblings = nodes.filter(n => n.parentId === node.parentId);
    const index = siblings.findIndex(n => n.id === id);
    if (index <= 0) return;

    const newParent = siblings[index - 1];
    const newSiblings = nodes.filter(n => n.parentId === newParent.id);
    const newOrder = newSiblings.reduce((max, n) => Math.max(max, n.order), -1) + 1;

    await updateNode(id, { parentId: newParent.id, order: newOrder });
  };

  const outdentNode = async (id: string) => {
    if (!isSecretary) return;
    const node = nodes.find(n => n.id === id);
    if (!node || !node.parentId) return;

    const currentParent = nodes.find(n => n.id === node.parentId);
    if (!currentParent) return;

    const grandparentsSiblings = nodes.filter(n => n.parentId === currentParent.parentId);
    const newOrder = currentParent.order + 1;

    // Shift later siblings down
    await executeServerConfirmedWrite('Outdent Outline Item', `outline_nodes/${id}`, async () => {
      const batch = writeBatch(db);
      for (const sibling of grandparentsSiblings.filter(n => n.order >= newOrder)) {
        batch.update(doc(db, 'outline_nodes', sibling.id), sanitizeForFirestore({
          order: sibling.order + 1,
          updatedAt: new Date().toISOString()
        }));
      }
      batch.update(doc(db, 'outline_nodes', id), sanitizeForFirestore({
        parentId: currentParent.parentId,
        order: newOrder,
        updatedAt: new Date().toISOString()
      }));
      await batch.commit();
    });
  };

  const reorderNodes = async (sourceId: string, targetParentId: string, newOrder: number) => {
    if (!isSecretary) return;
    await updateNode(sourceId, { parentId: targetParentId, order: newOrder });
  };

  const attachPersonToRole = async (roleId: string, personNameOrId: string) => {
    if (!isSecretary) return;
    const role = nodes.find(n => n.id === roleId);
    if (!role) return;

    await executeServerConfirmedWrite(`Attach Person to Role "${role.title}"`, `outline_nodes/${roleId}`, async () => {
      let person = people.find(p => p.id === personNameOrId || p.name.trim().toLowerCase() === personNameOrId.trim().toLowerCase());

      const batch = writeBatch(db);
      let targetPersonId = person?.id;

      if (!person) {
        // Create new person document
        const newPersonId = 'person_' + Math.random().toString(36).substring(2, 10);
        const newPerson: Person = {
          id: newPersonId,
          name: personNameOrId.trim(),
          roles: [roleId],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        batch.set(doc(db, 'people', newPersonId), sanitizeForFirestore(newPerson));
        batch.set(doc(db, 'people_public', newPersonId), sanitizeForFirestore(toPersonPublic(newPerson)));
        targetPersonId = newPersonId;
      } else {
        if (!person.roles.includes(roleId)) {
          batch.update(doc(db, 'people', person.id), sanitizeForFirestore({
            roles: [...person.roles, roleId],
            updatedAt: new Date().toISOString()
          }));
        }
      }

      if (targetPersonId && !role.assignedPeopleIds.includes(targetPersonId)) {
        batch.update(doc(db, 'outline_nodes', roleId), sanitizeForFirestore({
          isRole: true,
          assignedPeopleIds: [...role.assignedPeopleIds, targetPersonId],
          updatedAt: new Date().toISOString()
        }));
      }

      await batch.commit();
    });
  };

  const detachPersonFromRole = async (roleId: string, personId: string) => {
    if (!isSecretary) return;
    const role = nodes.find(n => n.id === roleId);
    const person = people.find(p => p.id === personId);
    if (!role || !person) return;

    await executeServerConfirmedWrite(`Detach Person from Role "${role.title}"`, `outline_nodes/${roleId}`, async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'outline_nodes', roleId), sanitizeForFirestore({
        assignedPeopleIds: role.assignedPeopleIds.filter(id => id !== personId),
        updatedAt: new Date().toISOString()
      }));
      batch.update(doc(db, 'people', personId), sanitizeForFirestore({
        roles: person.roles.filter(id => id !== roleId),
        updatedAt: new Date().toISOString()
      }));
      await batch.commit();
    });
  };

  // ---------------- PEOPLE ----------------
  const addPerson = async (name: string, details?: Partial<Person>): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'person_' + Math.random().toString(36).substring(2, 10);
    const newPerson: Person = {
      id,
      name: name.trim(),
      phone: details?.phone?.trim() || details?.contactNumber?.trim() || '',
      contactNumber: details?.contactNumber?.trim() || details?.phone?.trim() || '',
      email: details?.email?.trim() || '',
      address: details?.address?.trim() || '',
      notes: details?.notes?.trim() || '',
      roles: details?.roles || [],
      department: details?.department || '',
      facebookLink: details?.facebookLink?.trim() || '',
      barangay: details?.barangay?.trim() || '',
      birthdayMonth: details?.birthdayMonth,
      birthdayDay: details?.birthdayDay,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await executeServerConfirmedWrite(`Add Person "${name}"`, `people/${id}`, async () => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'people', id), sanitizeForFirestore(newPerson));
      batch.set(doc(db, 'people_public', id), sanitizeForFirestore(toPersonPublic(newPerson)));

      // Link roles
      for (const roleId of newPerson.roles) {
        const role = nodes.find(n => n.id === roleId);
        if (role && !role.assignedPeopleIds.includes(id)) {
          batch.update(doc(db, 'outline_nodes', roleId), sanitizeForFirestore({
            assignedPeopleIds: [...role.assignedPeopleIds, id],
            isRole: true,
            updatedAt: new Date().toISOString()
          }));
        }
      }

      await batch.commit();
    });
    return id;
  };

  const updatePerson = async (id: string, updates: Partial<Person>) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Person', `people/${id}`, async () => {
      const oldPerson = people.find(p => p.id === id);
      const batch = writeBatch(db);
      batch.update(doc(db, 'people', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));

      const mergedForPublic = {
        id,
        name: updates.name !== undefined ? updates.name : (oldPerson?.name || ''),
        department: updates.department !== undefined ? updates.department : oldPerson?.department,
        birthdayMonth: 'birthdayMonth' in updates ? updates.birthdayMonth : oldPerson?.birthdayMonth,
        birthdayDay: 'birthdayDay' in updates ? updates.birthdayDay : oldPerson?.birthdayDay
      };
      batch.set(doc(db, 'people_public', id), sanitizeForFirestore(toPersonPublic(mergedForPublic)));

      // If roles changed, synchronize outline_nodes
      if (updates.roles && oldPerson) {
        const added = updates.roles.filter(r => !oldPerson.roles.includes(r));
        const removed = oldPerson.roles.filter(r => !updates.roles!.includes(r));

        for (const rId of added) {
          const role = nodes.find(n => n.id === rId);
          if (role && !role.assignedPeopleIds.includes(id)) {
            batch.update(doc(db, 'outline_nodes', rId), sanitizeForFirestore({
              assignedPeopleIds: [...role.assignedPeopleIds, id],
              isRole: true,
              updatedAt: new Date().toISOString()
            }));
          }
        }

        for (const rId of removed) {
          const role = nodes.find(n => n.id === rId);
          if (role && role.assignedPeopleIds.includes(id)) {
            batch.update(doc(db, 'outline_nodes', rId), sanitizeForFirestore({
              assignedPeopleIds: role.assignedPeopleIds.filter(pid => pid !== id),
              updatedAt: new Date().toISOString()
            }));
          }
        }
      }

      // If person name changed, update any active schedule slot assignments
      if (updates.name && oldPerson && updates.name.trim() !== oldPerson.name) {
        const personAssignments = assignments.filter(a => a.personId === id);
        for (const a of personAssignments) {
          batch.update(doc(db, 'assignments', a.id), sanitizeForFirestore({
            personName: updates.name.trim(),
            updatedAt: new Date().toISOString()
          }));
        }
      }

      await batch.commit();
    });
  };

  const deletePerson = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Person', `people/${id}`, async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'people', id));
      batch.delete(doc(db, 'people_public', id));

      // Remove from outline nodes
      for (const node of nodes.filter(n => n.assignedPeopleIds.includes(id))) {
        batch.update(doc(db, 'outline_nodes', node.id), sanitizeForFirestore({
          assignedPeopleIds: node.assignedPeopleIds.filter(pid => pid !== id),
          updatedAt: new Date().toISOString()
        }));
      }

      // Remove from all schedule slot assignments safely
      for (const a of assignments.filter(a => a.personId === id)) {
        batch.delete(doc(db, 'assignments', a.id));
      }

      await batch.commit();
    });
  };

  // ---------------- REGULAR SERVICES ----------------
  const addRegularService = async (service: Omit<RegularService, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'service_' + Math.random().toString(36).substring(2, 10);
    const newService: RegularService = {
      ...service,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await executeServerConfirmedWrite(`Add Regular Service "${service.name}"`, `regular_services/${id}`, async () => {
      await setDoc(doc(db, 'regular_services', id), sanitizeForFirestore(newService));
    });
    return id;
  };

  const updateRegularService = async (id: string, updates: Partial<RegularService>) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Regular Service', `regular_services/${id}`, async () => {
      await updateDoc(doc(db, 'regular_services', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteRegularService = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Regular Service', `regular_services/${id}`, async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'regular_services', id));

      // Delete overrides
      for (const ov of overrides.filter(o => o.serviceId === id)) {
        batch.delete(doc(db, 'service_overrides', ov.id));
      }

      // Delete assignments
      for (const as of assignments.filter(a => a.targetId === id)) {
        batch.delete(doc(db, 'assignments', as.id));
      }

      await batch.commit();
    });
  };

  // ---------------- SERVICE OVERRIDES ----------------
  const setServiceOverride = async (override: ServiceOverride) => {
    if (!isSecretary) return;
    const id = `${override.serviceId}_${override.date}`;
    await executeServerConfirmedWrite(`Update Service Override for ${override.date}`, `service_overrides/${id}`, async () => {
      await setDoc(doc(db, 'service_overrides', id), sanitizeForFirestore({
        ...override,
        id,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteServiceOverride = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Service Override', `service_overrides/${id}`, async () => {
      await deleteDoc(doc(db, 'service_overrides', id));
    });
  };

  // ---------------- EVENTS & TEMPLATES ----------------
  const addEvent = async (event: Omit<ChurchEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'event_' + Math.random().toString(36).substring(2, 10);
    const newEvent: ChurchEvent = {
      ...event,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await executeServerConfirmedWrite(`Add Event "${event.title}"`, `events/${id}`, async () => {
      await setDoc(doc(db, 'events', id), sanitizeForFirestore(newEvent));
    });
    return id;
  };

  const updateEvent = async (id: string, updates: Partial<ChurchEvent>) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Event', `events/${id}`, async () => {
      await updateDoc(doc(db, 'events', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));

      // If event date changed, reschedule associated assignments
      if (updates.startDate) {
        const batch = writeBatch(db);
        const related = assignments.filter(a => a.targetId === id);
        for (const r of related) {
          batch.update(doc(db, 'assignments', r.id), sanitizeForFirestore({
            date: updates.startDate,
            startTime: updates.startTime || r.startTime,
            endTime: updates.endTime || r.endTime || '',
            updatedAt: new Date().toISOString()
          }));
        }
        await batch.commit();
      }
    });
  };

  const deleteEvent = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Event', `events/${id}`, async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'events', id));
      for (const a of assignments.filter(as => as.targetId === id)) {
        batch.delete(doc(db, 'assignments', a.id));
      }
      await batch.commit();
    });
  };

  // ---------------- CATEGORIES ----------------
  const addCategory = async (name: string, color: string): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'cat_' + Math.random().toString(36).substring(2, 10);
    await executeServerConfirmedWrite(`Add Event Category "${name}"`, `categories/${id}`, async () => {
      await setDoc(doc(db, 'categories', id), sanitizeForFirestore({ id, name, color }));
    });
    return id;
  };

  const updateCategory = async (id: string, updates: Partial<EventCategory>) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Event Category', `categories/${id}`, async () => {
      await updateDoc(doc(db, 'categories', id), sanitizeForFirestore(updates));
    });
  };

  const deleteCategory = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Event Category', `categories/${id}`, async () => {
      await deleteDoc(doc(db, 'categories', id));
    });
  };

  // ---------------- ASSIGNMENTS (Single Source of Truth) ----------------
  const saveAssignment = async (assignment: Omit<RoleAssignment, 'id' | 'updatedAt'>): Promise<string> => {
    if (!isSecretary) return '';
    const id = `${assignment.targetId}_${assignment.date}_${assignment.roleId}_${assignment.slotIndex}`;
    const payload: RoleAssignment = {
      ...assignment,
      id,
      updatedAt: new Date().toISOString()
    };

    await executeServerConfirmedWrite(`Save Assignment for ${assignment.roleName} on ${assignment.date}`, `assignments/${id}`, async () => {
      await setDoc(doc(db, 'assignments', id), sanitizeForFirestore(payload));
    });
    return id;
  };

  const deleteAssignment = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Assignment', `assignments/${id}`, async () => {
      await deleteDoc(doc(db, 'assignments', id));
    });
  };

  const batchSaveAssignments = async (newAssignments: Omit<RoleAssignment, 'id' | 'updatedAt'>[]) => {
    if (!isSecretary || newAssignments.length === 0) return;
    await executeServerConfirmedWrite(`Save ${newAssignments.length} Assignments Batch`, 'assignments/batch', async () => {
      const batch = writeBatch(db);
      for (const a of newAssignments) {
        const id = `${a.targetId}_${a.date}_${a.roleId}_${a.slotIndex}`;
        batch.set(doc(db, 'assignments', id), sanitizeForFirestore({
          ...a,
          id,
          updatedAt: new Date().toISOString()
        }));
      }
      await batch.commit();
    });
  };

  const clearAssignmentsInRange = async (targetId: string, roleId: string, dates: string[]) => {
    if (!isSecretary) return;
    const toDelete = assignments.filter(
      a => a.targetId === targetId && a.roleId === roleId && dates.includes(a.date)
    );
    if (toDelete.length === 0) return;

    await executeServerConfirmedWrite(`Clear ${toDelete.length} Assignments`, 'assignments/clear', async () => {
      const batch = writeBatch(db);
      for (const a of toDelete) {
        batch.delete(doc(db, 'assignments', a.id));
      }
      await batch.commit();
    });
  };

  // ---------------- SCHEDULES ----------------
  const addSchedule = async (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'sched_' + Math.random().toString(36).substring(2, 10);
    const newSchedule: Schedule = {
      ...schedule,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await executeServerConfirmedWrite(`Create Schedule for "${schedule.roleName}"`, `schedules/${id}`, async () => {
      await setDoc(doc(db, 'schedules', id), sanitizeForFirestore(newSchedule));
    });
    return id;
  };

  const updateSchedule = async (id: string, updates: Partial<Schedule>) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Update Schedule', `schedules/${id}`, async () => {
      await updateDoc(doc(db, 'schedules', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteSchedule = async (id: string, deleteAssociatedAssignments: boolean = false) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Schedule', `schedules/${id}`, async () => {
      const targetSchedule = schedules.find(s => s.id === id);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'schedules', id));

      if (deleteAssociatedAssignments && targetSchedule) {
        const matchingAssignments = assignments.filter(a =>
          a.roleId === targetSchedule.roleId &&
          a.date >= targetSchedule.startDate &&
          a.date <= targetSchedule.endDate
        );
        for (const as of matchingAssignments) {
          batch.delete(doc(db, 'assignments', as.id));
        }
      }

      await batch.commit();
    });
  };

  const duplicateSchedule = async (scheduleId: string): Promise<string> => {
    if (!isSecretary) return '';
    const target = schedules.find(s => s.id === scheduleId);
    if (!target) return '';
    const nextRange = getNextPeriodDateRange(target.startDate, target.endDate);
    return await addSchedule({
      roleId: target.roleId,
      roleName: target.roleName,
      startDate: nextRange.start,
      endDate: nextRange.end,
      serviceIds: target.serviceIds,
      includeEvents: target.includeEvents ?? false
    });
  };

  // ---------------- MESSAGE TEMPLATES ----------------
  const addMessageTemplate = async (
    templateData: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
    customId?: string
  ): Promise<string> => {
    if (!isSecretary) return '';
    const id = customId || ('tmpl_' + Math.random().toString(36).substring(2, 10));
    const newTmpl: MessageTemplate = {
      ...templateData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await executeServerConfirmedWrite(`Create Message Template "${templateData.name}"`, `message_templates/${id}`, async () => {
      await setDoc(doc(db, 'message_templates', id), sanitizeForFirestore(newTmpl), { merge: true });
    });
    return id;
  };

  const updateMessageTemplate = async (id: string, updates: Partial<MessageTemplate>) => {
    if (!isSecretary) return;
    setMessageTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
    await executeServerConfirmedWrite('Update Message Template', `message_templates/${id}`, async () => {
      await updateDoc(doc(db, 'message_templates', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString(),
      }));
    });
  };

  const deleteMessageTemplate = async (id: string) => {
    if (!isSecretary) return;
    await executeServerConfirmedWrite('Delete Message Template', `message_templates/${id}`, async () => {
      await deleteDoc(doc(db, 'message_templates', id));
    });
  };

  const duplicateMessageTemplate = async (id: string): Promise<string> => {
    if (!isSecretary) return '';
    const existing = messageTemplates.find(t => t.id === id);
    if (!existing) throw new Error('Template not found');
    const newId = 'tmpl_' + Math.random().toString(36).substring(2, 10);
    const newTmpl: MessageTemplate = {
      ...existing,
      id: newId,
      name: `${existing.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await executeServerConfirmedWrite(`Duplicate Template "${existing.name}"`, `message_templates/${newId}`, async () => {
      await setDoc(doc(db, 'message_templates', newId), sanitizeForFirestore(newTmpl));
    });
    return newId;
  };

  // ---------------- SENT REMINDERS ----------------
  const markReminderSent = async (templateId: string, occurrenceDate: string, targetId: string): Promise<string> => {
    if (!isSecretary) return '';
    const id = `${templateId}_${occurrenceDate}_${targetId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sentRecord: SentReminder = {
      id,
      templateId,
      occurrenceDate,
      targetId,
      sentAt: new Date().toISOString(),
    };
    await executeServerConfirmedWrite('Mark Reminder as Sent', `sent_reminders/${id}`, async () => {
      await setDoc(doc(db, 'sent_reminders', id), sanitizeForFirestore(sentRecord));
    });
    return id;
  };

  // ---------------- TASKS ----------------
  const addTask = async (
    taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>,
    customId?: string
  ): Promise<string> => {
    if (!isSecretary) return '';
    const id = customId || 'task_' + Math.random().toString(36).substring(2, 10);
    const newTask: Task = {
      ...taskData,
      id,
      priority: taskData.priority || 'normal',
      status: taskData.status || 'todo',
      completedDates: taskData.completedDates || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await executeServerConfirmedWrite(`Add Task "${newTask.title}"`, `tasks/${id}`, async () => {
      await setDoc(doc(db, 'tasks', id), sanitizeForFirestore(newTask));
    });
    return id;
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    if (!isSecretary) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
    await executeServerConfirmedWrite('Update Task', `tasks/${id}`, async () => {
      await updateDoc(doc(db, 'tasks', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteTask = async (id: string) => {
    if (!isSecretary) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    await executeServerConfirmedWrite('Delete Task', `tasks/${id}`, async () => {
      await deleteDoc(doc(db, 'tasks', id));
    });
  };

  const toggleTaskDone = async (taskId: string, occurrenceDate?: string) => {
    if (!isSecretary) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const isRepeating = task.repeat && task.repeat.type && task.repeat.type !== 'none';

    if (isRepeating && occurrenceDate) {
      // Repeating task occurrence toggle
      const currentCompleted = task.completedDates || [];
      const isDone = currentCompleted.includes(occurrenceDate);
      const nextCompleted = isDone
        ? currentCompleted.filter(d => d !== occurrenceDate)
        : [...currentCompleted, occurrenceDate];

      await updateTask(taskId, {
        completedDates: nextCompleted
      });
    } else {
      // Non-repeating task
      const nextStatus = task.status === 'done' ? 'todo' : 'done';
      await updateTask(taskId, {
        status: nextStatus
      });
    }
  };

  const snoozeTask = async (taskId: string, untilDate: string) => {
    if (!isSecretary) return;
    await updateTask(taskId, {
      snoozedUntil: untilDate
    });
  };

  // ---------------- TASK CATEGORIES ----------------
  const addTaskCategory = async (name: string, color: string): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'tcat_' + Math.random().toString(36).substring(2, 10);
    const newCat: TaskCategory = {
      id,
      name: name.trim(),
      color: color || '#0284c7',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await executeServerConfirmedWrite(`Add Task Category "${name}"`, `task_categories/${id}`, async () => {
      await setDoc(doc(db, 'task_categories', id), sanitizeForFirestore(newCat));
    });
    return id;
  };

  const updateTaskCategory = async (id: string, updates: Partial<TaskCategory>) => {
    if (!isSecretary) return;
    setTaskCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
    await executeServerConfirmedWrite('Update Task Category', `task_categories/${id}`, async () => {
      await updateDoc(doc(db, 'task_categories', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteTaskCategory = async (id: string) => {
    if (!isSecretary) return;
    // Deleting a category keeps its tasks as "No category"
    await executeServerConfirmedWrite('Delete Task Category', `task_categories/${id}`, async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'task_categories', id));

      // Reset categoryId on tasks in this category
      const affectedTasks = tasks.filter(t => t.categoryId === id);
      for (const t of affectedTasks) {
        batch.update(doc(db, 'tasks', t.id), {
          categoryId: '',
          updatedAt: new Date().toISOString()
        });
      }
      await batch.commit();
    });
  };

  // ---------------- QUICK NOTES ----------------
  const addNote = async (text: string, pinned: boolean = false): Promise<string> => {
    if (!isSecretary) return '';
    const id = 'note_' + Math.random().toString(36).substring(2, 10);
    const newNote: QuickNote = {
      id,
      text: text.trim(),
      pinned: !!pinned,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await executeServerConfirmedWrite('Add Quick Note', `notes/${id}`, async () => {
      await setDoc(doc(db, 'notes', id), sanitizeForFirestore(newNote));
    });
    return id;
  };

  const updateNote = async (id: string, updates: Partial<QuickNote>) => {
    if (!isSecretary) return;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));
    await executeServerConfirmedWrite('Update Quick Note', `notes/${id}`, async () => {
      await updateDoc(doc(db, 'notes', id), sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
    });
  };

  const deleteNote = async (id: string) => {
    if (!isSecretary) return;
    setNotes(prev => prev.filter(n => n.id !== id));
    await executeServerConfirmedWrite('Delete Quick Note', `notes/${id}`, async () => {
      await deleteDoc(doc(db, 'notes', id));
    });
  };

  const togglePinNote = async (id: string) => {
    if (!isSecretary) return;
    const current = notes.find(n => n.id === id);
    if (!current) return;
    const nextPinned = !current.pinned;
    await updateNote(id, { pinned: nextPinned });
  };

  // Computed: Assignable roles from outline tree (any node marked as role or has attached people or is a leaf)
  const assignableRoles = useMemo(() => {
    return nodes.filter(n => n.isRole || (n.assignedPeopleIds && n.assignedPeopleIds.length > 0));
  }, [nodes]);

  // Effective role-scoped state:
  // Viewers receive publicBranding + publicBannerImage + sanitized peoplePublic + device-only viewerPrefs.
  const effectiveSettings = useMemo<AppSettings>(() => {
    if (!isViewer) return settings;
    const baseAppearance = normalizeAppearance(publicBranding.theme, publicBranding.colorScheme);
    return {
      ...defaultSettings,
      churchName: publicBranding.churchName || DEFAULT_PUBLIC_BRANDING.churchName,
      churchLogo: publicBranding.churchLogo || '',
      secretaryName: '',
      facebookLink: publicBranding.facebookLink || '',
      theme: viewerPrefs.theme ?? baseAppearance.theme,
      colorScheme: viewerPrefs.colorScheme ?? baseAppearance.colorScheme,
      accentColor: normalizeAccentColor(viewerPrefs.accentColor || publicBranding.accentColor, 'red'),
      clockStyle: publicBranding.clockStyle === 'analog' ? 'analog' : 'digital',
      clockColor: publicBranding.clockColor === 'black' ? 'black' : 'white',
      weekStartDay: publicBranding.weekStartDay || 'sunday',
      timeFormat: publicBranding.timeFormat || '12h',
      showDailyVerse: publicBranding.showDailyVerse !== false,
      initialAccountCreated: true
    };
  }, [isViewer, settings, publicBranding, viewerPrefs]);

  const effectiveBannerImage = isViewer ? publicBannerImage : bannerImage;

  const effectivePeople = useMemo<Person[]>(() => {
    if (!isViewer) return people;
    const roleIdsByPerson = new Map<string, string[]>();
    for (const node of nodes) {
      for (const pId of node.assignedPeopleIds || []) {
        const list = roleIdsByPerson.get(pId) || [];
        list.push(node.id);
        roleIdsByPerson.set(pId, list);
      }
    }
    return peoplePublic.map((pub) => ({
      id: pub.id,
      name: pub.name,
      department: pub.department || '',
      birthdayMonth: pub.birthdayMonth,
      birthdayDay: pub.birthdayDay,
      roles: roleIdsByPerson.get(pub.id) || [],
      createdAt: '',
      updatedAt: ''
    }));
  }, [isViewer, people, peoplePublic, nodes]);

  const pendingLoadingParts = useMemo<string[]>(() => {
    if (!currentUser) return [];
    if (isViewer) {
      if (!viewerUnlocked) return [];
      const checks: Array<[boolean | undefined, string]> = [
        [loadedCollections.nodes, 'outline_nodes'],
        [loadedCollections.people, 'people_public'],
        [loadedCollections.regularServices, 'regular_services'],
        [loadedCollections.overrides, 'service_overrides'],
        [loadedCollections.events, 'events'],
        [loadedCollections.assignments, 'assignments'],
        [loadedCollections.schedules, 'schedules'],
        [publicBannerLoaded, 'public_branding/banner'],
      ];
      return checks.filter(([ok]) => !ok).map(([, name]) => name);
    }
    const secChecks: Array<[boolean | undefined, string]> = [
      [loadedCollections.settings, 'settings/app'],
      [loadedCollections.viewerSettings, 'viewer_settings/config'],
      [loadedCollections.nodes, 'outline_nodes'],
      [loadedCollections.people, 'people'],
      [loadedCollections.regularServices, 'regular_services'],
      [loadedCollections.overrides, 'service_overrides'],
      [loadedCollections.events, 'events'],
      [loadedCollections.assignments, 'assignments'],
      [loadedCollections.schedules, 'schedules'],
      [loadedCollections.tasks, 'tasks'],
      [loadedCollections.notes, 'notes'],
      [loadedCollections.messageTemplates, 'message_templates'],
      [loadedCollections.visitors, 'visitors'],
      [loadedCollections.forerunnerLessons, 'forerunner_lessons'],
      [loadedCollections.forerunnerBulletins, 'forerunner_bulletins'],
    ];
    return secChecks.filter(([ok]) => !ok).map(([, name]) => name);
  }, [currentUser, isViewer, viewerUnlocked, loadedCollections, publicBannerLoaded]);

  const value: DataContextType = {
    settings: effectiveSettings,
    updateSettings,
    bannerImage: effectiveBannerImage,
    updateBannerImage,
    loginBackground,
    updateLoginBackground,
    saveStatus,
    cloudError,
    clearCloudError,

    nodes,
    addNode,
    updateNode,
    deleteNode,
    indentNode,
    outdentNode,
    reorderNodes,
    attachPersonToRole,
    detachPersonFromRole,

    people: effectivePeople,
    addPerson,
    updatePerson,
    deletePerson,

    regularServices,
    addRegularService,
    updateRegularService,
    deleteRegularService,

    overrides,
    setServiceOverride,
    deleteServiceOverride,

    events,
    addEvent,
    updateEvent,
    deleteEvent,

    categories,
    addCategory,
    updateCategory,
    deleteCategory,

    assignments,
    saveAssignment,
    deleteAssignment,
    batchSaveAssignments,
    clearAssignmentsInRange,

    schedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    duplicateSchedule,

    messageTemplates,
    addMessageTemplate,
    updateMessageTemplate,
    deleteMessageTemplate,
    duplicateMessageTemplate,

    sentReminders,
    markReminderSent,

    tasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskDone,
    snoozeTask,

    taskCategories,
    addTaskCategory,
    updateTaskCategory,
    deleteTaskCategory,

    notes,
    addNote,
    updateNote,
    deleteNote,
    togglePinNote,

    forerunnerLessons,
    forerunnerSettings,
    addForerunnerLesson: async (lesson: Omit<ForerunnerLesson, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!isSecretary) return '';
      const id = 'flesson_' + Math.random().toString(36).substring(2, 10);
      const newLesson: ForerunnerLesson = {
        ...lesson,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await executeServerConfirmedWrite(`Save Lesson "${lesson.passage || 'Untitled'}"`, `forerunner_lessons/${id}`, async () => {
        await setDoc(doc(db, 'forerunner_lessons', id), sanitizeForFirestore(newLesson));
      });
      if (lesson.seriesTitle && lesson.seriesTitle.trim()) {
        try {
          await setDoc(doc(db, 'forerunner_settings', 'format'), sanitizeForFirestore({
            lastUsedSeriesTitle: lesson.seriesTitle.trim(),
            updatedAt: new Date().toISOString()
          }), { merge: true });
        } catch (e) {
          // Non-critical
        }
      }
      return id;
    },
    updateForerunnerLesson: async (id: string, updates: Partial<ForerunnerLesson>) => {
      if (!isSecretary) return;
      setForerunnerLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l));
      await executeServerConfirmedWrite('Update Sunday School Lesson', `forerunner_lessons/${id}`, async () => {
        await updateDoc(doc(db, 'forerunner_lessons', id), sanitizeForFirestore({
          ...updates,
          updatedAt: new Date().toISOString()
        }));
      });
      if (updates.seriesTitle && updates.seriesTitle.trim()) {
        try {
          await setDoc(doc(db, 'forerunner_settings', 'format'), sanitizeForFirestore({
            lastUsedSeriesTitle: updates.seriesTitle.trim(),
            updatedAt: new Date().toISOString()
          }), { merge: true });
        } catch (e) {
          // Non-critical
        }
      }
    },
    deleteForerunnerLesson: async (id: string) => {
      if (!isSecretary) return;
      setForerunnerLessons(prev => prev.filter(l => l.id !== id));
      await executeServerConfirmedWrite('Delete Lesson', `forerunner_lessons/${id}`, async () => {
        await deleteDoc(doc(db, 'forerunner_lessons', id));
      });
    },
    updateForerunnerSettings: async (updates: Partial<ForerunnerFormatSettings>) => {
      if (!isSecretary) return;
      setForerunnerSettings(prev => ({ ...prev, ...updates, updatedAt: new Date().toISOString() }));
      await executeServerConfirmedWrite('Update Format Settings', 'forerunner_settings/format', async () => {
        await setDoc(doc(db, 'forerunner_settings', 'format'), sanitizeForFirestore({
          ...forerunnerSettings,
          ...updates,
          updatedAt: new Date().toISOString()
        }), { merge: true });
      });
    },
    resetForerunnerSettings: async () => {
      if (!isSecretary) return;
      const defaults: ForerunnerFormatSettings = {
        fontName: 'Abadi',
        startingFontSize: 13,
        minFontSize: 12,
        maxFontSize: 16,
        autoFitFontSize: true,
        page1Width: 8.23,
        page1Height: 12.73,
        page2Width: 6.19,
        page2Height: 8.14,
        margins: 0.12,
        border: true,
        blankLineSize: 10,
        minBlankLineSize: 4,
        defaultAlignment: 'justified',
        lastUsedSeriesTitle: '',
        bulletinPositions: DEFAULT_BULLETIN_POSITIONS,
        pastorClosingLine: '',
        pastorName: '',
        pastorTitle: '',
        pastorStyleSamples: '',
        pastorTargetWords: 117
      };
      setForerunnerSettings(defaults);
      await executeServerConfirmedWrite('Reset Format Settings', 'forerunner_settings/format', async () => {
        await setDoc(doc(db, 'forerunner_settings', 'format'), sanitizeForFirestore({
          ...defaults,
          updatedAt: new Date().toISOString()
        }));
      });
    },

    forerunnerBulletins,
    forerunnerAsset,
    saveForerunnerAsset: async (assetData: Omit<ForerunnerAsset, 'id' | 'updatedAt'>) => {
      if (!isSecretary) return;
      const fullDoc: ForerunnerAsset = {
        ...assetData,
        id: 'page2_bg',
        updatedAt: new Date().toISOString()
      };
      setForerunnerAsset(fullDoc);
      await executeServerConfirmedWrite('Save Bulletin Background Picture', 'forerunner_assets/page2_bg', async () => {
        await setDoc(doc(db, 'forerunner_assets', 'page2_bg'), sanitizeForFirestore(fullDoc));
      });
    },
    saveForerunnerBulletin: async (bulletin: ForerunnerBulletin) => {
      if (!isSecretary) return;
      const fullDoc = {
        ...bulletin,
        updatedAt: new Date().toISOString()
      };
      setForerunnerBulletins(prev => {
        const idx = prev.findIndex(b => b.id === bulletin.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = fullDoc;
          return copy;
        }
        return [fullDoc, ...prev];
      });
      await executeServerConfirmedWrite(`Save Bulletin for ${bulletin.bulletinDate}`, `forerunner_bulletins/${bulletin.id}`, async () => {
        await setDoc(doc(db, 'forerunner_bulletins', bulletin.id), sanitizeForFirestore(fullDoc));
      });
    },
    deleteForerunnerBulletin: async (id: string) => {
      if (!isSecretary) return;
      setForerunnerBulletins(prev => prev.filter(b => b.id !== id));
      await executeServerConfirmedWrite(`Delete Bulletin ${id}`, `forerunner_bulletins/${id}`, async () => {
        await deleteDoc(doc(db, 'forerunner_bulletins', id));
      });
    },

    visitors,
    visitorSettings,
    addVisitor: async (visitorData: Omit<Visitor, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
      if (!isSecretary) return '';
      const id = 'vis_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
      const now = new Date().toISOString();
      const sortedVisits = Array.from(new Set((visitorData.visits || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      const newVisitor: Visitor = {
        ...visitorData,
        id,
        visits: sortedVisits,
        createdAt: now,
        updatedAt: now
      };
      setVisitors(prev => [newVisitor, ...prev]);
      await executeServerConfirmedWrite(`Add Visitor "${visitorData.name}"`, `visitors/${id}`, async () => {
        await setDoc(doc(db, 'visitors', id), sanitizeForFirestore(newVisitor));
      });
      return id;
    },
    updateVisitor: async (id: string, updates: Partial<Visitor>) => {
      if (!isSecretary) return;
      const now = new Date().toISOString();
      const normalizedUpdates: Partial<Visitor> = { ...updates, updatedAt: now };
      if (updates.visits) {
        normalizedUpdates.visits = Array.from(new Set(updates.visits.filter(Boolean))).sort((a, b) => a.localeCompare(b));
      }
      setVisitors(prev => prev.map(v => v.id === id ? { ...v, ...normalizedUpdates } : v));
      await executeServerConfirmedWrite('Update Visitor', `visitors/${id}`, async () => {
        await updateDoc(doc(db, 'visitors', id), sanitizeForFirestore(normalizedUpdates));
      });
    },
    deleteVisitor: async (id: string) => {
      if (!isSecretary) return;
      setVisitors(prev => prev.filter(v => v.id !== id));
      await executeServerConfirmedWrite('Delete Visitor', `visitors/${id}`, async () => {
        await deleteDoc(doc(db, 'visitors', id));
      });
    },
    addVisitorReturnVisit: async (id: string, visitDate: string) => {
      if (!isSecretary) return;
      const existing = visitors.find(v => v.id === id);
      if (!existing) return;
      const now = new Date().toISOString();
      const updatedVisits = Array.from(new Set([...(existing.visits || []), visitDate].filter(Boolean))).sort((a, b) => a.localeCompare(b));
      setVisitors(prev => prev.map(v => v.id === id ? { ...v, visits: updatedVisits, updatedAt: now } : v));
      await executeServerConfirmedWrite(`Add Return Visit for "${existing.name}"`, `visitors/${id}`, async () => {
        await updateDoc(doc(db, 'visitors', id), sanitizeForFirestore({
          visits: updatedVisits,
          updatedAt: now
        }));
      });
    },
    updateVisitorSettings: async (updates: Partial<VisitorSettings>) => {
      if (!isSecretary) return;
      const now = new Date().toISOString();
      const next: VisitorSettings = {
        ...visitorSettings,
        ...updates,
        updatedAt: now
      };
      setVisitorSettings(next);
      await executeServerConfirmedWrite('Update Visitor Age Groups', 'visitor_settings/config', async () => {
        await setDoc(doc(db, 'visitor_settings', 'config'), sanitizeForFirestore(next));
      });
    },

    viewerSettings,
    updateViewerSettings,
    rebuildPeoplePublic,

    viewerNotes,
    submitViewerNote,
    updateViewerNoteStatus,
    deleteViewerNote,

    isBusyOperation,
    beginBusyOperation,
    endBusyOperation,
    trackBusyOperation,

    dataLoading: {
      settings: isSecretary ? !loadedCollections.settings : !publicBannerLoaded,
      initial: !currentUser
        ? false
        : isViewer
          ? (viewerUnlocked
              ? !(
                  loadedCollections.nodes &&
                  loadedCollections.people &&
                  loadedCollections.regularServices &&
                  loadedCollections.overrides &&
                  loadedCollections.events &&
                  loadedCollections.assignments &&
                  loadedCollections.schedules &&
                  publicBannerLoaded
                )
              : false)
          : !(
              loadedCollections.settings &&
              loadedCollections.viewerSettings &&
              loadedCollections.nodes &&
              loadedCollections.people &&
              loadedCollections.regularServices &&
              loadedCollections.overrides &&
              loadedCollections.events &&
              loadedCollections.assignments &&
              loadedCollections.schedules &&
              loadedCollections.tasks &&
              loadedCollections.notes &&
              loadedCollections.messageTemplates &&
              loadedCollections.visitors &&
              loadedCollections.forerunnerLessons &&
              loadedCollections.forerunnerBulletins
            ),
      home: isViewer
        ? !(
            loadedCollections.regularServices &&
            loadedCollections.events &&
            loadedCollections.overrides &&
            loadedCollections.assignments &&
            loadedCollections.nodes &&
            loadedCollections.people
          )
        : !(
            loadedCollections.regularServices &&
            loadedCollections.events &&
            loadedCollections.overrides &&
            loadedCollections.assignments &&
            loadedCollections.nodes &&
            loadedCollections.people &&
            loadedCollections.messageTemplates &&
            loadedCollections.sentReminders &&
            loadedCollections.tasks &&
            loadedCollections.taskCategories &&
            loadedCollections.visitors
          ),
      calendar: isViewer
        ? !(
            loadedCollections.regularServices &&
            loadedCollections.events &&
            loadedCollections.overrides &&
            loadedCollections.assignments &&
            loadedCollections.nodes &&
            loadedCollections.people
          )
        : !(
            loadedCollections.regularServices &&
            loadedCollections.events &&
            loadedCollections.overrides &&
            loadedCollections.assignments &&
            loadedCollections.categories &&
            loadedCollections.nodes &&
            loadedCollections.people &&
            loadedCollections.tasks
          ),
      services: !(loadedCollections.regularServices && loadedCollections.nodes),
      schedules: !(
        loadedCollections.schedules &&
        loadedCollections.nodes &&
        loadedCollections.people &&
        loadedCollections.regularServices &&
        loadedCollections.events &&
        loadedCollections.overrides &&
        loadedCollections.assignments
      ),
      people: !(loadedCollections.nodes && loadedCollections.people),
      tasks: !(
        loadedCollections.tasks &&
        loadedCollections.taskCategories &&
        loadedCollections.regularServices &&
        loadedCollections.overrides &&
        loadedCollections.events &&
        loadedCollections.people
      ),
      notes: !loadedCollections.notes,
      templates: !(
        loadedCollections.messageTemplates &&
        loadedCollections.regularServices &&
        loadedCollections.nodes
      ),
      visitors: !(
        loadedCollections.visitors &&
        loadedCollections.visitorSettings &&
        loadedCollections.people &&
        loadedCollections.regularServices
      ),
      forerunner: !(
        loadedCollections.forerunnerLessons &&
        loadedCollections.forerunnerSettings &&
        loadedCollections.forerunnerBulletins &&
        loadedCollections.forerunnerAsset
      ),
      viewerNotes: !loadedCollections.viewerNotes,
    },
    pendingLoadingParts,
    collectionErrors,
    retryDataLoad,

    assignableRoles,
  };


  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
};
