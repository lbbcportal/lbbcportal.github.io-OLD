import { AccentColor, ColorScheme, ThemeBase } from '../types';

export interface ThemePaletteSpec {
  page: string;
  card: string;
  field: string;
  text: string;
  muted: string;
  border: string;
  /** Optional explicit overrides for derived tokens */
  secondary?: string;
  subtle?: string;
  surfaceHover?: string;
  surfaceActive?: string;
  borderStrong?: string;
  calCellBorder?: string;
  calCellBorderOutside?: string;
  calCellBorderHover?: string;
}

export interface ThemeDefinition {
  id: ThemeBase;
  name: string;
  description: string;
  light: ThemePaletteSpec;
  dark: ThemePaletteSpec;
}

export interface AccentDefinition {
  id: AccentColor;
  label: string;
  description: string;
  /** Representative swatch color for Settings & Viewer picker */
  swatchLight: string;
  swatchDark: string;
  /** Whether checkmark on swatch uses dark ink in light / dark scheme */
  checkLightScheme: string;
  checkDarkScheme: string;
}

export const DEFAULT_THEME_ID: ThemeBase = 'classic';
export const DEFAULT_COLOR_SCHEME: ColorScheme = 'dark';

/**
 * Modular Theme Catalogue — one object per theme with Light & Dark palettes.
 * Rename or add themes by editing or appending objects here.
 */
export const THEME_CATALOGUE: readonly ThemeDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean slate surfaces with crisp borders',
    light: {
      page: '#f8fafc',
      card: '#ffffff',
      field: '#ffffff',
      text: '#0f172a',
      muted: '#475569',
      border: '#e2e8f0',
      secondary: '#334155',
      subtle: '#f8fafc',
      surfaceHover: '#f1f5f9',
      surfaceActive: '#e2e8f0',
      borderStrong: '#cbd5e1',
      calCellBorder: '#cbd5e1',
      calCellBorderOutside: '#e2e8f0',
      calCellBorderHover: '#64748b',
    },
    dark: {
      page: '#1e293b',
      card: '#0f172a',
      field: '#0f172a',
      text: '#f8fafc',
      muted: '#94a3b8',
      border: '#334155',
      secondary: '#cbd5e1',
      subtle: '#1e293b',
      surfaceHover: '#1e293b',
      surfaceActive: '#334155',
      borderStrong: '#475569',
      calCellBorder: '#3e4f68',
      calCellBorderOutside: '#233044',
      calCellBorderHover: '#94a3b8',
    },
  },
  {
    id: 'option-1',
    name: 'Option 1',
    description: 'High-contrast pure neutral tones',
    light: {
      page: '#ffffff',
      card: '#f4f4f4',
      field: '#ececec',
      text: '#090909',
      muted: '#666666', // Darkened slightly from #8a8a8a for >= 4.5:1 AA contrast on #f4f4f4 & #ececec
      border: '#dbdbdb',
    },
    dark: {
      page: '#0b0b0b',
      card: '#151515',
      field: '#1b1b1b',
      text: '#fdfdfd',
      muted: '#8c8c8c', // Lightened slightly from #808080 for >= 4.5:1 AA contrast on #1b1b1b fields & #212121 subtle surfaces
      border: '#2d2d2d',
    },
  },
  {
    id: 'option-2',
    name: 'Option 2',
    description: 'Minimalist balanced studio surfaces',
    light: {
      page: '#ffffff',
      card: '#fafafa',
      field: '#ffffff',
      text: '#161616',
      muted: '#5c5c5c',
      border: '#e1e1e1',
    },
    dark: {
      page: '#161616',
      card: '#242424',
      field: '#1b1b1b',
      text: '#fafafa',
      muted: '#aeaeae',
      border: '#333333',
    },
  },
  {
    id: 'option-3',
    name: 'Option 3',
    description: 'Warm stone light & deep midnight blue dark',
    light: {
      page: '#f1f1f1',
      card: '#e9e9e8',
      field: '#f6f6f6',
      text: '#232234',
      muted: '#515267',
      border: '#dbdbda',
    },
    dark: {
      page: '#04101c',
      card: '#0d1a26',
      field: '#04101c',
      text: '#fbfcfd',
      muted: '#b4bac7',
      border: '#2d3845',
    },
  },
];

export const ACCENT_CATALOGUE: readonly AccentDefinition[] = [
  {
    id: 'red',
    label: 'Red',
    description: 'True, clear red accent',
    swatchLight: '#dc2626',
    swatchDark: '#dc2626',
    checkLightScheme: '#ffffff',
    checkDarkScheme: '#ffffff',
  },
  {
    id: 'orange',
    label: 'Orange',
    description: 'Warm amber fellowship accent',
    swatchLight: '#c2410c',
    swatchDark: '#fb923c',
    checkLightScheme: '#ffffff',
    checkDarkScheme: '#111827',
  },
  {
    id: 'gold',
    label: 'Gold',
    description: 'Warm golden yellow accent',
    swatchLight: '#eab308',
    swatchDark: '#facc15',
    checkLightScheme: '#111827',
    checkDarkScheme: '#111827',
  },
  {
    id: 'sage-green',
    label: 'Sage Green',
    description: 'Quiet evergreen & olive peace',
    swatchLight: '#2d7d4a',
    swatchDark: '#4ade80',
    checkLightScheme: '#ffffff',
    checkDarkScheme: '#052e16',
  },
  {
    id: 'glacier-blue',
    label: 'Glacier Blue',
    description: 'Calm, crisp liturgical sky blue',
    swatchLight: '#0275b1',
    swatchDark: '#38bdf8',
    checkLightScheme: '#ffffff',
    checkDarkScheme: '#082f49',
  },
  {
    id: 'purple',
    label: 'Purple',
    description: 'Regal and calm',
    swatchLight: '#7e3af2',
    swatchDark: '#c084fc',
    checkLightScheme: '#ffffff',
    checkDarkScheme: '#110824',
  },
];

export const VALID_THEME_IDS: readonly ThemeBase[] = THEME_CATALOGUE.map((t) => t.id);

export function isValidColorScheme(val: unknown): val is ColorScheme {
  return val === 'light' || val === 'dark';
}

export function isValidThemeId(val: unknown): val is ThemeBase {
  return typeof val === 'string' && (VALID_THEME_IDS as readonly string[]).includes(val);
}

/**
 * Normalizes legacy & modern theme + colorScheme values safely.
 * - Old 'white' / 'gray' / 'light-gray' / 'Light Gray' / 'glacier-gray' -> Classic + Light
 * - Old 'dark-gray' / 'dark' -> Classic + Dark
 * - Missing or unknown values -> Classic + Dark
 */
export function normalizeAppearance(
  rawTheme: unknown,
  rawColorScheme?: unknown
): { theme: ThemeBase; colorScheme: ColorScheme } {
  if (isValidThemeId(rawTheme)) {
    return {
      theme: rawTheme,
      colorScheme: isValidColorScheme(rawColorScheme) ? rawColorScheme : DEFAULT_COLOR_SCHEME,
    };
  }

  if (typeof rawTheme === 'string') {
    const normalized = rawTheme.trim().toLowerCase();
    if (
      normalized === 'white' ||
      normalized === 'gray' ||
      normalized === 'light-gray' ||
      normalized === 'light gray' ||
      normalized === 'glacier-gray'
    ) {
      return {
        theme: 'classic',
        colorScheme: isValidColorScheme(rawColorScheme) ? rawColorScheme : 'light',
      };
    }
    if (normalized === 'dark-gray' || normalized === 'dark') {
      return {
        theme: 'classic',
        colorScheme: isValidColorScheme(rawColorScheme) ? rawColorScheme : 'dark',
      };
    }
  }

  return {
    theme: DEFAULT_THEME_ID,
    colorScheme: isValidColorScheme(rawColorScheme) ? rawColorScheme : DEFAULT_COLOR_SCHEME,
  };
}

export function getThemeDefinition(themeId: ThemeBase): ThemeDefinition {
  return THEME_CATALOGUE.find((t) => t.id === themeId) || THEME_CATALOGUE[0];
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Mixes `weight` (0..1) of `fgHex` over `bgHex` */
export function mixHex(bgHex: string, fgHex: string, weight: number): string {
  const [br, bg, bb] = parseHex(bgHex);
  const [fr, fg, fb] = parseHex(fgHex);
  return toHex(
    br + (fr - br) * weight,
    bg + (fg - bg) * weight,
    bb + (fb - bb) * weight
  );
}

export interface ResolvedThemeTokens {
  colorScheme: ColorScheme;
  canvas: string;
  surface: string;
  field: string;
  surfaceHover: string;
  surfaceActive: string;
  subtle: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  shadowCard: string;
  shadowDropdown: string;
  calCellBorder: string;
  calCellBorderOutside: string;
  calCellBorderHover: string;
}

/**
 * Derives full UI tokens from a theme's light or dark palette object.
 * Hover, selected-row, and subtle tints are automatically blended from text over surface.
 */
export function resolveThemeTokens(themeId: ThemeBase, colorScheme: ColorScheme): ResolvedThemeTokens {
  const def = getThemeDefinition(themeId);
  const spec = colorScheme === 'dark' ? def.dark : def.light;
  const isDark = colorScheme === 'dark';

  const surfaceHover = spec.surfaceHover ?? mixHex(spec.card, spec.text, isDark ? 0.07 : 0.045);
  const surfaceActive = spec.surfaceActive ?? mixHex(spec.card, spec.text, isDark ? 0.13 : 0.09);
  const subtle = spec.subtle ?? mixHex(spec.card, spec.text, isDark ? 0.05 : 0.03);
  const secondary = spec.secondary ?? mixHex(spec.card, spec.text, isDark ? 0.78 : 0.80);
  const borderStrong = spec.borderStrong ?? mixHex(spec.border, spec.text, isDark ? 0.18 : 0.16);
  const calCellBorder = spec.calCellBorder ?? mixHex(spec.border, spec.text, isDark ? 0.10 : 0.08);
  const calCellBorderOutside = spec.calCellBorderOutside ?? spec.border;
  const calCellBorderHover = spec.calCellBorderHover ?? spec.muted;

  const shadowCard = isDark
    ? '0 1px 3px 0 rgb(0 0 0 / 0.35)'
    : '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)';
  const shadowDropdown = isDark
    ? '0 10px 24px -3px rgb(0 0 0 / 0.55)'
    : '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)';

  return {
    colorScheme,
    canvas: spec.page,
    surface: spec.card,
    field: spec.field,
    surfaceHover,
    surfaceActive,
    subtle,
    borderSubtle: spec.border,
    borderStrong,
    textPrimary: spec.text,
    textSecondary: secondary,
    textMuted: spec.muted,
    shadowCard,
    shadowDropdown,
    calCellBorder,
    calCellBorderOutside,
    calCellBorderHover,
  };
}

export function applyThemeToDocument(
  themeId: ThemeBase,
  colorScheme: ColorScheme,
  accentColor: AccentColor
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const tokens = resolveThemeTokens(themeId, colorScheme);

  root.setAttribute('data-theme', themeId);
  root.setAttribute('data-color-scheme', colorScheme);
  root.setAttribute('data-accent', accentColor);

  if (colorScheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.style.colorScheme = colorScheme;
  root.style.setProperty('--bg-canvas', tokens.canvas);
  root.style.setProperty('--bg-surface', tokens.surface);
  root.style.setProperty('--bg-field', tokens.field);
  root.style.setProperty('--bg-surface-hover', tokens.surfaceHover);
  root.style.setProperty('--bg-surface-active', tokens.surfaceActive);
  root.style.setProperty('--bg-subtle', tokens.subtle);
  root.style.setProperty('--border-subtle', tokens.borderSubtle);
  root.style.setProperty('--border-strong', tokens.borderStrong);
  root.style.setProperty('--text-primary', tokens.textPrimary);
  root.style.setProperty('--text-secondary', tokens.textSecondary);
  root.style.setProperty('--text-muted', tokens.textMuted);
  root.style.setProperty('--shadow-card', tokens.shadowCard);
  root.style.setProperty('--shadow-dropdown', tokens.shadowDropdown);
  root.style.setProperty('--cal-cell-border', tokens.calCellBorder);
  root.style.setProperty('--cal-cell-border-outside', tokens.calCellBorderOutside);
  root.style.setProperty('--cal-cell-border-hover', tokens.calCellBorderHover);
}
