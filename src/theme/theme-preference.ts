/**
 * Pure theme-preference logic (no React, no native modules).
 *
 * Kept out of theme-context.tsx so the resolution rules and the persistence
 * contract can be unit-tested under `node --test` (which strips types from
 * `.ts` only — no JSX runtime is available for `.tsx`).
 */

import type { ThemeMode, ThemePreference } from './theme.ts';

/** Secure-store key holding the officer's chosen appearance. */
export const THEME_STORAGE_KEY = 'parinaam.theme.preference';

/**
 * Default appearance. Light is the historical Parinaam presentation, so an
 * install that has never chosen an appearance keeps exactly the look it had
 * before the theme system existed.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

/** The appearance choices offered in Settings, in display order. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

/**
 * A stored value that is missing or corrupt falls back to the default. A
 * `system` value written by an earlier build of the appearance control is
 * treated the same way: the choice no longer exists, and light is the
 * historical default.
 */
export function normalizeStoredPreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

/** The stored preference IS the resolved mode — there is no system indirection. */
export function resolveThemeMode(preference: ThemePreference): ThemeMode {
  return preference;
}

/** Minimal slice of expo-secure-store this module needs (injectable for tests). */
export interface PreferenceStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** Reads the stored preference; never throws, never leaves a corrupt value. */
export async function loadThemePreference(store: PreferenceStore): Promise<ThemePreference> {
  try {
    return normalizeStoredPreference(await store.getItemAsync(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Writes the preference; a locked/unavailable store leaves memory authoritative. */
export async function saveThemePreference(
  store: PreferenceStore,
  preference: ThemePreference,
): Promise<void> {
  await store.setItemAsync(THEME_STORAGE_KEY, preference);
}
