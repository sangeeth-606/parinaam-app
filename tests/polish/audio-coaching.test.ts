/**
 * Phase 6 — Multi-Lingual Offline Audio Coaching Tests
 * Covers Task 6.2 & Milestone M6.3.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioCoachingService,
  AUDIO_PROMPTS,
  type SupportedLanguage,
  type PromptKey,
} from '../../src/audio/audio-coaching.ts';

describe('Phase 6: Offline Multi-Lingual Voice Coaching (Milestone M6.3)', () => {
  const service = new AudioCoachingService('en', 100);

  it('Milestone M6.3: Verifies 10 pre-recorded offline prompts exist for English, Hindi, and Punjabi', () => {
    const languages: SupportedLanguage[] = ['en', 'hi', 'pa'];
    const requiredKeys: PromptKey[] = [
      'HOLD_STEADY',
      'MORE_LIGHT',
      'TILT_CARD',
      'HOLD_FLATTER',
      'CARD_DETECTED',
      'MOVE_CLOSER',
      'MOVE_AWAY',
      'CENTER_CARD',
      'QUALITY_PASSED',
      'CALIBRATION_COMPLETE',
    ];

    for (const lang of languages) {
      const langPrompts = AUDIO_PROMPTS[lang];
      assert.ok(langPrompts, `Prompts dictionary must exist for language: ${lang}`);

      for (const key of requiredKeys) {
        const prompt = langPrompts[key];
        assert.ok(prompt, `Missing prompt ${key} for language ${lang}`);
        assert.ok(prompt.text.length > 0, `Prompt text must be non-empty for ${key} in ${lang}`);
        assert.ok(
          prompt.assetPath.endsWith('.m4a') || prompt.assetPath.endsWith('.mp3'),
          `Prompt must map to offline audio asset file: ${prompt.assetPath}`
        );
        assert.ok(prompt.durationMs > 500, `Duration must be positive for ${key}`);
      }
    }
  });

  it('Milestone M6.3: Switches language dynamically to Punjabi and Hindi and triggers prompts', () => {
    // Switch to Punjabi
    service.setLanguage('pa');
    assert.equal(service.getLanguage(), 'pa');

    const paResult = service.triggerPrompt('HOLD_STEADY');
    assert.equal(paResult.played, true);
    assert.equal(paResult.prompt.text, 'ਫੋਨ ਨੂੰ ਸਥਿਰ ਰੱਖੋ');
    assert.equal(paResult.prompt.assetPath, 'assets/audio/pa/hold_steady.m4a');

    // Switch to Hindi
    service.setLanguage('hi');
    assert.equal(service.getLanguage(), 'hi');

    // Small delay to clear cooldown
    const hiResult = service.triggerPrompt('MORE_LIGHT');
    assert.equal(hiResult.prompt.text, 'टेस्ट कार्ड पर अधिक रोशनी की आवश्यकता है');
    assert.equal(hiResult.prompt.assetPath, 'assets/audio/hi/more_light.m4a');
  });

  it('throttles rapid prompts via cooldown to avoid audio overlap', () => {
    const throttledService = new AudioCoachingService('en', 5000); // 5s cooldown
    const first = throttledService.triggerPrompt('HOLD_STEADY');
    assert.equal(first.played, true);

    // Immediate second trigger within cooldown
    const second = throttledService.triggerPrompt('MORE_LIGHT');
    assert.equal(second.played, false);
  });
});
