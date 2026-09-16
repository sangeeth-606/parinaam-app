/**
 * Parinaam — Polyfills for React Native 0.87 & Expo SDK 57
 * Returns console.js and error-guard.js from @react-native/js-polyfills.
 */
module.exports = function getPolyfills() {
  return [
    require.resolve('@react-native/js-polyfills/console.js'),
    require.resolve('@react-native/js-polyfills/error-guard.js'),
  ];
};
