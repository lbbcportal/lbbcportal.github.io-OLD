import React from 'react';
import {
  Music2,
  Mic,
  Megaphone,
  BookOpen,
  Monitor,
  Slash
} from 'lucide-react';
import { RoleIconKey } from '../types';

export interface RoleIconDefinition {
  key: RoleIconKey;
  label: string;
  renderIcon: (props?: { className?: string }) => React.ReactNode;
}

// Crisp, recognizable piano keys icon SVG
export const PianoKeysIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    {/* Frame and white keys */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 4C3 2.89543 3.89543 2 5 2H19C20.1046 2 21 2.89543 21 4V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V4ZM5.2 4V13.5H7.3V4H5.2ZM8.8 4V13.5H10.7V4H8.8ZM12.2 4V13.5H14.1V4H12.2ZM15.6 4V13.5H17.7V4H15.6ZM19 4V13.5H18.9V4H19ZM19 15H5V20H19V15Z"
    />
    {/* Black keys */}
    <rect x="7.3" y="3" width="1.5" height="10" rx="0.5" fill="currentColor" />
    <rect x="10.7" y="3" width="1.5" height="10" rx="0.5" fill="currentColor" />
    <rect x="14.1" y="3" width="1.5" height="10" rx="0.5" fill="currentColor" />
    <rect x="17.2" y="3" width="1.5" height="10" rx="0.5" fill="currentColor" />
  </svg>
);

/**
 * Centralized list of all available role icons.
 * Adding more icons in the future is a one-line change here.
 */
export const ROLE_ICON_DEFINITIONS: RoleIconDefinition[] = [
  {
    key: 'song-leader',
    label: 'Song leader',
    renderIcon: ({ className = 'w-4 h-4' } = {}) => <Music2 className={className} />
  },
  {
    key: 'pianist',
    label: 'Pianist',
    renderIcon: ({ className = 'w-4 h-4' } = {}) => <PianoKeysIcon className={className} />
  },
  {
    key: 'preacher',
    label: 'Preacher',
    renderIcon: ({ className = 'w-4 h-4' } = {}) => <BookOpen className={className} />
  },
  {
    key: 'computer',
    label: 'Computer',
    renderIcon: ({ className = 'w-4 h-4' } = {}) => <Monitor className={className} />
  },
  {
    key: 'singer',
    label: 'Singer',
    renderIcon: ({ className = 'w-4 h-4' } = {}) => <Mic className={className} />
  },
  {
    key: 'emcee',
    label: 'Emcee',
    renderIcon: ({ className = 'w-4 h-4' } = {}) => <Megaphone className={className} />
  }
];

export function getRoleIconDefinition(key?: string | null): RoleIconDefinition | undefined {
  if (!key || key === 'none') return undefined;
  return ROLE_ICON_DEFINITIONS.find(def => def.key === key);
}

export function renderRoleIcon(key?: string | null, className?: string): React.ReactNode {
  const def = getRoleIconDefinition(key);
  if (!def) return null;
  return def.renderIcon({ className });
}

export function isImportantRole(
  nodeOrKey?: { isImportant?: boolean; icon?: RoleIconKey } | string | null
): boolean {
  if (!nodeOrKey) return false;
  if (typeof nodeOrKey === 'object') {
    const hasIcon = !!nodeOrKey.icon && nodeOrKey.icon !== 'none';
    if (!hasIcon) return false;
    // If explicitly marked false, it's not important
    if (nodeOrKey.isImportant === false) return false;
    // If explicitly true or legacy node with icon, it is important
    return true;
  }
  return nodeOrKey !== 'none';
}
