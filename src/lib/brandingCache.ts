import { AccentColor, ColorScheme, LoginBackgroundConfig, PublicBranding, ThemeBase } from '../types';
import { normalizeAppearance } from './themes';

const BRANDING_CACHE_KEY = 'lbbc_cached_public_branding_v1';
const LOGIN_BG_CACHE_KEY = 'lbbc_cached_login_background_v1';
const VALID_ACCENTS: readonly AccentColor[] = ['red', 'orange', 'gold', 'sage-green', 'glacier-blue', 'purple'];
const MAX_CHURCH_NAME_LENGTH = 200;
const MAX_LOGO_LENGTH = 600_000;
const MAX_LOGIN_BG_LENGTH = 1_150_000; // up to ~840KB binary base64 in Firestore
const MAX_LOGIN_BG_DEVICE_CACHE_CHARS = 850_000; // cache on device if small enough (~620KB binary)

export const DEFAULT_LOGIN_BACKGROUND: LoginBackgroundConfig = {
  imageData: '',
  width: 0,
  height: 0,
  dimming: 20,
  updatedAt: '',
};

export interface CachedBrandingValues {
  churchName?: string;
  churchLogo?: string;
  accentColor?: AccentColor;
  theme?: ThemeBase;
  colorScheme?: ColorScheme;
}

export function isValidAccentColor(val: unknown): val is AccentColor {
  return typeof val === 'string' && (VALID_ACCENTS as readonly string[]).includes(val);
}

export function normalizeAccentColor(val: unknown, fallback: AccentColor = 'red'): AccentColor {
  if (val === 'maroon') return 'red';
  return isValidAccentColor(val) ? val : fallback;
}

export function isValidChurchName(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= MAX_CHURCH_NAME_LENGTH;
}

export function isValidChurchLogo(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  if (val === '') return true;
  if (val.length > MAX_LOGO_LENGTH) return false;
  return val.startsWith('data:image/') || val.startsWith('https://');
}

export function clampLoginDimming(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 20;
  return Math.max(0, Math.min(60, Math.round(val)));
}

export function isValidLoginBackgroundImage(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  if (val === '') return true;
  if (val.length > MAX_LOGIN_BG_LENGTH) return false;
  return val.startsWith('data:image/') || val.startsWith('https://');
}

export function normalizeLoginBackground(raw?: Partial<LoginBackgroundConfig> | null): LoginBackgroundConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_LOGIN_BACKGROUND;
  const imageData = isValidLoginBackgroundImage(raw.imageData) ? raw.imageData : '';
  const width = typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0 ? Math.round(raw.width) : 0;
  const height = typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 0 ? Math.round(raw.height) : 0;
  const dimming = clampLoginDimming(raw.dimming);
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
  return { imageData, width, height, dimming, updatedAt };
}

export function readCachedBranding(): CachedBrandingValues {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: CachedBrandingValues = {};
    if (isValidChurchName(parsed.churchName)) {
      result.churchName = parsed.churchName.trim();
    }
    if (isValidChurchLogo(parsed.churchLogo)) {
      result.churchLogo = parsed.churchLogo;
    }
    if (parsed.accentColor === 'maroon' || isValidAccentColor(parsed.accentColor)) {
      result.accentColor = normalizeAccentColor(parsed.accentColor);
    }
    if (parsed.theme !== undefined || parsed.colorScheme !== undefined) {
      const normalized = normalizeAppearance(parsed.theme, parsed.colorScheme);
      result.theme = normalized.theme;
      result.colorScheme = normalized.colorScheme;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveCachedBranding(
  branding: Pick<PublicBranding, 'churchName' | 'churchLogo' | 'accentColor' | 'theme' | 'colorScheme'>
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedBrandingValues = {};
    if (isValidChurchName(branding.churchName)) {
      payload.churchName = branding.churchName.trim();
    }
    if (isValidChurchLogo(branding.churchLogo)) {
      payload.churchLogo = branding.churchLogo;
    } else {
      payload.churchLogo = '';
    }
    payload.accentColor = normalizeAccentColor(branding.accentColor, 'red');
    const normalized = normalizeAppearance(branding.theme, branding.colorScheme);
    payload.theme = normalized.theme;
    payload.colorScheme = normalized.colorScheme;
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors cleanly
  }
}

export function readCachedLoginBackground(): LoginBackgroundConfig {
  if (typeof window === 'undefined') return DEFAULT_LOGIN_BACKGROUND;
  try {
    const raw = window.localStorage.getItem(LOGIN_BG_CACHE_KEY);
    if (!raw) return DEFAULT_LOGIN_BACKGROUND;
    const parsed = JSON.parse(raw);
    return normalizeLoginBackground(parsed);
  } catch {
    return DEFAULT_LOGIN_BACKGROUND;
  }
}

export function saveCachedLoginBackground(config: LoginBackgroundConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeLoginBackground(config);
    if (!normalized.imageData) {
      window.localStorage.setItem(LOGIN_BG_CACHE_KEY, JSON.stringify(normalized));
      return;
    }
    if (normalized.imageData.length <= MAX_LOGIN_BG_DEVICE_CACHE_CHARS) {
      window.localStorage.setItem(LOGIN_BG_CACHE_KEY, JSON.stringify(normalized));
    } else {
      // If too large for device cache, avoid holding stale old image
      window.localStorage.setItem(
        LOGIN_BG_CACHE_KEY,
        JSON.stringify({ ...normalized, imageData: '', width: 0, height: 0 })
      );
    }
  } catch {
    // Ignore storage quota or private browsing errors cleanly
  }
}

