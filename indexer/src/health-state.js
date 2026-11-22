/** @typedef {import('./types.js').HealthState} HealthState */

/** @type {HealthState} */
export const health = {
  lastIndexedAt: null,
  lastLedger: null,
  startedAt: Date.now(),
};
