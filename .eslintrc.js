module.exports = {
  root: true,
  // The rule messages below quote the forbidden strings on purpose — the linter must not
  // scan its own config for them.
  ignorePatterns: ['.eslintrc.js'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Literal[value=/Standing Order 1\\/88/i]',
        message:
          'Standing Order 1/88 was repealed on 23 Dec 2022. Cite Rule 10(2) of NDPS Rules 2022.',
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
    ],
  },
};
