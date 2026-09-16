/**
 * Parinaam — Procedural Clocks with Honest Statutory Labeling
 * Governed by spec/06-phase-5-case-log-sync.md (Task 5.6 & Milestone M5.8) & spec/legal-constraints.md.
 *
 * Implements:
 * 1. 48-Hour Malkhana / s. 57 Report Timer (Statutory / Administrative)
 * 2. 72-Hour ss. 42(2) & 50(6) Copy to Superior Timer (STATUTORY)
 * 3. 72-Hour Sample Dispatch Guidance:
 *    Clearly labeled as: "⚠ ADMINISTRATIVE GUIDANCE ONLY" (NCB Handbook item 29;
 *    Rule 13(1) of NDPS Rules 2022 mandates dispatch "without any delay").
 * 4. 15 + 15 Days Rule 14 Lab Report Timer (STATUTORY).
 */

export interface DeadlineItem {
  id: string;
  title: string;
  sectionCite: string;
  deadlineHours: number;
  isStatutory: boolean;
  isAdministrativeGuidance: boolean;
  guidanceNote?: string;
}

export const STATUTORY_DEADLINES: DeadlineItem[] = [
  {
    id: 's57_report',
    title: 'Section 57 Report to Superior',
    sectionCite: 'Section 57 of NDPS Act, 1985',
    deadlineHours: 48,
    isStatutory: true,
    isAdministrativeGuidance: false,
  },
  {
    id: 's42_50_copies',
    title: 'Grounds of Belief / Search Record to Superior',
    sectionCite: 'Sections 42(2) & 50(6) of NDPS Act, 1985',
    deadlineHours: 72,
    isStatutory: true,
    isAdministrativeGuidance: false,
  },
  {
    id: 'sample_dispatch_guidance',
    title: 'Sample Dispatch to Laboratory',
    sectionCite: 'Rule 13(1) NDPS Rules 2022 / NCB Field Handbook Item 29',
    deadlineHours: 72,
    isStatutory: false,
    isAdministrativeGuidance: true,
    guidanceNote:
      '⚠ ADMINISTRATIVE GUIDANCE ONLY. Rule 13(1) mandates dispatch "without any delay". 72h is internal NCB administrative guideline, not a statutory defense for accused.',
  },
  {
    id: 'rule14_lab_reports',
    title: 'Chemical Laboratory Reports (15 + 15 Days)',
    sectionCite: 'Rule 14 of NDPS Rules, 2022',
    deadlineHours: 360, // 15 days
    isStatutory: true,
    isAdministrativeGuidance: false,
  },
];

export function calculateRemainingHours(seizureIso: string, deadlineHours: number): {
  elapsedHours: number;
  remainingHours: number;
  isExpired: boolean;
} {
  const seizureTime = new Date(seizureIso).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - seizureTime);
  const elapsedHours = elapsedMs / (1000 * 3600);
  const remainingHours = Math.max(0, deadlineHours - elapsedHours);

  return {
    elapsedHours,
    remainingHours,
    isExpired: elapsedHours >= deadlineHours,
  };
}
