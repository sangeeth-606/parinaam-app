/**
 * Domain copy & formatting — the single source of truth for outcome language so no screen
 * free-types statutory strings again (audit HC3). Human readings FIRST (officer register),
 * exact enum constants SECOND (statutory register, mono). Never a substance name
 * (AGENTS.md hard constraint 7); never banned terms (spec/forbidden-claims.md).
 */

import type {
  AbstentionReason,
  PresumptiveOutcomeKind,
  ReagentType,
  SecurityLevel,
} from '../types/domain';

export type OutcomeTone = 'reaction' | 'noReaction' | 'attention';

/** Plain-language reading for the officer (primary register). */
export const OFFICER_READING: Record<PresumptiveOutcomeKind, string> = {
  CONSISTENT_WITH_REAGENT_POSITIVE: 'Reagent showed the expected colour response',
  CONSISTENT_WITH_REAGENT_NEGATIVE: 'No reagent colour response detected',
  INCONCLUSIVE: 'Inconclusive — laboratory confirmation required',
};

/** Short list-row variants of the same readings. */
export const OFFICER_READING_SHORT: Record<PresumptiveOutcomeKind, string> = {
  CONSISTENT_WITH_REAGENT_POSITIVE: 'Reagent response',
  CONSISTENT_WITH_REAGENT_NEGATIVE: 'No response',
  INCONCLUSIVE: 'Inconclusive',
};

export const ABSTENTION_COPY: Record<AbstentionReason, string> = {
  low_margin: 'Colour response sat within the ambiguous margin band',
  novelty_ood: 'Reaction fell outside calibrated models (novelty abstention)',
  calibration_failed:
    'Calibration residual exceeded the 4.0 ΔE00 gate — measurement refused',
};

export const outcomeTone = (kind: PresumptiveOutcomeKind): OutcomeTone => {
  switch (kind) {
    case 'CONSISTENT_WITH_REAGENT_POSITIVE':
      return 'reaction';
    case 'CONSISTENT_WITH_REAGENT_NEGATIVE':
      return 'noReaction';
    case 'INCONCLUSIVE':
      return 'attention';
  }
};

export const REAGENT_LABEL: Record<ReagentType, string> = {
  marquis: 'Marquis',
  mecke: 'Mecke',
  mandelin: 'Mandelin',
  scott: 'Scott',
  duquenois_levine: 'Duquenois–Levine',
  simons: 'Simons',
  ehrlich: 'Ehrlich',
  nitric_acid: 'Nitric acid',
  ferric_chloride: 'Ferric chloride',
};

export const GRADE_COPY: Record<'GOOD' | 'DEGRADED' | 'REJECT', { label: string; note: string }> = {
  GOOD: { label: 'GOOD', note: 'within the 2.5 ΔE00 master gate' },
  DEGRADED: { label: 'DEGRADED', note: '2.5–4.0 ΔE00 — inconclusive band widened' },
  REJECT: { label: 'REJECT', note: 'above the 4.0 ΔE00 gate — measurement refused' },
};

/** Integrity state uses ok/fail — NOT outcome tones. */
export const securityLevelCopy: Record<SecurityLevel, string> = {
  StrongBox: 'Hardware-backed keystore (StrongBox)',
  TrustedEnvironment: 'Hardware-backed keystore (TrustedEnvironment)',
  Software: 'Software keystore (no hardware isolation detected)',
};

/* ----------------------------- formatting ----------------------------- */

const IST_OFFSET_MIN = 330;

/** 24-hour IST rendering per spec (BSA certificates use IST time). */
export function formatIst(iso: string | number | Date): string {
  const d = new Date(iso);
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[ist.getUTCMonth()];
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${dd} ${mon} ${yyyy} · ${hh}:${mm}:${ss} IST`;
}

export function formatDateIst(iso: string | number | Date): string {
  return formatIst(iso).split(' · ')[0];
}

export function formatTimeIst(iso: string | number | Date): string {
  return formatIst(iso).split(' · ')[1] ?? '';
}

export function relativeIst(iso: string | number | Date): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} d ago`;
}

/** Hashes render abbreviated: `a1b2…f9e8` (H4). Tap-to-expand handled by HashChip. */
export function abbreviateHash(hex: string, head = 4, tail = 4): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

export function formatPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatDeltaE(v: number): string {
  return v.toFixed(2);
}

export function formatLab(lab: { l: number; a: number; b: number }): string {
  return `L* ${lab.l.toFixed(1)}  a* ${lab.a >= 0 ? '+' : ''}${lab.a.toFixed(1)}  b* ${
    lab.b >= 0 ? '+' : ''
  }${lab.b.toFixed(1)}`;
}
