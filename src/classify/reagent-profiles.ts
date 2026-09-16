/**
 * Parinaam — Reagent Statistical Distributions & Reaction Profiles
 * Governed by spec/04-phase-3-classification.md & spec/reference-card-design.md
 *
 * Defines 2D (a*, b*) chroma space Gaussian distributions:
 *   mean: [mu_a, mu_b]
 *   covariance: [[var_a, cov_ab], [cov_ab, var_b]]
 *   prior: pi_k
 *
 * NOTE: Tramadol has no reliable colorimetric field test.
 * Calling classification on tramadol must abstain.
 */

import type { ReagentType } from '../types/domain.ts';

export type ReagentClass = 'POSITIVE' | 'NEGATIVE';

export interface ClassDistribution {
  name: ReagentClass;
  mean: [number, number]; // [a*, b*]
  covariance: [[number, number], [number, number]]; // 2x2 matrix
  prior: number;
}

export interface ReagentProfile {
  reagent: ReagentType;
  displayName: string;
  isTwoPhase: boolean; // Scott, Duquenois-Levine have CHCl3 lower phase
  targetLowerPhase: boolean; // Scott and Duquenois-Levine target lower layer
  abstainEntirely?: boolean; // Reagents without reliable field test
  classes: Record<ReagentClass, ClassDistribution>;
}

export const REAGENT_PROFILES: Record<ReagentType, ReagentProfile> = {
  marquis: {
    reagent: 'marquis',
    displayName: 'Marquis Reagent',
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [32.5, -14.2], // Characteristic deep purple / reddish-violet
        covariance: [
          [16.0, 2.5],
          [2.5, 14.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [-1.5, 11.8], // Pale yellow/unreacted
        covariance: [
          [8.0, 0.8],
          [0.8, 10.0],
        ],
        prior: 0.5,
      },
    },
  },
  mecke: {
    reagent: 'mecke',
    displayName: 'Mecke Reagent',
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [-24.0, -7.5], // Deep blue-green / teal
        covariance: [
          [14.0, 1.2],
          [1.2, 12.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [2.0, 8.5], // Faint greenish-yellow
        covariance: [
          [6.0, 0.5],
          [0.5, 8.0],
        ],
        prior: 0.5,
      },
    },
  },
  mandelin: {
    reagent: 'mandelin',
    displayName: 'Mandelin Reagent',
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [-8.5, 26.0], // Dark olive green
        covariance: [
          [12.0, -1.0],
          [-1.0, 15.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [4.2, 46.5], // Golden yellow / orange-yellow unreacted
        covariance: [
          [8.0, 1.5],
          [1.5, 12.0],
        ],
        prior: 0.5,
      },
    },
  },
  scott: {
    reagent: 'scott',
    displayName: 'Scott Reagent (Cobalt Thiocyanate)',
    isTwoPhase: true,
    targetLowerPhase: true, // Lower chloroform layer turns bright turquoise blue
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [-18.5, -31.0], // Brilliant blue in CHCl3
        covariance: [
          [12.0, 3.0],
          [3.0, 18.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [16.5, 3.5], // Pink / unextracted clear
        covariance: [
          [10.0, 1.0],
          [1.0, 8.0],
        ],
        prior: 0.5,
      },
    },
  },
  duquenois_levine: {
    reagent: 'duquenois_levine',
    displayName: 'Duquenois-Levine Reagent',
    isTwoPhase: true,
    targetLowerPhase: true, // Lower chloroform layer turns violet
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [27.0, -21.5], // Violet transferred to chloroform
        covariance: [
          [15.0, -2.0],
          [-2.0, 14.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [-5.0, 9.0], // Faint green / clear in bottom layer
        covariance: [
          [7.0, 0.5],
          [0.5, 9.0],
        ],
        prior: 0.5,
      },
    },
  },
  simons: {
    reagent: 'simons',
    displayName: "Simon's Reagent",
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [7.5, -41.0], // Vivid cobalt blue
        covariance: [
          [10.0, 2.0],
          [2.0, 16.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [-2.0, 5.5], // Colourless / faint straw yellow
        covariance: [
          [5.0, 0.2],
          [0.2, 6.0],
        ],
        prior: 0.5,
      },
    },
  },
  ehrlich: {
    reagent: 'ehrlich',
    displayName: 'Ehrlich Reagent',
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [29.5, -17.0], // Deep purple-violet
        covariance: [
          [14.0, 1.5],
          [1.5, 12.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [1.0, 9.0], // Pale yellow
        covariance: [
          [6.0, 0.4],
          [0.4, 7.0],
        ],
        prior: 0.5,
      },
    },
  },
  ferric_chloride: {
    reagent: 'ferric_chloride',
    displayName: 'Ferric Chloride Reagent',
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [-11.0, -13.5], // Blue-green phenolic complex
        covariance: [
          [11.0, 1.0],
          [1.0, 13.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [7.5, 23.0], // Brown-yellow unreacted
        covariance: [
          [8.0, 1.2],
          [1.2, 10.0],
        ],
        prior: 0.5,
      },
    },
  },
  nitric_acid: {
    reagent: 'nitric_acid',
    displayName: 'Nitric Acid Test',
    isTwoPhase: false,
    targetLowerPhase: false,
    classes: {
      POSITIVE: {
        name: 'POSITIVE',
        mean: [21.5, 41.0], // Orange to deep yellow
        covariance: [
          [13.0, 3.0],
          [3.0, 15.0],
        ],
        prior: 0.5,
      },
      NEGATIVE: {
        name: 'NEGATIVE',
        mean: [-0.5, 4.0], // Clear unreacted
        covariance: [
          [5.0, 0.3],
          [0.3, 5.0],
        ],
        prior: 0.5,
      },
    },
  },
};
