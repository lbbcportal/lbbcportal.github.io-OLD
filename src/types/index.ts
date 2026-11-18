export type ColorScheme = 'light' | 'dark';
export type ThemeBase = 'classic' | 'option-1' | 'option-2' | 'option-3';
export type AccentColor = 'red' | 'orange' | 'gold' | 'sage-green' | 'glacier-blue' | 'purple';
export type WeekStartDay = 'sunday' | 'monday';
export type TimeFormat = '12h' | '24h';

export type ClockStyle = 'digital' | 'analog';
export type ClockColor = 'white' | 'black';

export interface AppSettings {
  churchName: string;
  churchLogo: string;
  secretaryName?: string;
  bannerImage?: string;
  facebookLink?: string;
  messengerChatLink?: string;
  clockStyle?: ClockStyle;
  clockColor?: ClockColor;
  showDailyVerse?: boolean;
  theme: ThemeBase;
  colorScheme?: ColorScheme;
  accentColor: AccentColor;
  weekStartDay: WeekStartDay;
  timeFormat: TimeFormat;
  initialAccountCreated: boolean;
  updatedAt?: string;
}

export type UserRole = 'secretary' | 'viewer' | null;
export type ViewerAccessMode = 'open' | 'passcode';
export type IdleTimeoutMinutes = 0 | 15 | 30 | 60 | 120;

export interface ViewerSettings {
  mode: ViewerAccessMode;
  passcode: string;
  passcodeVersion: number;
  secretaryIdleMinutes?: IdleTimeoutMinutes;
  viewerIdleMinutes?: IdleTimeoutMinutes;
  updatedAt?: string;
}

export interface PublicBranding {
  churchName: string;
  churchLogo: string;
  facebookLink?: string;
  theme?: ThemeBase;
  colorScheme?: ColorScheme;
  accentColor: AccentColor;
  clockStyle?: ClockStyle;
  clockColor?: ClockColor;
  weekStartDay?: WeekStartDay;
  timeFormat?: TimeFormat;
  showDailyVerse?: boolean;
  initialAccountCreated?: boolean;
  viewerMode: ViewerAccessMode;
  viewerPasscodeConfigured: boolean;
  viewerPasscodeVersion: number;
  viewerIdleMinutes?: IdleTimeoutMinutes;
  updatedAt?: string;
}

export interface LoginBackgroundConfig {
  imageData: string;
  width: number;
  height: number;
  dimming: number; // 0 to 60 percent, default 20
  updatedAt?: string;
}

export type ViewerNoteStatus = 'new' | 'done';

export interface ViewerNote {
  id: string;
  message: string;
  name?: string;
  createdAt: string;
  status: ViewerNoteStatus;
}

export interface PersonPublic {
  id: string;
  name: string;
  department?: string;
  birthdayMonth?: number;
  birthdayDay?: number;
}

export type RoleLineSource = 'linked_role' | 'type_each_time';

export interface TemplateRoleLine {
  id: string;
  label: string;
  source: RoleLineSource;
  roleId?: string; // OutlineNode ID when source === 'linked_role'
}

export interface ReminderSettings {
  enabled: boolean;
  daysBefore: number; // 0 = day of, 1 = 1 day before, 2, 3
  timeOfDay: string;  // HH:mm (e.g. "09:00")
}

export interface MessageTemplate {
  id: string;
  name: string;
  linkedServiceId?: string;
  headerText: string;
  roleLines: TemplateRoleLine[];
  closingText?: string;
  reminder?: ReminderSettings;
  createdAt: string;
  updatedAt: string;
}

export interface SentReminder {
  id: string;
  templateId: string;
  occurrenceDate: string; // YYYY-MM-DD
  targetId: string;
  sentAt: string;
}

export const DEPARTMENTS = [
  'Adult men',
  'Adult ladies',
  'SP men',
  'SP ladies',
  'YP men',
  'YP ladies',
  'Junior',
] as const;

export type DepartmentOption = typeof DEPARTMENTS[number];

export type RoleIconKey = 'none' | 'song-leader' | 'pianist' | 'preacher' | 'computer' | 'singer' | 'emcee';

export interface OutlineNode {
  id: string;
  title: string;
  parentId: string; // "" for root nodes
  order: number;
  isRole: boolean;
  assignedPeopleIds: string[];
  isImportant?: boolean;
  icon?: RoleIconKey;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  phone?: string;
  contactNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
  title?: 'Bro.' | 'Sis.' | 'none';
  department?: string;
  birthdayMonth?: number; // 1-12
  birthdayDay?: number;   // 1-31
  facebookLink?: string;
  barangay?: string;
  roles: string[]; // array of OutlineNode IDs
  createdAt: string;
  updatedAt: string;
}

export interface RequiredRoleSpec {
  roleId: string;
  roleName: string;
  count: number;
}

export interface RegularService {
  id: string;
  name: string;
  daysOfWeek: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  startTime: string; // HH:mm
  endTime?: string;
  location?: string;
  notes?: string;
  color: string;
  requiredRoles: RequiredRoleSpec[];
  kind?: 'service' | 'activity';
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOverride {
  id: string; // serviceId_YYYY-MM-DD
  serviceId: string;
  date: string; // YYYY-MM-DD
  isCancelled: boolean;
  name?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  notes?: string;
  updatedAt: string;
}

export interface ChurchEvent {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime?: string;
  location?: string;
  notes?: string;
  category?: string;
  color: string;
  requiredRoles: RequiredRoleSpec[];
  isTemplate?: boolean;
  templateName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoleAssignment {
  id: string; // targetId_date_roleId_slotIndex
  targetType: 'regular_service' | 'event';
  targetId: string;
  date: string; // YYYY-MM-DD
  roleId: string;
  roleName: string;
  slotIndex: number;
  personId: string; // empty string if manual/unlinked name
  personName: string;
  startTime: string;
  endTime?: string;
  updatedAt: string;
}

export interface EventCategory {
  id: string;
  name: string;
  color: string;
}

export interface Schedule {
  id: string;
  roleId: string;
  roleName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  serviceIds: string[]; // which regular services are included
  includeEvents?: boolean; // whether one-time events requiring this role are included
  months?: string[]; // array of "YYYY-MM" strings, e.g. ["2026-11", "2026-12", "2027-01"]
  createdAt: string;
  updatedAt: string;
}

export interface CalendarOccurrence {
  type: 'regular_service' | 'event';
  sourceId: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  notes?: string;
  color: string;
  category?: string;
  requiredRoles: RequiredRoleSpec[];
  isCancelled?: boolean;
  isOverridden?: boolean;
  overrideId?: string;
  serviceKind?: 'service' | 'activity';
}

export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface TaskLink {
  targetType: 'event' | 'regular_service';
  targetId: string;
  daysBefore: number; // 0 = same day
  targetOccurrenceDate?: string;
}

export type TaskRepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'service_occurrence';

export interface TaskRepeatConfig {
  type: TaskRepeatType;
  weekdays?: number[]; // 0=Sun to 6=Sat
  monthDays?: (number | 'last')[]; // e.g. [15, 'last']
  serviceId?: string;
  daysBefore?: number;
}

export interface Task {
  id: string;
  title: string;
  details?: string;
  categoryId?: string;
  priority: TaskPriority;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  status: TaskStatus;
  assignedTo?: string;
  assignedPersonId?: string;
  link?: TaskLink;
  repeat?: TaskRepeatConfig;
  completedDates?: string[]; // for repeating tasks: list of occurrence dates marked done
  snoozedUntil?: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskOccurrenceItem {
  task: Task;
  occurrenceDate: string; // YYYY-MM-DD
  isDone: boolean;
  isOverdue: boolean;
  isToday: boolean;
  isSnoozed: boolean;
  effectiveDueDate: string;
}

export interface QuickNote {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ForerunnerLessonStatus = 'draft' | 'done';

export interface ForerunnerLesson {
  id: string;
  seriesTitle: string;
  passage: string;
  lessonDate: string; // Sunday YYYY-MM-DD
  status: ForerunnerLessonStatus;
  contentHtml: string;
  page1BreakIndex?: number;
  fontSize?: number;
  blankLineSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ForerunnerFormatSettings {
  id?: string;
  fontName: string; // default 'Abadi'
  startingFontSize: number; // default 13
  minFontSize: number; // default 12
  maxFontSize: number; // default 16
  autoFitFontSize?: boolean; // default true
  page1Width: number; // inches, default 8.23
  page1Height: number; // inches, default 12.73
  page2Width: number; // inches, default 6.19
  page2Height: number; // inches, default 8.14
  margins: number; // inches, default 0.12
  border: boolean; // default true
  blankLineSize: number; // pt, default 10
  minBlankLineSize: number; // pt, default 4
  defaultAlignment: 'justified' | 'left' | 'center' | 'right'; // default 'justified'
  lastUsedSeriesTitle?: string;
  bulletinPositions?: BulletinPositions;
  pastorClosingLine?: string; // default empty
  pastorName?: string; // default empty
  pastorTitle?: string; // default empty
  pastorStyleSamples?: string; // --- separated sample messages, default empty
  pastorTargetWords?: number; // default 117
  updatedAt?: string;
}

export type ForerunnerBulletinStatus = 'draft' | 'done';

export interface BulletinEventSubLine {
  dateStr: string;
  weekdayStr: string;
  location?: string;
}

export interface BulletinEventEntry {
  id: string;
  title: string;
  isGrouped?: boolean;
  dateStr?: string; // e.g. "November 30, 2026"
  weekdayStr?: string; // e.g. "Monday"
  location?: string;
  subLines?: BulletinEventSubLine[];
  hidden?: boolean;
}

export interface BirthdayCelebratorEntry {
  id: string;
  personId?: string;
  day: number; // 1-31
  name: string; // e.g. "Sis. Jocelyn Laruan"
  titleGuessed?: boolean;
}

export interface ForerunnerBulletin {
  id: string; // Sunday date YYYY-MM-DD
  bulletinDate: string; // YYYY-MM-DD
  status: ForerunnerBulletinStatus;
  customDateText?: string; // e.g. "November 08, 2026"
  verseReference: string;
  verseText: string;
  pastorHeartText: string;
  upcomingEvents: BulletinEventEntry[];
  birthdayCelebrators: BirthdayCelebratorEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ForerunnerAsset {
  id: string;
  type: string;
  imageData: string; // base64 data url
  width: number;
  height: number;
  updatedAt: string;
}

export interface BulletinBoxCoords {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BulletinPositions {
  date: BulletinBoxCoords;
  verse: BulletinBoxCoords;
  events: BulletinBoxCoords;
  birthdays: BulletinBoxCoords;
  pastor: BulletinBoxCoords;
}

export const DEFAULT_BULLETIN_POSITIONS: BulletinPositions = {
  date: { x: 6.59, y: 1.08, w: 2.12, h: 0.35 },
  verse: { x: 8.81, y: 1.38, w: 4.00, h: 0.94 },
  events: { x: 8.85, y: 2.49, w: 4.01, h: 1.69 },
  birthdays: { x: 8.83, y: 4.60, w: 4.01, h: 1.73 },
  pastor: { x: 6.59, y: 3.29, w: 2.25, h: 4.38 }
};

export const FIXED_BULLETIN_BOXES = {
  welcome: { x: 6.59, y: 2.93, w: 2.25, h: 0.47 },
  closing: { x: 6.58, y: 7.63, w: 2.25, h: 0.70 }
};

export type VisitorCivilStatus = 'Single' | 'Married' | 'Widowed' | 'Separated' | 'Other';

export type VisitorFollowUpStatus = 'To follow up' | 'Followed up' | 'Not needed';

export interface Visitor {
  id: string;
  name: string;
  age?: number;
  civilStatus?: VisitorCivilStatus;
  address?: string;
  barangay?: string;
  contact?: string;
  invitedBy?: string;
  serviceName?: string;
  visits: string[]; // Array of YYYY-MM-DD dates (visits[0] is first visit date)
  followUpStatus: VisitorFollowUpStatus;
  followUpNote?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorAgeGroupRule {
  id: string;
  label: string;
  minAge: number;
  maxAge?: number; // Undefined means open-ended upper bound (e.g. 60+)
}

export interface VisitorSettings {
  ageGroups: VisitorAgeGroupRule[];
  updatedAt?: string;
}

export const DEFAULT_VISITOR_AGE_GROUPS: VisitorAgeGroupRule[] = [
  { id: 'children', label: 'Children', minAge: 0, maxAge: 12 },
  { id: 'youth', label: 'Youth', minAge: 13, maxAge: 24 },
  { id: 'adults', label: 'Adults', minAge: 25, maxAge: 59 },
  { id: 'seniors', label: 'Seniors', minAge: 60 }
];




