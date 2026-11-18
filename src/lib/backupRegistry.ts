export type BackupGroupCategory =
  | 'people'
  | 'schedule'
  | 'office'
  | 'forerunner'
  | 'settings'
  | 'derived';

export interface AppCollectionSpec {
  id: string;
  label: string;
  category: BackupGroupCategory;
  derivedOrTemporary?: boolean;
}

/**
 * Single source of truth for Firestore collections used by DataContext.tsx.
 * Any collection added here (unless marked derivedOrTemporary: true) is
 * automatically included in full church backups.
 */
export const APP_COLLECTIONS = {
  people: {
    id: 'people',
    label: 'Members',
    category: 'people',
  },
  outline_nodes: {
    id: 'outline_nodes',
    label: 'Ministries & Roles',
    category: 'people',
  },
  regular_services: {
    id: 'regular_services',
    label: 'Services & Activities',
    category: 'schedule',
  },
  service_overrides: {
    id: 'service_overrides',
    label: 'Service Overrides',
    category: 'schedule',
  },
  events: {
    id: 'events',
    label: 'Events & Templates',
    category: 'schedule',
  },
  categories: {
    id: 'categories',
    label: 'Event Categories',
    category: 'schedule',
  },
  schedules: {
    id: 'schedules',
    label: 'Schedules',
    category: 'schedule',
  },
  assignments: {
    id: 'assignments',
    label: 'Roster Assignments',
    category: 'schedule',
  },
  settings: {
    id: 'settings',
    label: 'Church Settings',
    category: 'settings',
  },
  tasks: {
    id: 'tasks',
    label: 'Tasks',
    category: 'office',
  },
  task_categories: {
    id: 'task_categories',
    label: 'Task Categories',
    category: 'office',
  },
  notes: {
    id: 'notes',
    label: 'Quick Notes',
    category: 'office',
  },
  message_templates: {
    id: 'message_templates',
    label: 'Message Templates',
    category: 'office',
  },
  sent_reminders: {
    id: 'sent_reminders',
    label: 'Sent Reminders',
    category: 'office',
  },
  visitors: {
    id: 'visitors',
    label: 'Visitors',
    category: 'people',
  },
  visitor_settings: {
    id: 'visitor_settings',
    label: 'Visitor Settings',
    category: 'settings',
  },
  forerunner_lessons: {
    id: 'forerunner_lessons',
    label: 'Lessons',
    category: 'forerunner',
  },
  forerunner_settings: {
    id: 'forerunner_settings',
    label: 'Forerunner Settings',
    category: 'forerunner',
  },
  forerunner_assets: {
    id: 'forerunner_assets',
    label: 'Bulletin Assets',
    category: 'forerunner',
  },
  forerunner_bulletins: {
    id: 'forerunner_bulletins',
    label: 'Bulletins',
    category: 'forerunner',
  },
  viewer_settings: {
    id: 'viewer_settings',
    label: 'Viewer Access Settings',
    category: 'settings',
  },
  viewer_notes: {
    id: 'viewer_notes',
    label: 'Viewer Notes',
    category: 'office',
  },

  // Derived or temporary collections (intentionally excluded from backups)
  people_public: {
    id: 'people_public',
    label: 'Viewer Safe Member Copy',
    category: 'derived',
    derivedOrTemporary: true,
  },
  public_branding: {
    id: 'public_branding',
    label: 'Public Branding',
    category: 'derived',
    derivedOrTemporary: true,
  },
  viewer_unlocks: {
    id: 'viewer_unlocks',
    label: 'Viewer Unlocks',
    category: 'derived',
    derivedOrTemporary: true,
  },
} as const satisfies Record<string, AppCollectionSpec>;

export function getBackupCollectionSpecs(): AppCollectionSpec[] {
  return (Object.values(APP_COLLECTIONS) as AppCollectionSpec[]).filter(
    (spec) => !spec.derivedOrTemporary
  );
}

export function getExcludedCollectionSpecs(): AppCollectionSpec[] {
  return (Object.values(APP_COLLECTIONS) as AppCollectionSpec[]).filter(
    (spec) => Boolean(spec.derivedOrTemporary)
  );
}
