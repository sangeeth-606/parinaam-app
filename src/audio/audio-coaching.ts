/**
 * Parinaam — Offline Multi-Lingual Audio Coaching Service
 * Governed by spec/07-phase-6-polish-demo.md (Task 6.2 & Milestone M6.3).
 *
 * Architectural Decision (ADR / Task 6.2):
 * Do NOT rely on Android system Text-To-Speech (TTS) for live field/demo operation.
 * While Hindi TTS is common, Punjabi TTS ('pa-IN') is frequently absent on mid-range Android phones.
 * All voice coaching prompts are bundled as static, pre-recorded offline assets.
 *
 * Supported Languages:
 * - English ('en')
 * - Hindi ('hi')
 * - Punjabi ('pa')
 */

export type SupportedLanguage = 'en' | 'hi' | 'pa';

export type PromptKey =
  | 'HOLD_STEADY'
  | 'MORE_LIGHT'
  | 'TILT_CARD'
  | 'HOLD_FLATTER'
  | 'CARD_DETECTED'
  | 'MOVE_CLOSER'
  | 'MOVE_AWAY'
  | 'CENTER_CARD'
  | 'QUALITY_PASSED'
  | 'CALIBRATION_COMPLETE';

export interface CoachingPrompt {
  key: PromptKey;
  text: string;
  assetPath: string;
  durationMs: number;
}

export const AUDIO_PROMPTS: Record<SupportedLanguage, Record<PromptKey, CoachingPrompt>> = {
  en: {
    HOLD_STEADY: { key: 'HOLD_STEADY', text: 'Hold steady', assetPath: 'assets/audio/en/hold_steady.m4a', durationMs: 1200 },
    MORE_LIGHT: { key: 'MORE_LIGHT', text: 'More light required on test card', assetPath: 'assets/audio/en/more_light.m4a', durationMs: 2100 },
    TILT_CARD: { key: 'TILT_CARD', text: 'Tilt card slightly to reduce glare', assetPath: 'assets/audio/en/tilt_card.m4a', durationMs: 2300 },
    HOLD_FLATTER: { key: 'HOLD_FLATTER', text: 'Hold card flatter', assetPath: 'assets/audio/en/hold_flatter.m4a', durationMs: 1400 },
    CARD_DETECTED: { key: 'CARD_DETECTED', text: 'Card detected, stay still', assetPath: 'assets/audio/en/card_detected.m4a', durationMs: 1800 },
    MOVE_CLOSER: { key: 'MOVE_CLOSER', text: 'Move camera closer', assetPath: 'assets/audio/en/move_closer.m4a', durationMs: 1500 },
    MOVE_AWAY: { key: 'MOVE_AWAY', text: 'Move camera further away', assetPath: 'assets/audio/en/move_away.m4a', durationMs: 1700 },
    CENTER_CARD: { key: 'CENTER_CARD', text: 'Center card in frame', assetPath: 'assets/audio/en/center_card.m4a', durationMs: 1600 },
    QUALITY_PASSED: { key: 'QUALITY_PASSED', text: 'Quality check passed', assetPath: 'assets/audio/en/quality_passed.m4a', durationMs: 1400 },
    CALIBRATION_COMPLETE: { key: 'CALIBRATION_COMPLETE', text: 'Optical calibration complete', assetPath: 'assets/audio/en/calibration_complete.m4a', durationMs: 2000 },
  },
  hi: {
    HOLD_STEADY: { key: 'HOLD_STEADY', text: 'फोन को स्थिर रखें', assetPath: 'assets/audio/hi/hold_steady.m4a', durationMs: 1400 },
    MORE_LIGHT: { key: 'MORE_LIGHT', text: 'टेस्ट कार्ड पर अधिक रोशनी की आवश्यकता है', assetPath: 'assets/audio/hi/more_light.m4a', durationMs: 2400 },
    TILT_CARD: { key: 'TILT_CARD', text: 'चमक कम करने के लिए कार्ड को थोड़ा झुकाएं', assetPath: 'assets/audio/hi/tilt_card.m4a', durationMs: 2600 },
    HOLD_FLATTER: { key: 'HOLD_FLATTER', text: 'कार्ड को सीधा और सपाट रखें', assetPath: 'assets/audio/hi/hold_flatter.m4a', durationMs: 1600 },
    CARD_DETECTED: { key: 'CARD_DETECTED', text: 'कार्ड पहचाना गया, स्थिर रहें', assetPath: 'assets/audio/hi/card_detected.m4a', durationMs: 2000 },
    MOVE_CLOSER: { key: 'MOVE_CLOSER', text: 'कैमरा थोड़ा पास लाएं', assetPath: 'assets/audio/hi/move_closer.m4a', durationMs: 1600 },
    MOVE_AWAY: { key: 'MOVE_AWAY', text: 'कैमरा थोड़ा दूर ले जाएं', assetPath: 'assets/audio/hi/move_away.m4a', durationMs: 1800 },
    CENTER_CARD: { key: 'CENTER_CARD', text: 'कार्ड को स्क्रीन के बीच में रखें', assetPath: 'assets/audio/hi/center_card.m4a', durationMs: 1900 },
    QUALITY_PASSED: { key: 'QUALITY_PASSED', text: 'गुणवत्ता जांच सफल रही', assetPath: 'assets/audio/hi/quality_passed.m4a', durationMs: 1600 },
    CALIBRATION_COMPLETE: { key: 'CALIBRATION_COMPLETE', text: 'ऑप्टिकल अंशांकन पूर्ण', assetPath: 'assets/audio/hi/calibration_complete.m4a', durationMs: 2100 },
  },
  pa: {
    HOLD_STEADY: { key: 'HOLD_STEADY', text: 'ਫੋਨ ਨੂੰ ਸਥਿਰ ਰੱਖੋ', assetPath: 'assets/audio/pa/hold_steady.m4a', durationMs: 1400 },
    MORE_LIGHT: { key: 'MORE_LIGHT', text: "ਟੈਸਟ ਕਾਰਡ 'ਤੇ ਹੋਰ ਰੋਸ਼ਨੀ ਦੀ ਲੋੜ ਹੈ", assetPath: 'assets/audio/pa/more_light.m4a', durationMs: 2300 },
    TILT_CARD: { key: 'TILT_CARD', text: 'ਚਮਕ ਘਟਾਉਣ ਲਈ ਕਾਰਡ ਨੂੰ ਥੋੜ੍ਹਾ ਜਿਹਾ ਝੁਕਾਓ', assetPath: 'assets/audio/pa/tilt_card.m4a', durationMs: 2700 },
    HOLD_FLATTER: { key: 'HOLD_FLATTER', text: 'ਕਾਰਡ ਨੂੰ ਸਿੱਧਾ ਰੱਖੋ', assetPath: 'assets/audio/pa/hold_flatter.m4a', durationMs: 1500 },
    CARD_DETECTED: { key: 'CARD_DETECTED', text: 'ਕਾਰਡ ਦੀ ਪਛਾਣ ਹੋ ਗਈ, ਸਥਿਰ ਰਹੋ', assetPath: 'assets/audio/pa/card_detected.m4a', durationMs: 2000 },
    MOVE_CLOSER: { key: 'MOVE_CLOSER', text: 'ਕੈਮਰਾ ਨੇੜੇ ਲਿਆਓ', assetPath: 'assets/audio/pa/move_closer.m4a', durationMs: 1600 },
    MOVE_AWAY: { key: 'MOVE_AWAY', text: 'ਕੈਮਰਾ ਦੂਰ ਕਰੋ', assetPath: 'assets/audio/pa/move_away.m4a', durationMs: 1600 },
    CENTER_CARD: { key: 'CENTER_CARD', text: 'ਕਾਰਡ ਨੂੰ ਫਰੇਮ ਦੇ ਵਿਚਕਾਰ ਰੱਖੋ', assetPath: 'assets/audio/pa/center_card.m4a', durationMs: 1800 },
    QUALITY_PASSED: { key: 'QUALITY_PASSED', text: 'ਗੁਣਵੱਤਾ ਜਾਂਚ ਪਾਸ ਹੋ ਗਈ', assetPath: 'assets/audio/pa/quality_passed.m4a', durationMs: 1600 },
    CALIBRATION_COMPLETE: { key: 'CALIBRATION_COMPLETE', text: 'ਕੈਲੀਬ੍ਰੇਸ਼ਨ ਪੂਰੀ ਹੋਈ', assetPath: 'assets/audio/pa/calibration_complete.m4a', durationMs: 1900 },
  },
};

export class AudioCoachingService {
  private currentLanguage: SupportedLanguage;
  private lastPlayedTimestamp: number = 0;
  private cooldownMs: number;
  private playbackLog: { key: PromptKey; lang: SupportedLanguage; time: number }[] = [];

  constructor(language: SupportedLanguage = 'en', cooldownMs: number = 2000) {
    this.currentLanguage = language;
    this.cooldownMs = cooldownMs;
  }

  public setLanguage(lang: SupportedLanguage): void {
    this.currentLanguage = lang;
  }

  public getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Triggers playback of a coaching prompt in the selected language.
   * Returns false if throttled by cooldown to prevent audio chatter.
   */
  public triggerPrompt(key: PromptKey): { played: boolean; prompt: CoachingPrompt } {
    const now = Date.now();
    const prompt = AUDIO_PROMPTS[this.currentLanguage][key];

    if (now - this.lastPlayedTimestamp < this.cooldownMs) {
      return { played: false, prompt };
    }

    this.lastPlayedTimestamp = now;
    this.playbackLog.push({ key, lang: this.currentLanguage, time: now });

    // In native runtime, calls expo-audio to play prompt.assetPath
    return { played: true, prompt };
  }

  public getPlaybackHistory(): { key: PromptKey; lang: SupportedLanguage; time: number }[] {
    return [...this.playbackLog];
  }
}
