/**
 * Theme adoption guard.
 *
 * The appearance system is only as good as its coverage: a screen that still
 * builds `StyleSheet.create` at module scope, or that still imports the retired
 * `theme/evidence` palette, silently renders the light-only design in dark mode.
 * These checks are static on purpose — they run in `node --test` with no native
 * module, and they fail loudly the moment someone adds a screen that bypasses
 * `useAppTheme` / `useThemedStyles`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = 'src';
const THEME = join(SRC, 'theme');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = walk(SRC);
const screenFiles = sourceFiles.filter((f) => f.includes(join('screens', '')) && f.endsWith('.tsx'));

/** Screens the navigator can actually mount. */
const ROUTED_SCREENS = [
  'LoginScreen.tsx',
  'PostLoginBriefScreen.tsx',
  'HomeScreen.tsx',
  'NewTestSetupScreen.tsx',
  'CaptureScreen.tsx',
  'AnalyzeScreen.tsx',
  'ResultsScreen.tsx',
  'CaseLogScreen.tsx',
  'RecordDetailScreen.tsx',
  'BunchingScreen.tsx',
  'IntegrityScreen.tsx',
  'SettingsScreen.tsx',
  'TamperDemoScreen.tsx',
];

/**
 * Surfaces whose colors are deliberately fixed (camera HUD, print/export output, evidentiary reference UI).
 * They must not be forced through the palette.
 */
const FIXED_COLOR_ALLOWLIST = [
  join('capture', 'CoachingOverlay.tsx'),
  join('export', 'pdf-bundle.ts'),
  join('export', 'map-snapshot.ts'),
  join('screens', 'HomeScreen.tsx'),
  join('screens', 'NewTestSetupScreen.tsx'),
  join('screens', 'ResultsScreen.tsx'),
  join('screens', 'CaseLogScreen.tsx'),
  join('screens', 'RecordDetailScreen.tsx'),
  join('screens', 'CaptureScreen.tsx'),
  join('screens', 'LoginScreen.tsx'),
  join('screens', 'PostLoginBriefScreen.tsx'),
  join('components', 'ui', 'evidentiary', 'LightTabBar.tsx'),
  join('components', 'ui', 'Icon.tsx'),
  join('components', 'ui', 'ParinaamLogo.tsx'),
];

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;

function isAllowedRawColor(file: string): boolean {
  return FIXED_COLOR_ALLOWLIST.some((suffix) => file.endsWith(suffix));
}

describe('Theme adoption: routed screens', () => {
  it('has a screen file for every routed screen', () => {
    for (const name of ROUTED_SCREENS) {
      assert.ok(screenFiles.some((f) => f.endsWith(name)), `missing ${name}`);
    }
  });

  for (const name of ROUTED_SCREENS) {
    it(`${name} resolves its styles from the active theme`, () => {
      const src = readFileSync(join(SRC, 'screens', name), 'utf8');
      assert.ok(
        src.includes('useThemedStyles') || src.includes('useAppTheme'),
        `${name} must build styles from useAppTheme/useThemedStyles`,
      );
      assert.ok(
        !/^const \w+ = StyleSheet\.create\(/m.test(src),
        `${name} must not create styles at module scope (it cannot see the mode)`,
      );
      assert.ok(
        !src.includes("theme/evidence"),
        `${name} must not import the retired theme/evidence palette`,
      );
    });
  }
});

describe('Theme adoption: shared UI', () => {
  it('keeps every shared component theme-driven', () => {
    const components = sourceFiles.filter((f) => f.includes(join('components', '')) && f.endsWith('.tsx'));
    assert.ok(components.length > 10, 'expected the shared component library to be present');
    for (const file of components) {
      const src = readFileSync(file, 'utf8');
      assert.ok(
        !src.includes("theme/evidence"),
        `${relative('.', file)} must not import the retired theme/evidence palette`,
      );
      if (!/StyleSheet\.create\(/.test(src)) continue;
      assert.ok(
        !/^const \w+ = StyleSheet\.create\(/m.test(src),
        `${relative('.', file)} must not create styles at module scope`,
      );
    }
  });
});

describe('Theme adoption: no scattered hardcoded light colors', () => {
  it('has no raw hex/rgba colors outside the theme source and fixed surfaces', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (file.startsWith(THEME) || file === 'App.tsx') continue;
      if (isAllowedRawColor(file)) continue;
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, index) => {
        if (RAW_COLOR.test(line) && !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//')) {
          offenders.push(`${relative('.', file)}:${index + 1} ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(offenders, [], 'use theme tokens instead of raw colors');
  });
});

describe('Appearance: app shell wiring', () => {
  it('mounts the navigator inside the theme provider', () => {
    const app = readFileSync('App.tsx', 'utf8');
    assert.ok(app.includes('ThemeProvider'));
    assert.ok(app.includes('AppNavigator'));
    const providerOpen = app.indexOf('<ThemeProvider>');
    const providerClose = app.indexOf('</ThemeProvider>');
    const appContent = app.indexOf('<AppContent />');
    const statusBar = app.indexOf('ThemedStatusBar');
    assert.ok(
      providerOpen !== -1 && appContent > providerOpen && providerClose > appContent,
      'the app content (navigator + status bar) must render inside ThemeProvider',
    );
    assert.ok(statusBar > -1, 'the status bar must follow the resolved mode');
  });

  it('lets the platform follow the app appearance instead of forcing dark', () => {
    const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
    assert.equal(appJson.expo.userInterfaceStyle, 'automatic');
    const plistPath = join('ios', 'Parinaam', 'Info.plist');
    if (existsSync(plistPath)) {
      const plist = readFileSync(plistPath, 'utf8');
      assert.ok(
        /<key>UIUserInterfaceStyle<\/key>\s*<string>Automatic<\/string>/.test(plist),
        'iOS must not force Dark at the Info.plist level',
      );
    }
  });

  it('derives navigation chrome from the resolved mode', () => {
    const nav = readFileSync(join(SRC, 'navigation', 'AppNavigator.tsx'), 'utf8');
    assert.ok(nav.includes('useAppTheme'));
    assert.ok(nav.includes("dark: mode === 'dark'"));
    assert.ok(nav.includes('theme.colors.canvas'));
  });
});

describe('Appearance: settings control', () => {
  const settings = readFileSync(join(SRC, 'screens', 'SettingsScreen.tsx'), 'utf8');

  it('offers the two appearance choices with radio semantics', () => {
    assert.ok(settings.includes("value: 'light'"), 'Settings must offer light');
    assert.ok(settings.includes("value: 'dark'"), 'Settings must offer dark');
    assert.equal(
      settings.includes("value: 'system'"),
      false,
      'the system option was removed — the officer picks light or dark',
    );
    assert.ok(settings.includes('accessibilityRole="radiogroup"'));
    assert.ok(settings.includes('accessibilityRole="radio"'));
    assert.ok(settings.includes('accessibilityState={{ selected }}'));
  });

  it('persists through the theme provider, not local state', () => {
    assert.ok(settings.includes('useAppTheme'));
    assert.ok(settings.includes('setPreference'));
    assert.ok(settings.includes('onPress={() => setPreference(option.value)}'));
  });

  it('uses the sun/moon icons rather than colour alone', () => {
    for (const icon of ['sun', 'moon']) {
      assert.ok(settings.includes(`icon: '${icon}'`), `appearance control must use the ${icon} icon`);
    }
  });
});
