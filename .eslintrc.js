/**
 * Parinaam lint — statutory guardrails (AGENTS.md §2).
 *
 * `no-restricted-syntax` with a `Literal` selector matches AST string/number literals only.
 * Comments are never matched, so a comment that *names* a forbidden phrase for the purpose
 * of explaining its removal is safe. This is why the rule messages below can quote the very
 * strings they ban, and why `ignorePatterns` only needs to exclude this file itself.
 */

// The four statutory bans that apply to every file in the repository.
const STATUTORY_BANS = [
  {
    selector: 'Literal[value=/Standing Order 1\\/88/i]',
    message:
      'Standing Order 1/88 was repealed on 23 Dec 2022. Cite Rule 10(2) of NDPS Rules 2022 (G.S.R. 899(E)).',
  },
  {
    selector: 'Literal[value=/digital.?signature/i]',
    message:
      'Device hardware keys are not statutory digital signatures under IT Act ss. 3/3A. Use "device attestation" or "integrity seal".',
  },
  {
    selector: 'Literal[value=/positive for|identified as|drug identification/i]',
    message:
      'Never assert substance identity. Use CONSISTENT_WITH_REAGENT_POSITIVE qualified by reagent name.',
  },
  {
    selector: 'Literal[value=/digital.?panch/i]',
    message:
      'Do not use "digital panch". Parliament added videography on top of civilian witnesses under BNSS s. 103/105, not instead of them.',
  },
];

/**
 * v4 phase 0 — two additional bans that apply ONLY to rendered UI strings.
 *
 * They must not be global: `SecurityLevel` legitimately contains the literal `'StrongBox'`
 * (src/types/domain.ts) and `probeHardwareSecurityLevel()` is *supposed* to return it once it
 * really probes. Banning the literal repo-wide would break the type and the prober. The defect
 * being guarded is a **screen asserting a hardware capability it never measured** (rule 10) or
 * calling a device integrity seal a "signature" (rule 6).
 */
const UI_HONESTY_BANS = [
  {
    selector: 'Literal[value=/cryptographically signed|signed by the device|device signed/i]',
    message:
      'Rule 6: the device key produces an integrity seal, never a signature. Say "hash-chained" or "device attestation".',
  },
  {
    selector: 'Literal[value=/StrongBox|hardware enclave|HARDWARE ENCLAVE/i]',
    message:
      'Rule 10: a screen may only name a hardware security tier that was actually probed. Derive the label from the recorded SecurityLevel instead of hardcoding it.',
  },
];

module.exports = {
  root: true,
  // This config quotes the forbidden strings on purpose — never scan itself.
  ignorePatterns: ['.eslintrc.js', 'camera-engine/**'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'no-restricted-syntax': ['error', ...STATUTORY_BANS],
  },
  overrides: [
    {
      // Rendered UI surfaces only. An `overrides` entry REPLACES the rule config for the
      // matched files rather than merging, so the statutory bans are repeated here.
      files: ['src/screens/**/*.tsx', 'src/components/**/*.tsx'],
      rules: {
        'no-restricted-syntax': ['error', ...STATUTORY_BANS, ...UI_HONESTY_BANS],
      },
    },
  ],
};