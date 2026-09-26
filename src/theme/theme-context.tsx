import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  darkTheme,
  lightTheme,
  type Theme,
  type ThemeMode,
  type ThemePreference,
} from './theme';
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  loadThemePreference,
  resolveThemeMode,
  saveThemePreference,
  THEME_STORAGE_KEY,
  type PreferenceStore,
} from './theme-preference';

export { THEME_STORAGE_KEY };

interface ThemeContextValue {
  preference: ThemePreference;
  mode: ThemeMode;
  theme: Theme;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * expo-secure-store is imported lazily so the web/Metro-only paths and the
 * unit tests never need the native module.
 */
async function openPreferenceStore(): Promise<PreferenceStore> {
  const SecureStore = await import('expo-secure-store');
  return SecureStore as unknown as PreferenceStore;
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await loadThemePreference(await openPreferenceStore());
        if (active && isThemePreference(stored)) setPreferenceState(stored);
      } catch {
        // A locked/unavailable secure store must not block the app; the default
        // remains the existing light theme and the preference is retried later.
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const mode = resolveThemeMode(preference);
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void (async () => {
      try {
        await saveThemePreference(await openPreferenceStore(), next);
      } catch {
        // Theme selection still works in memory when secure storage is absent.
      }
    })();
  }, []);

  const toggle = useCallback(() => {
    setPreference(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, mode, theme, hydrated, setPreference, toggle }),
    [preference, mode, theme, hydrated, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}

/**
 * Memoizes a StyleSheet factory against the resolved theme. Style factories
 * remain colocated with their components while every color comes from tokens.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const { theme } = useAppTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
