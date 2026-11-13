// Runs the built package on old Node versions (no dev tooling needed) to back the
// "engines": ">=18" claim. Tests themselves need Node 22+ because of Vitest.
const assert = require("node:assert/strict");
const cal = require("../dist/index.cjs");

assert.equal(cal.isTradingDay("2026-04-03"), false); // Good Friday
assert.equal(cal.isTradingDay("2026-10-12"), true); // Columbus Day: stocks trade
assert.equal(cal.nextTradingDay("2026-07-02"), "2026-07-06");
assert.equal(cal.sessionClose("2026-11-27"), "13:00"); // day after Thanksgiving
assert.equal(cal.isMarketOpen(new Date("2026-03-09T13:45:00Z")), true); // 09:45 EDT
assert.equal(cal.isMarketOpen(new Date("2026-03-06T14:15:00Z")), false); // 09:15 EST
console.log(`dist OK on Node ${process.version}`);
