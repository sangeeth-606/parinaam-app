/**
 * App Store — UI preferences (zustand, per AGENTS §5). Officer identity moved to
 * src/state/auth-store.ts in v2 phase B; onboarding state is gone (login gate owns launch).
 * Persistence stays best-effort: in-memory per boot unless hydrated by prefs storage.
 */

import { create } from 'zustand';

export type CoachingLanguage = 'en' | 'hi' | 'pa';

export const LANGUAGE_LABELS: Record<CoachingLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  pa: 'ਪੰਜਾਬੀ (Punjabi)',
};

interface AppState {
  language: CoachingLanguage;
  audioCoaching: boolean;
  setLanguage: (l: CoachingLanguage) => void;
  setAudioCoaching: (on: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  language: 'en',
  audioCoaching: true,
  setLanguage: (language) => set({ language }),
  setAudioCoaching: (audioCoaching) => set({ audioCoaching }),
}));
