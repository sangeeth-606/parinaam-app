/**
 * Phase 5 — Statutory Clocks & Procedural Timers Tests
 * Covers Task 5.6 & Milestone M5.8 & spec/legal-constraints.md.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUTORY_DEADLINES,
  calculateRemainingHours,
} from '../../src/components/statutory-timers.ts';

describe('Phase 5: Procedural Clocks with Honest Statutory Labeling (Milestone M5.8)', () => {
  it('Milestone M5.8: Accurately distinguishes statutory mandates from administrative guidance', () => {
    // 1. Check Section 57 48h report
    const s57 = STATUTORY_DEADLINES.find((d) => d.id === 's57_report');
    assert.ok(s57);
    assert.equal(s57.isStatutory, true);
    assert.equal(s57.deadlineHours, 48);

    // 2. Check Sections 42(2) & 50(6) 72h copies to superior
    const s42 = STATUTORY_DEADLINES.find((d) => d.id === 's42_50_copies');
    assert.ok(s42);
    assert.equal(s42.isStatutory, true);
    assert.equal(s42.deadlineHours, 72);

    // 3. Check 72h sample dispatch: MUST BE LABELED ADMINISTRATIVE GUIDANCE ONLY
    const sampleDispatch = STATUTORY_DEADLINES.find((d) => d.id === 'sample_dispatch_guidance');
    assert.ok(sampleDispatch);
    assert.equal(sampleDispatch.isStatutory, false, 'Sample dispatch 72h is not a statutory defense');
    assert.equal(sampleDispatch.isAdministrativeGuidance, true);
    assert.ok(
      sampleDispatch.guidanceNote?.includes('ADMINISTRATIVE GUIDANCE ONLY'),
      'Must contain explicit warning note'
    );
    assert.ok(
      sampleDispatch.guidanceNote?.includes('without any delay'),
      'Must cite Rule 13(1) "without any delay" mandate'
    );

    // 4. Check Rule 14 lab reports (15 days)
    const rule14 = STATUTORY_DEADLINES.find((d) => d.id === 'rule14_lab_reports');
    assert.ok(rule14);
    assert.equal(rule14.isStatutory, true);
    assert.equal(rule14.deadlineHours, 360);
  });

  it('calculates remaining and elapsed hours correctly', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const result = calculateRemainingHours(twoHoursAgo, 48);

    assert.ok(result.elapsedHours >= 1.99 && result.elapsedHours <= 2.01);
    assert.ok(result.remainingHours >= 45.99 && result.remainingHours <= 46.01);
    assert.equal(result.isExpired, false);

    // Test expired deadline
    const fiftyHoursAgo = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
    const expiredResult = calculateRemainingHours(fiftyHoursAgo, 48);

    assert.equal(expiredResult.isExpired, true);
    assert.equal(expiredResult.remainingHours, 0);
  });
});
