// Metro bundler stub for `node:sqlite` — same policy as node-crypto-stub.js:
// the specifier exists solely for the Node side of the driver seam (tests/tooling).
// Nothing may require this at app runtime; touching it throws loudly on purpose.
module.exports = new Proxy(
  {},
  {
    get(_t, prop) {
      throw new Error(
        `node:sqlite is not available in the React Native runtime (stubbed by metro.config.js). ` +
          `Requested property: ${String(prop)}. Use src/db/driver.ts openAppDatabase() instead.`
      );
    },
  }
);
