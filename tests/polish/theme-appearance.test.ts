/**
 * Appearance (theme) system tests.
 *
 * Covers the three things the officer can observe:
 *   1. light / dark / system resolution (pure logic, no React),
 *   2. secure-store persistence + hydration of the stored preference,
 *   3. the two palettes themselves — same token surface, usable contrast, and
 *      the deliberately fixed surfaces (terminal / colorimeter / statutory /
 *      camera HUD) that must NOT invert with the mode.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  isThemePreference,
  loadThemePreference,
  normalizeStoredPreference,
  resolveThemeMode,
  saveThemePreference,
  type PreferenceStore,
} from '../../src/theme/theme-preference.ts';
import { darkTheme, lightTheme, type ThemeColors } from '../../src/theme/theme.ts';

/** Relative luminance per WCAG 2.1 for #RRGGBB values. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function fakeStore(initial: string | null = null) {
  const map = new Map<string, string>();
  if (initial !== null) map.set(THEME_STORAGE_KEY, initial);
  const store: PreferenceStore & { map: Map<string, string> } = {
    map,
    async getItemAsync(key) {
      return map.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      map.set(key, value);
    },
  };
  return store;
}

describe('Appearance: preference resolution', () => {
  it('exposes exactly the two choices the Settings screen offers', () => {
    assert.deepEqual([...THEME_PREFERENCES], ['light', 'dark']);
  });

  it('resolves each explicit choice to itself', () => {
    assert.equal(resolveThemeMode('dark'), 'dark');
    assert.equal(resolveThemeMode('light'), 'light');
  });

  it('defaults to light so pre-theme installs look unchanged', () => {
    assert.equal(DEFAULT_THEME_PREFERENCE, 'light');
    assert.equal(normalizeStoredPreference(null), 'light');
    assert.equal(normalizeStoredPreference(''), 'light');
  });
});

describe('Appearance: stored preference handling', () => {
  it('recognises only the two valid preference strings', () => {
    assert.ok(isThemePreference('light'));
    assert.ok(isThemePreference('dark'));
    assert.equal(isThemePreference('system'), false);
    assert.equal(isThemePreference('sepia'), false);
    assert.equal(isThemePreference(null), false);
    assert.equal(isThemePreference(2), false);
  });

  it('normalises a corrupt or retired stored value to the default', () => {
    assert.equal(normalizeStoredPreference('DARK'), 'light');
    assert.equal(normalizeStoredPreference({ mode: 'dark' }), 'light');
    // 'system' was offered by an earlier build; it now resolves to the default.
    assert.equal(normalizeStoredPreference('system'), 'light');
    assert.equal(normalizeStoredPreference('dark'), 'dark');
  });

  it('hydrates the stored preference on reload', async () => {
    const store = fakeStore('dark');
    assert.equal(await loadThemePreference(store), 'dark');
    assert.equal(resolveThemeMode(await loadThemePreference(store)), 'dark');
  });

  it('hydrates to the default when nothing is stored', async () => {
    assert.equal(await loadThemePreference(fakeStore(null)), 'light');
  });

  it('hydrates to the default when secure storage is locked/unavailable', async () => {
    const broken: PreferenceStore = {
      async getItemAsync() {
        throw new Error('keychain unavailable');
      },
      async setItemAsync() {
        throw new Error('keychain unavailable');
      },
    };
    assert.equal(await loadThemePreference(broken), 'light');
  });

  it('persists each choice under the documented key', async () => {
    const store = fakeStore();
    for (const preference of THEME_PREFERENCES) {
      await saveThemePreference(store, preference);
      assert.equal(store.map.get(THEME_STORAGE_KEY), preference);
      assert.equal(await loadThemePreference(store), preference);
    }
  });
});

describe('Appearance: palette invariants', () => {
  it('carries an identical token surface in both modes', () => {
    const lightKeys = Object.keys(lightTheme.colors).sort();
    const darkKeys = Object.keys(darkTheme.colors).sort();
    assert.deepEqual(darkKeys, lightKeys);
  });

  it('labels each palette with its own mode', () => {
    assert.equal(lightTheme.mode, 'light');
    assert.equal(darkTheme.mode, 'dark');
  });

  it('keeps the light palette light and the dark palette navy-dark', () => {
    assert.ok(
      lightTheme.colors.canvas.toUpperCase() === '#F8FAFC' ||
      lightTheme.colors.canvas.toUpperCase() === '#F7FAFD'
    );
    assert.equal(darkTheme.colors.canvas.toUpperCase(), '#061B2E');
    assert.ok(luminance(lightTheme.colors.canvas) > 0.8, 'light canvas must be near-white');
    assert.ok(luminance(darkTheme.colors.canvas) < 0.05, 'dark canvas must be near-black navy');
  });

  it('keeps body text readable on the canvas in both modes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const ratio = contrastRatio(theme.colors.textPrimary, theme.colors.canvas);
      assert.ok(ratio >= 7, `body text contrast on canvas was ${ratio.toFixed(2)}:1`);
    }
  });

  it('keeps text readable on cards in both modes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const primary = contrastRatio(theme.colors.textPrimary, theme.colors.card);
      const secondary = contrastRatio(theme.colors.textSecondary, theme.colors.card);
      assert.ok(primary >= 7, `card text contrast was ${primary.toFixed(2)}:1`);
      assert.ok(secondary >= 4.5, `card secondary contrast was ${secondary.toFixed(2)}:1`);
    }
  });

  it('keeps label text legible on solid accent fills in both modes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const ratio = contrastRatio(theme.colors.onAccent, theme.colors.accent);
      assert.ok(ratio >= 4.5, `accent label contrast was ${ratio.toFixed(2)}:1`);
      const brandRatio = contrastRatio(theme.colors.onBrandSolid, theme.colors.brandSolid);
      assert.ok(brandRatio >= 4.5, `brand label contrast was ${brandRatio.toFixed(2)}:1`);
    }
  });

  it('builds badge tones from the active palette', () => {
    assert.equal(lightTheme.badgeTones.ok.fg, lightTheme.colors.ok);
    assert.equal(darkTheme.badgeTones.ok.fg, darkTheme.colors.ok);
    assert.notEqual(lightTheme.badgeTones.ok.bg, darkTheme.badgeTones.ok.bg);
  });

  it('leaves fixed presentation surfaces mode-independent', () => {
    const fixed: Array<keyof ThemeColors> = [
      'colorimeter',
      'colorimeterHairline',
      'statutoryBackground',
      'statutoryAccent',
      'statutoryForeground',
    ];
    for (const key of fixed) {
      assert.equal(darkTheme.colors[key], lightTheme.colors[key], `${key} must not invert`);
    }
    // The terminal is intentionally its own high-contrast panel in both modes.
    assert.equal(contrastRatio(lightTheme.colors.terminalText, lightTheme.colors.terminalPanel) >= 7, true);
    assert.equal(contrastRatio(darkTheme.colors.terminalText, darkTheme.colors.terminalPanel) >= 7, true);
  });
});
